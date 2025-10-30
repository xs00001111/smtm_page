import { promises as fs } from 'fs'
import { dirname } from 'path'
import { env } from '@smtm/shared/env'
import { logger } from '../utils/logger'

type LinkRow = {
  created_at: string
  user_id: number
  polymarket_address?: string | null
  polymarket_username?: string | null
  kalshi_username?: string | null
}

const FILE = env.TELEGRAM_LINKS_FILE
const HEADER = 'created_at,user_id,polymarket_address,polymarket_username,kalshi_username\n'
let rows: LinkRow[] = []

async function ensureFile() {
  try {
    await fs.mkdir(dirname(FILE), { recursive: true })
    try {
      await fs.access(FILE)
    } catch {
      await fs.writeFile(FILE, HEADER)
    }
  } catch (e) {
    logger.error('Failed to ensure links file', e)
  }
}

async function save() {
  const lines = [HEADER]
  for (const r of rows) {
    const line = [
      r.created_at,
      String(r.user_id),
      r.polymarket_address ?? '',
      r.polymarket_username ?? '',
      r.kalshi_username ?? '',
    ].join(',')
    lines.push(line + '\n')
  }
  await fs.writeFile(FILE, lines.join(''))
}

export async function loadLinks() {
  await ensureFile()
  try {
    const text = await fs.readFile(FILE, 'utf8')
    const lines = text.split(/\r?\n/).filter(Boolean)
    rows = []
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(',')
      const row: LinkRow = {
        created_at: parts[0],
        user_id: Number(parts[1]),
        polymarket_address: parts[2] || undefined,
        polymarket_username: parts[3] || undefined,
        kalshi_username: parts[4] || undefined,
      }
      rows.push(row)
    }
    logger.info(`Loaded ${rows.length} links from CSV`)
  } catch (e) {
    logger.error('Failed to load links file', e)
  }
}

function getOrCreate(userId: number): LinkRow {
  let row = rows.find(r => r.user_id === userId)
  if (!row) {
    row = { created_at: new Date().toISOString(), user_id: userId }
    rows.push(row)
  }
  return row
}

export async function linkPolymarketAddress(userId: number, address: string) {
  const row = getOrCreate(userId)
  row.polymarket_address = address
  // If user had a username linked but now provided address, keep both; address is authoritative
  await save()
}

export async function linkPolymarketUsername(userId: number, username: string) {
  const row = getOrCreate(userId)
  row.polymarket_username = username
  await save()
}

export async function linkKalshiUsername(userId: number, username: string) {
  const row = getOrCreate(userId)
  row.kalshi_username = username
  await save()
}

export function getLinks(userId: number) {
  return rows.find(r => r.user_id === userId)
}

export async function unlinkAll(userId: number) {
  const before = rows.length
  rows = rows.filter(r => r.user_id !== userId)
  if (rows.length !== before) await save()
  return before - rows.length
}

// Helpers
export function parsePolymarketProfile(input: string): { address?: string, username?: string } | null {
  try {
    // e.g. https://polymarket.com/profile/0xabc... or https://polymarket.com/profile/%40Name?via...
    const u = new URL(input)
    if (!u.hostname.includes('polymarket.com')) return null
    const parts = u.pathname.split('/').filter(Boolean)
    if (parts.length >= 2 && parts[0] === 'profile') {
      const ident = decodeURIComponent(parts[1])
      if (/^0x[a-fA-F0-9]{40}$/.test(ident)) return { address: ident }
      // usernames come as @Name (encoded)
      const uname = ident.startsWith('@') ? ident.slice(1) : ident
      return { username: uname }
    }
  } catch {}
  return null
}

