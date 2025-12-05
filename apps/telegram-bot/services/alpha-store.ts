import { env } from '@smtm/shared/env'
import { logger } from '../utils/logger'
import type { AlphaEvent } from './alpha-aggregator'

function supabaseAvailable() {
  return !!(env.SUPABASE_URL && (env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY))
}
function analyticsEnabled() {
  return env.SUPABASE_ANALYTICS_ENABLED === 'true'
}

let analyticsSchemaExposed: boolean | null = null
async function ensureAnalyticsSchemaExposed(): Promise<boolean> {
  if (analyticsSchemaExposed != null) return analyticsSchemaExposed
  try {
    // Probe a lightweight read to confirm analytics schema exposure
    await sb<any[]>(`alpha_view?select=alpha_event_id&limit=1`, undefined, 'analytics')
    analyticsSchemaExposed = true
  } catch (e) {
    const msg = (e as any)?.message || String(e)
    // PGRST106: schema not exposed in PostgREST config
    if (msg.includes('PGRST106') || msg.includes('schema must be one of')) {
      logger.warn('alpha:store analytics schema not exposed; configure Settings > API > Exposed schemas to include "analytics"')
      analyticsSchemaExposed = false
    } else {
      // Other errors: consider schema available but table may be missing; avoid flapping
      analyticsSchemaExposed = false
    }
  }
  return analyticsSchemaExposed
}

function key() { return env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY || '' }

