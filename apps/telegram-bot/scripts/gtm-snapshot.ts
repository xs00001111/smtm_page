import { ensureDailySnapshot, todayUtc } from '../services/gtm-store'

async function main() {
  try {
    const day = todayUtc()
    const row = await ensureDailySnapshot({ dayUtc: day })
    if (row) {
      console.log(`[gtm:snapshot] OK day=${row.day_utc} id=${row.id} traders=${Array.isArray(row.traders)?row.traders.length:'?'} created_at=${row.created_at}`)
    } else {
      console.error('[gtm:snapshot] failed to create or fetch snapshot')
      process.exit(1)
    }
  } catch (e: any) {
    console.error('[gtm:snapshot] error', e?.message || String(e))
    process.exit(1)
  }
}

main()

