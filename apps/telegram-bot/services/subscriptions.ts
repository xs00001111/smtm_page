import { promises as fs } from 'fs'
import { dirname } from 'path'
import { env } from '@smtm/shared/env'
import { logger } from '../utils/logger'
import { WebSocketMonitorService } from './websocket-monitor'

type StoredRow = {
  created_at: string
  user_id: number
  type: 'market' | 'whale'
  token_id: string
  market_condition_id?: string | null
  market_name: string
  threshold?: number
  min_trade_size?: number
  address_filter?: string | null
}

const FILE = env.TELEGRAM_SUBSCRIPTIONS_FILE
const HEADER = 'created_at,user_id,type,token_id,market_condition_id,market_name,threshold,min_trade_size,address_filter\n'
let rows: StoredRow[] = []

async function ensureFile() {
  try {
    await fs.mkdir(dirname(FILE), { recursive: true })
    try {
      await fs.access(FILE)
    } catch {
      await fs.writeFile(FILE, HEADER)
    }
  } catch (e) {
    logger.error('Failed to ensure subscriptions file', e)
  }
}

async function save() {
  const lines = [HEADER]
  for (const r of rows) {
    const line = [
      r.created_at,
      String(r.user_id),
      r.type,
      r.token_id,
      r.market_condition_id ?? '',
      r.market_name.replaceAll('\n', ' ').replaceAll(',', ' '),
      r.threshold != null ? String(r.threshold) : '',
      r.min_trade_size != null ? String(r.min_trade_size) : '',
      r.address_filter ?? '',
    ].join(',')
    lines.push(line + '\n')
  }
  await fs.writeFile(FILE, lines.join(''))
}

export async function loadSubscriptions(ws: WebSocketMonitorService) {
  await ensureFile()
  try {
    const text = await fs.readFile(FILE, 'utf8')
    const lines = text.split(/\r?\n/).filter(Boolean)
    rows = []
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(',')
      if (parts.length < 5) continue
      const row: StoredRow = {
        created_at: parts[0],
        user_id: Number(parts[1]),
        type: parts[2] as any,
        token_id: parts[3],
        market_condition_id: parts[4] || undefined,
        market_name: parts[5] || '',
        threshold: parts[6] ? Number(parts[6]) : undefined,
        min_trade_size: parts[7] ? Number(parts[7]) : undefined,
        address_filter: parts[8] || undefined,
      }
      rows.push(row)

      // Restore into WS monitor
      if (row.type === 'market') {
        if (!row.token_id) {
          // Pending market subscription by condition id
          if (row.market_condition_id) {
            ws.subscribePendingMarket(row.user_id, row.market_condition_id, row.market_name, row.threshold ?? 5)
          }
        } else {
          ws.subscribeToMarket(row.user_id, row.token_id, row.market_name, row.threshold ?? 5)
        }
      } else {
        if (!row.token_id && row.market_condition_id) {
          ws.subscribePendingWhale(
            row.user_id,
            row.market_condition_id,
            row.market_name,
            row.min_trade_size ?? 1000,
            row.address_filter || undefined
          )
        } else {
          ws.subscribeToWhaleTrades(
            row.user_id,
            row.token_id,
            row.market_name,
            row.min_trade_size ?? 1000,
            row.address_filter || undefined
          )
        }
      }
    }
    logger.info(`Loaded ${rows.length} subscriptions from CSV`)
  } catch (e) {
    logger.error('Failed to load subscriptions file', e)
  }
}

export async function addMarketSubscription(
  userId: number,
  tokenId: string,
  marketName: string,
  marketConditionId: string | null,
  threshold: number
) {
  rows.push({
    created_at: new Date().toISOString(),
    user_id: userId,
    type: 'market',
    token_id: tokenId || '',
    market_condition_id: marketConditionId || undefined,
    market_name: marketName,
    threshold,
  })
  await save()
}

export async function removeMarketSubscription(userId: number, tokenId: string) {
  rows = rows.filter((r) => !(r.type === 'market' && r.user_id === userId && r.token_id === tokenId))
  await save()
}

export async function updateMarketToken(userId: number, conditionId: string, tokenId: string) {
  let updated = false
  rows = rows.map((r) => {
    if (r.type === 'market' && r.user_id === userId && r.market_condition_id === conditionId && (!r.token_id || r.token_id === '')) {
      updated = true
      return { ...r, token_id: tokenId }
    }
    return r
  })
  if (updated) await save()
  return updated
}

export function getUserRows(userId: number) {
  return rows.filter(r => r.user_id === userId)
}

export async function removePendingMarketByCondition(userId: number, conditionId: string) {
  const before = rows.length
  rows = rows.filter(r => !(r.type==='market' && r.user_id===userId && (r.market_condition_id===conditionId)))
  if (rows.length !== before) await save()
  return before - rows.length
}

export async function removePendingWhaleByCondition(userId: number, conditionId: string, wallet?: string) {
  const before = rows.length
  rows = rows.filter(r => !(r.type==='whale' && r.user_id===userId && (r.market_condition_id===conditionId) && (!wallet || (r.address_filter||'').toLowerCase()===wallet.toLowerCase())))
  if (rows.length !== before) await save()
  return before - rows.length
}

export async function addWhaleSubscription(
  userId: number,
  tokenId: string,
  marketName: string,
  minTradeSize: number,
  addressFilter?: string,
  marketConditionId?: string
) {
  rows.push({
    created_at: new Date().toISOString(),
    user_id: userId,
    type: 'whale',
    token_id: tokenId || '',
    market_condition_id: marketConditionId || undefined,
    market_name: marketName,
    min_trade_size: minTradeSize,
    address_filter: addressFilter,
  })
  await save()
}

export async function removeWhaleSubscription(userId: number, tokenId: string) {
  rows = rows.filter((r) => !(r.type === 'whale' && r.user_id === userId && r.token_id === tokenId))
  await save()
}

export async function updateWhaleToken(userId: number, conditionId: string, tokenId: string) {
  let updated = false
  rows = rows.map((r) => {
    if (r.type === 'whale' && r.user_id === userId && r.market_condition_id === conditionId && (!r.token_id || r.token_id === '')) {
      updated = true
      return { ...r, token_id: tokenId }
    }
    return r
  })
  if (updated) await save()
  return updated
}
