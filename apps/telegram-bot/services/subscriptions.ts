import { promises as fs } from 'fs'
import { dirname } from 'path'
import { env } from '@smtm/shared/env'
import { logger } from '../utils/logger'
import { WebSocketMonitorService } from './websocket-monitor'

type StoredRow = {
  created_at: string
  user_id: number
  type: 'market' | 'whale' | 'whale_all'
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

// Supabase helpers (via REST to avoid extra deps)
const SUPABASE_URL = env.SUPABASE_URL
const SUPABASE_KEY = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY

function supabaseAvailable() {
  return !!(SUPABASE_URL && SUPABASE_KEY)
}

async function sb<T>(path: string, init?: RequestInit): Promise<T> {
  if (!supabaseAvailable()) throw new Error('Supabase not configured')
  const url = `${SUPABASE_URL}/rest/v1/${path}`
  const res = await fetch(url, {
    ...(init || {}),
    headers: {
      apikey: SUPABASE_KEY!,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(init && init.headers ? init.headers : {}),
    },
  })
  if (!res.ok) {
    const text = await res.text().catch(()=> '')
    throw new Error(`Supabase ${res.status}: ${text.slice(0,200)}`)
  }
  // some DELETEs return empty body
  const ct = res.headers.get('content-type') || ''
  if (!ct.includes('application/json')) return undefined as any
  return (await res.json()) as T
}

async function ensureFile() {
  try {
    await fs.mkdir(dirname(FILE), { recursive: true })
    try {
      await fs.access(FILE)
    } catch {
      await fs.writeFile(FILE, HEADER)
    }
  } catch (e) {
    logger.error(e, 'Failed to ensure subscriptions file')
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
  if (supabaseAvailable()) {
    try {
      const data = await sb<any[]>(`tg_follows?select=*`)
      rows = (data || []).map((r) => ({
        created_at: r.created_at,
        user_id: Number(r.user_id),
        type: (r.kind === 'whale' || r.kind === 'whale_all') ? (r.kind as any) : 'market',
        token_id: r.token_id || '',
        market_condition_id: r.market_condition_id || undefined,
        market_name: r.market_name || '',
        threshold: r.threshold != null ? Number(r.threshold) : undefined,
        min_trade_size: r.min_trade_size != null ? Number(r.min_trade_size) : undefined,
        address_filter: r.address_filter || undefined,
      }))
      let restored = 0
      for (const row of rows) {
        if (row.type === 'market') {
          if (!row.token_id && row.market_condition_id) {
            ws.subscribePendingMarket(row.user_id, row.market_condition_id, row.market_name, row.threshold ?? 5)
          } else if (row.token_id) {
            ws.subscribeToMarket(row.user_id, row.token_id, row.market_name, row.threshold ?? 5)
          }
        } else if (row.type === 'whale_all') {
          if (row.address_filter) {
            ws.subscribeToWhaleTradesAll(row.user_id, row.address_filter, row.min_trade_size ?? 1000)
          }
        } else if (row.type === 'whale') {
          if (!row.token_id && row.market_condition_id) {
            ws.subscribePendingWhale(row.user_id, row.market_condition_id, row.market_name, row.min_trade_size ?? 1000, row.address_filter || undefined)
          } else if (row.token_id) {
            ws.subscribeToWhaleTrades(row.user_id, row.token_id, row.market_name, row.min_trade_size ?? 1000, row.address_filter || undefined)
          }
        }
        restored++
      }
      logger.info(`Loaded ${restored} subscriptions from Supabase`)
      return
    } catch (e) {
      logger.error(e, 'Failed to load subscriptions from Supabase, falling back to CSV')
    }
  }
  // Fallback to CSV
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
      if (row.type === 'market') {
        if (!row.token_id) {
          if (row.market_condition_id) ws.subscribePendingMarket(row.user_id, row.market_condition_id, row.market_name, row.threshold ?? 5)
        } else {
          ws.subscribeToMarket(row.user_id, row.token_id, row.market_name, row.threshold ?? 5)
        }
      } else if (row.type === 'whale_all') {
        if (row.address_filter) ws.subscribeToWhaleTradesAll(row.user_id, row.address_filter, row.min_trade_size ?? 1000)
      } else {
        if (!row.token_id && row.market_condition_id) {
          ws.subscribePendingWhale(row.user_id, row.market_condition_id, row.market_name, row.min_trade_size ?? 1000, row.address_filter || undefined)
        } else {
          ws.subscribeToWhaleTrades(row.user_id, row.token_id, row.market_name, row.min_trade_size ?? 1000, row.address_filter || undefined)
        }
      }
    }
    logger.info(`Loaded ${rows.length} subscriptions from CSV`)
  } catch (e) {
    logger.error(e, 'Failed to load subscriptions file')
  }
}