async function sb<T>(path: string, init?: RequestInit, schema: string = 'public'): Promise<T> {
  const url = `${env.SUPABASE_URL}/rest/v1/${path}`
  const res = await fetch(url, {
    ...(init || {}),
    headers: {
      apikey: key(),
      Authorization: `Bearer ${key()}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      // PostgREST schema targeting: include Accept-Profile always; Content-Profile for writes
      'Accept-Profile': schema,
      ...(init?.method && init.method.toUpperCase() !== 'GET' ? { 'Content-Profile': schema } : {}),
      ...(init?.headers as any),
    },
  } as any)
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`)
  const ct = res.headers.get('content-type') || ''
  return (ct.includes('application/json') ? await res.json() : (undefined as any))
}

// Minimal shape for alpha_event when PostgREST schema cache is stale
function mapAlphaEventMinimal(ev: AlphaEvent) {
  return {
    kind: ev.kind,
    condition_id: ev.conditionId || null,
    token_id: ev.tokenId,
    alpha: Math.round(ev.alpha),
    meta: ev.data || {},
    market_title: ev.marketName || null,
  } as any
}

export async function persistAlphaEvent(ev: AlphaEvent): Promise<string | null> {
  const enabled = env.SUPABASE_ALPHA_ENABLED === 'true'
  const available = supabaseAvailable()
  if (!enabled || !available) {
    logger.debug(`alpha:store persist skipped enabled=${enabled} available=${available}`)
    return null
  }
  try {
    const body = [mapAlphaEvent(ev)]
    let rows: any[] = await sb('alpha_event', { method: 'POST', body: JSON.stringify(body) }, 'public')
    const id = rows && rows[0] && rows[0].id ? String(rows[0].id) : null
    logger.info(`alpha:store persisted (public) kind=${ev.kind} tokenId=${ev.tokenId} conditionId=${ev.conditionId || ''} alpha=${ev.alpha} id=${id}`)
    return id
  } catch (e) {
    const err = (e as any)?.message || String(e)
    logger.warn(`persistAlphaEvent failed err=${err} kind=${ev.kind} tokenId=${ev.tokenId} conditionId=${ev.conditionId || ''}`)
    // If the failure is due to schema cache not recognizing new columns (PGRST204), retry with minimal payload
    if (err.includes('PGRST204') || err.includes('schema cache') || err.includes("Could not find")) {
      try {
        const fallback = [mapAlphaEventMinimal(ev)]
        const rows2: any[] = await sb('alpha_event', { method: 'POST', body: JSON.stringify(fallback) }, 'public')
        const id2 = rows2 && rows2[0] && rows2[0].id ? String(rows2[0].id) : null
        logger.info(`alpha:store persisted (public) minimal id=${id2}`)
        return id2
      } catch (e2) {
        const err2 = (e2 as any)?.message || String(e2)
        logger.warn(`persistAlphaEvent minimal fallback failed err=${err2}`)
      }
    }
    return null
  }
}

export async function fetchRecentAlpha(opts?: { tokenIds?: string[]; conditionId?: string; limit?: number; maxAgeSec?: number; excludeIds?: string[]; onlyComplete?: boolean }): Promise<AlphaEvent[]> {
  const enabled = env.SUPABASE_ALPHA_ENABLED === 'true'
  const available = supabaseAvailable()
  if (!available || !enabled) {
    logger.info(`alpha:store fetch skipped enabled=${enabled} available=${available} url=${!!env.SUPABASE_URL} key=${!!(env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY)}`)
    return []
  }
  try {
    const limit = Math.min(Math.max(opts?.limit || 1, 1), 50)
    const maxAgeSec = Math.max(60, opts?.maxAgeSec || parseInt(env.ALPHA_FRESH_WINDOW_SECONDS || '600', 10))
    const sinceIso = new Date(Date.now() - maxAgeSec * 1000).toISOString()
    const params: string[] = [
      `select=id,kind,condition_id,token_id,wallet,alpha,whale_score,recommendation,notional_usd,cluster_count,cluster_duration_ms,skew,smart_pool_usd,direction,insider_score,created_at,side,price,size,trader_display_name,market_title,market_slug,market_url` ,
      `created_at=gt.${encodeURIComponent(sinceIso)}`,
      `order=created_at.desc` ,
      `limit=${limit}`
    ]
    // Exclude incomplete whale rows (from minimal fallback writes) unless explicitly disabled
    if (opts?.onlyComplete !== false) {
      // Keep smart_skew and insider as-is; require whale rows to have wallet, side, price, and notional_usd
      params.push(`or=(and(kind.eq.whale,side.not.is.null,price.not.is.null,notional_usd.not.is.null,wallet.not.is.null,condition_id.not.is.null),and(kind.eq.smart_skew),and(kind.eq.insider))`)
    }
    if (opts?.conditionId) params.push(`condition_id=eq.${encodeURIComponent(opts.conditionId)}`)
    if (opts?.tokenIds && opts.tokenIds.length) params.push(`token_id=in.(${opts.tokenIds.map(encodeURIComponent).join(',')})`)
    const path = `alpha_event?${params.join('&')}`
    logger.info(`alpha:store fetch path schema=public ${path}`)
    const rows = await sb<any[]>(path, undefined, 'public')
    logger.info(`alpha:store fetch ok rows=${rows?.length || 0}`)
    let events = rows.map(r => ({
      id: r.id ? String(r.id) : `${new Date(r.created_at).getTime()}-${r.token_id || ''}-${r.wallet || ''}-${r.alpha}`,
      ts: new Date(r.created_at).getTime(),
      kind: r.kind,
      tokenId: r.token_id,
      conditionId: r.condition_id,
      wallet: r.wallet,
      alpha: r.alpha,
      title: `${r.kind} alpha ${r.alpha}`,
      summary: '',
      data: r,
    } as AlphaEvent))
    if (opts?.excludeIds && opts.excludeIds.length) {
      const ex = new Set(opts.excludeIds.map(String))
      events = events.filter(e => !ex.has(e.id))
    }
    return events
  } catch (e) {
    const err = (e as any)?.message || String(e)
    logger.warn(`fetchRecentAlpha failed err=${err} enabled=${enabled} available=${available}`)
    return []
  }
}

// View tracking: record that a telegram user has seen an alpha event
export async function markAlphaSeen(params: { alphaId: string; telegramUserId: number; chatId?: number }): Promise<void> {
  const enabled = env.SUPABASE_ALPHA_ENABLED === 'true'
  if (!enabled || !supabaseAvailable() || !analyticsEnabled()) return
  if (!(await ensureAnalyticsSchemaExposed())) return
  try {
    logger.info(`alpha:store markAlphaSeen try alphaId=${params.alphaId} userId=${params.telegramUserId} chatId=${params.chatId ?? null}`)
    // Primary: write to analytics.alpha_view for per-user view tracking
    const viewBody = [{
      user_id: params.telegramUserId,
      chat_id: params.chatId ?? null,
      alpha_event_id: Number.isFinite(Number(params.alphaId)) ? Number(params.alphaId) : null,
      context: {}
    }]
    await sb('alpha_view', { method: 'POST', body: JSON.stringify(viewBody) }, 'analytics')
    logger.info('alpha:store markAlphaSeen ok (analytics.alpha_view)')
  } catch (e) {
    const err = (e as any)?.message || String(e)
    logger.warn(`alpha:store markAlphaSeen failed table=analytics.alpha_view err=${err} alphaId=${params.alphaId} userId=${params.telegramUserId}`)
    // Fallback: try analytics.alpha_click (legacy)
    try {
      const body2 = [{
        user_id: params.telegramUserId,
        chat_id: params.chatId ?? null,
        alpha_event_id: Number.isFinite(Number(params.alphaId)) ? Number(params.alphaId) : null,
        kind: 'view',
        context: {}
      }]
      await sb('alpha_click', { method: 'POST', body: JSON.stringify(body2) }, 'analytics')
      logger.info('alpha:store markAlphaSeen fallback analytics.alpha_click ok')
    } catch (e2) {
      const err2 = (e2 as any)?.message || String(e2)
      logger.warn(`alpha:store markAlphaSeen fallback analytics.alpha_click failed err=${err2}`)
    }
  }
}

// Fetch recently seen alpha ids for a user (to exclude from suggestions)
export async function fetchSeenAlphaIds(params: { telegramUserId: number; maxAgeSec?: number }): Promise<string[]> {
  const enabled = env.SUPABASE_ALPHA_ENABLED === 'true'
  if (!enabled || !supabaseAvailable() || !analyticsEnabled()) return []
  if (!(await ensureAnalyticsSchemaExposed())) return []
  try {
    const maxAgeSec = Math.max(60, params.maxAgeSec || parseInt(env.ALPHA_FRESH_WINDOW_SECONDS || '600', 10))
    const sinceIso = new Date(Date.now() - maxAgeSec * 1000).toISOString()
    // Primary: analytics.alpha_view
    const vrows = await sb<any[]>(`alpha_view?user_id=eq.${params.telegramUserId}&seen_at=gt.${encodeURIComponent(sinceIso)}&select=alpha_event_id`, undefined, 'analytics')
    let ids = (vrows || []).map((r:any)=> String(r.alpha_event_id)).filter(Boolean)
    // Merge alpha_click ids as well
    try {
      const crows = await sb<any[]>(`alpha_click?user_id=eq.${params.telegramUserId}&created_at=gt.${encodeURIComponent(sinceIso)}&select=alpha_event_id`, undefined, 'analytics')
      const ids2 = (crows || []).map((r:any)=> String(r.alpha_event_id)).filter(Boolean)
      ids = Array.from(new Set([...ids, ...ids2]))
    } catch {}
    return ids
  } catch (e) {
    const err = (e as any)?.message || String(e)
    logger.warn(`alpha:store fetchSeenAlphaIds failed table=analytics (view/click) err=${err}`)
    return []
  }
}

// Health check for the alpha store
export async function alphaStoreHealth(): Promise<{ enabled: boolean; available: boolean; canRead: boolean; reason?: string }> {
  const enabled = env.SUPABASE_ALPHA_ENABLED === 'true'
  const available = supabaseAvailable()
  if (!enabled) return { enabled, available, canRead: false, reason: 'SUPABASE_ALPHA_ENABLED is not true' }
  if (!available) return { enabled, available, canRead: false, reason: 'Missing SUPABASE_URL or key' }
  try {
    await sb<any[]>(`alpha_event?select=id&limit=1`, undefined, 'public')
    return { enabled, available, canRead: true }
  } catch (e) {
    return { enabled, available, canRead: false, reason: (e as any)?.message || String(e) }
  }
}

function mapAlphaEvent(ev: AlphaEvent) {
  const base: any = {
    kind: ev.kind,
    condition_id: ev.conditionId || null,
    token_id: ev.tokenId,
    wallet: ev.wallet || null,
    alpha: Math.round(ev.alpha),
    meta: ev.data || {},
    market_title: ev.marketName || null,
    market_slug: ev.marketSlug || null,
    market_url: ev.marketUrl || null,
  }
  if (ev.kind === 'whale') {
    base.whale_score = ev.data?.whaleScore ?? null
    base.recommendation = ev.data?.recommendation ?? null
    base.notional_usd = ev.data?.weightedNotionalUsd ?? null
    base.side = ev.data?.side ?? null
    base.price = ev.data?.price ?? null
    base.size = ev.data?.size ?? null
    base.trader_display_name = ev.data?.traderDisplayName ?? null
    base.cluster_count = ev.data?.cluster?.count ?? ev.data?.clusterCount ?? null
    base.cluster_duration_ms = ev.data?.cluster?.durationMs ?? ev.data?.clusterDurationMs ?? null
  } else if (ev.kind === 'smart_skew') {
    base.skew = ev.data?.skew ?? null
    base.skew_yes = ev.data?.skewYes ?? null
    base.smart_pool_usd = ev.data?.smartPoolUsd ?? null
    base.direction = ev.data?.direction ?? null
  } else if (ev.kind === 'insider') {
    base.insider_score = ev.data?.insider?.insiderScore ?? ev.alpha
    base.skew = ev.data?.skew?.skew ?? null
    base.direction = ev.data?.skew?.direction ?? null
    const c = ev.data?.cluster
    base.cluster_count = c?.count ?? null
    base.cluster_duration_ms = c?.durationMs ?? null
    base.notional_usd = c?.notionalUsd ?? null
    base.whale_score = ev.data?.insider?.meta?.whaleScore ?? null
  }
  return base
}
