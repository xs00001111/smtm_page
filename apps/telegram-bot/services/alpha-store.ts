import { env } from '@smtm/shared/env'
import { logger } from '../utils/logger'
import type { AlphaEvent } from './alpha-aggregator'

function supabaseAvailable() {
  return !!(env.SUPABASE_URL && (env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY))
}

function key() { return env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY || '' }

async function sb<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${env.SUPABASE_URL}/rest/v1/${path}`
  const res = await fetch(url, {
    ...(init || {}),
    headers: {
      apikey: key(),
      Authorization: `Bearer ${key()}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(init?.headers as any),
    },
  } as any)
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`)
  const ct = res.headers.get('content-type') || ''
  return (ct.includes('application/json') ? await res.json() : (undefined as any))
}

export async function persistAlphaEvent(ev: AlphaEvent): Promise<void> {
  const enabled = env.SUPABASE_ALPHA_ENABLED === 'true'
  const available = supabaseAvailable()
  if (!enabled || !available) {
    logger.info(`alpha:store persist skipped enabled=${enabled} available=${available} url=${!!env.SUPABASE_URL} key=${!!(env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY)}`)
    return
  }
  try {
    const body = [mapAlphaEvent(ev)]
    await sb('analytics.alpha_event', { method: 'POST', body: JSON.stringify(body) })
    logger.info(`alpha:store persisted kind=${ev.kind} tokenId=${ev.tokenId} conditionId=${ev.conditionId || ''} alpha=${ev.alpha}`)
  } catch (e) {
    const err = (e as any)?.message || String(e)
    logger.warn(`persistAlphaEvent failed err=${err} kind=${ev.kind} tokenId=${ev.tokenId} conditionId=${ev.conditionId || ''}`)
  }
}

export async function fetchRecentAlpha(opts?: { tokenIds?: string[]; conditionId?: string; limit?: number; maxAgeSec?: number }): Promise<AlphaEvent[]> {
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
      `select=kind,condition_id,token_id,wallet,alpha,whale_score,recommendation,notional_usd,cluster_count,cluster_duration_ms,skew,smart_pool_usd,direction,insider_score,created_at` ,
      `created_at=gt.${encodeURIComponent(sinceIso)}`,
      `order=created_at.desc` ,
      `limit=${limit}`
    ]
    if (opts?.conditionId) params.push(`condition_id=eq.${encodeURIComponent(opts.conditionId)}`)
    if (opts?.tokenIds && opts.tokenIds.length) params.push(`token_id=in.(${opts.tokenIds.map(encodeURIComponent).join(',')})`)
    const path = `analytics.alpha_event?${params.join('&')}`
    logger.info(`alpha:store fetch path ${path}`)
    const rows = await sb<any[]>(path)
    logger.info(`alpha:store fetch ok rows=${rows?.length || 0}`)
    return rows.map(r => ({
      id: `${new Date(r.created_at).getTime()}-${r.token_id || ''}-${r.wallet || ''}-${r.alpha}`,
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
  } catch (e) {
    const err = (e as any)?.message || String(e)
    logger.warn(`fetchRecentAlpha failed err=${err} enabled=${enabled} available=${available}`)
    return []
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
  }
  if (ev.kind === 'whale') {
    base.whale_score = ev.data?.whaleScore ?? null
    base.recommendation = ev.data?.recommendation ?? null
    base.notional_usd = ev.data?.weightedNotionalUsd ?? null
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