export async function addMarketSubscription(
  userId: number,
  tokenId: string,
  marketName: string,
  marketConditionId: string | null,
  threshold: number
) {
  if (supabaseAvailable()) {
    try {
      await sb('tg_follows?on_conflict=user_id,kind,token_id,market_condition_id,address_filter', {
        method: 'POST',
        body: JSON.stringify([
          {
            user_id: userId,
            kind: 'market',
            token_id: tokenId || null,
            market_condition_id: marketConditionId || null,
            market_name: marketName,
            threshold,
          },
        ]),
      })
      return
    } catch (e) {
      logger.error(e, 'Supabase addMarketSubscription failed, falling back to CSV')
    }
  }
  rows.push({ created_at: new Date().toISOString(), user_id: userId, type: 'market', token_id: tokenId || '', market_condition_id: marketConditionId || undefined, market_name: marketName, threshold })
  await save()
}

export async function removeMarketSubscription(userId: number, tokenId: string) {
  if (supabaseAvailable()) {
    try {
      await sb(`tg_follows?user_id=eq.${userId}&kind=eq.market&token_id=eq.${tokenId}`, { method: 'DELETE' })
      return
    } catch (e) {
      logger.error(e, 'Supabase removeMarketSubscription failed, falling back to CSV')
    }
  }
  rows = rows.filter((r) => !(r.type === 'market' && r.user_id === userId && r.token_id === tokenId))
  await save()
}

