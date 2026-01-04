import assert from 'node:assert'
import { ensureCsrf, parseInitData } from '../app/link/helpers'

// Mock storage implementing getItem/setItem
class MemStorage {
  map = new Map<string, string>()
  getItem(k: string) { return this.map.get(k) || '' }
  setItem(k: string, v: string) { this.map.set(k, v) }
}

function test(name: string, fn: () => void) {
  try { fn(); console.log(`✓ ${name}`) } catch (e) { console.error(`✗ ${name}`); throw e }
}

test('ensureCsrf generates and persists a token', () => {
  const s = new MemStorage()
  const t1 = ensureCsrf(s as any)
  assert.ok(t1 && typeof t1 === 'string')
  const t2 = ensureCsrf(s as any)
  assert.equal(t1, t2)
})

test('parseInitData reads from Telegram WebApp.initData', () => {
  const win = { Telegram: { WebApp: { initData: 'TG_PROOF' } } }
  const v = parseInitData(win as any, 'https://example.com/link/exec')
  assert.equal(v, 'TG_PROOF')
})

test('parseInitData falls back to tg_init query', () => {
  const v = parseInitData({}, 'https://example.com/link/exec?tg_init=TEST')
  assert.equal(v, 'TEST')
})

console.log('All tests passed')