export async function updateMarketToken(userId: number, conditionId: string, tokenId: string) {
  if (supabaseAvailable()) {
    try {
      await sb(`tg_follows?user_id=eq.${userId}&kind=eq.market&market_condition_id=eq.${conditionId}&token_id=is.null`, { method: 'PATCH', body: JSON.stringify({ token_id: tokenId }) })
      return true
    } catch (e) {
      logger.error(e, 'Supabase updateMarketToken failed, falling back to CSV')
    }
  }
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

export async function getUserRows(userId: number): Promise<StoredRow[]> {
  // Fetch fresh data from Supabase if available
  if (supabaseAvailable()) {
    try {
      const data = await sb<any[]>(`tg_follows?user_id=eq.${userId}&select=*`)
      return (data || []).map((r) => ({
        created_at: r.created_at,
        user_id: Number(r.user_id),
        type: (r.kind === 'whale' || r.kind === 'whale_all') ? (r.kind as any) : 'market',
        token_id: r.token_id || '',
        market_condition_id: r.market_condition_id || undefined,
        market_name: r.market_name || '',
        threshold: r.threshold != null ? Number(r.threshold) : undefined,
        min_trade_size: r.min_trade_size != null ? Number(r.min_trade_size) : undefined,
        address_filter: r.address_filter || undefined,
      }))
    } catch (e) {
      logger.error(e, 'Supabase getUserRows failed, falling back to in-memory')
      // Fall back to in-memory
    }
  }
  // Fall back to in-memory rows
  return rows.filter(r => r.user_id === userId)
}

export async function removePendingMarketByCondition(userId: number, conditionId: string) {
  if (supabaseAvailable()) {
    try {
      await sb(`tg_follows?user_id=eq.${userId}&kind=eq.market&market_condition_id=eq.${conditionId}&token_id=is.null`, { method: 'DELETE' })
      return 1
    } catch (e) {
      logger.error(e, 'Supabase removePendingMarketByCondition failed, falling back to CSV')
    }
  }
  const before = rows.length
  rows = rows.filter(r => !(r.type==='market' && r.user_id===userId && (r.market_condition_id===conditionId)))
  if (rows.length !== before) await save()
  return before - rows.length
}

export async function removePendingWhaleByCondition(userId: number, conditionId: string, wallet?: string) {
  if (supabaseAvailable()) {
    try {
      const walletFilter = wallet ? `&address_filter=eq.${wallet}` : ''
      await sb(`tg_follows?user_id=eq.${userId}&kind=eq.whale&market_condition_id=eq.${conditionId}${walletFilter}&token_id=is.null`, { method: 'DELETE' })
      return 1
    } catch (e) {
      logger.error(e, 'Supabase removePendingWhaleByCondition failed, falling back to CSV')
    }
  }
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
  if (supabaseAvailable()) {
    try {
      await sb('tg_follows?on_conflict=user_id,kind,token_id,market_condition_id,address_filter', {
        method: 'POST',
        body: JSON.stringify([
          {
            user_id: userId,
            kind: 'whale',
            token_id: tokenId || null,
            market_condition_id: marketConditionId || null,
            market_name: marketName,
            min_trade_size: minTradeSize,
            address_filter: addressFilter || null,
          },
        ]),
      })
      return
    } catch (e) {
      logger.error(e, 'Supabase addWhaleSubscription failed, falling back to CSV')
    }
  }
  rows.push({ created_at: new Date().toISOString(), user_id: userId, type: 'whale', token_id: tokenId || '', market_condition_id: marketConditionId || undefined, market_name: marketName, min_trade_size: minTradeSize, address_filter: addressFilter })
  await save()
}

export async function removeWhaleSubscription(userId: number, tokenId: string) {
  if (supabaseAvailable()) {
    try {
      await sb(`tg_follows?user_id=eq.${userId}&kind=eq.whale&token_id=eq.${tokenId}`, { method: 'DELETE' })
      return
    } catch (e) {
      logger.error(e, 'Supabase removeWhaleSubscription failed, falling back to CSV')
    }
  }
  rows = rows.filter((r) => !(r.type === 'whale' && r.user_id === userId && r.token_id === tokenId))
  await save()
}

export async function updateWhaleToken(userId: number, conditionId: string, tokenId: string) {
  if (supabaseAvailable()) {
    try {
      await sb(`tg_follows?user_id=eq.${userId}&kind=eq.whale&market_condition_id=eq.${conditionId}&token_id=is.null`, { method: 'PATCH', body: JSON.stringify({ token_id: tokenId }) })
      return true
    } catch (e) {
      logger.error(e, 'Supabase updateWhaleToken failed, falling back to CSV')
    }
  }
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

export async function addWhaleSubscriptionAll(
  userId: number,
  addressFilter: string,
  minTradeSize: number
) {
  if (supabaseAvailable()) {
    try {
      await sb('tg_follows?on_conflict=user_id,kind,token_id,market_condition_id,address_filter', {
        method: 'POST',
        body: JSON.stringify([
          {
            user_id: userId,
            kind: 'whale_all',
            token_id: null,
            market_condition_id: null,
            market_name: 'All Markets',
            min_trade_size: minTradeSize,
            address_filter: addressFilter,
          },
        ]),
      })
      return
    } catch (e) {
      logger.error(e, 'Supabase addWhaleSubscriptionAll failed, falling back to CSV')
    }
  }
  rows.push({ created_at: new Date().toISOString(), user_id: userId, type: 'whale_all', token_id: '', market_name: 'All Markets', min_trade_size: minTradeSize, address_filter: addressFilter })
  await save()
}

export async function removeWhaleSubscriptionAll(userId: number, addressFilter: string) {
  if (supabaseAvailable()) {
    try {
      await sb(`tg_follows?user_id=eq.${userId}&kind=eq.whale_all&address_filter=eq.${addressFilter}`, { method: 'DELETE' })
      return
    } catch (e) {
      logger.error(e, 'Supabase removeWhaleSubscriptionAll failed, falling back to CSV')
    }
  }
  rows = rows.filter((r) => !(r.type === 'whale_all' && r.user_id === userId && (r.address_filter || '').toLowerCase() === addressFilter.toLowerCase()))
  await save()
}
