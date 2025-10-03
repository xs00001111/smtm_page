import { NextResponse } from 'next/server'

// Lightweight integration check that writes a test entry
// to a separate CSV to avoid polluting the real waitlist.
// Env required: GITHUB_TOKEN, GITHUB_REPO (same as main waitlist)
// Optional: GITHUB_BRANCH (default: main), WAITLIST_TEST_FILE (default: data/waitlist_test.csv)
export async function GET() {
  try {
    const repo = process.env.GITHUB_REPO
    const token = process.env.GITHUB_TOKEN
    const branch = process.env.GITHUB_BRANCH || 'main'
    const path = process.env.WAITLIST_TEST_FILE || 'data/waitlist_test.csv'

    // If GitHub env not configured, report non-persistent mode
    if (!repo || !token) {
      return NextResponse.json({ ok: true, persistent: false, note: 'Missing GITHUB_* env; not writing' })
    }

    const apiBase = 'https://api.github.com'
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    }

    // Probe existing file to compute next position
    let sha: string | undefined
    let current = ''
    let position = 1
    const getRes = await fetch(`${apiBase}/repos/${repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(branch)}`, { headers })
    if (getRes.ok) {
      const json: any = await getRes.json()
      sha = json.sha
      const content = Buffer.from(json.content, 'base64').toString('utf-8')
      current = content
      const lines = content.trim() ? content.trim().split(/\r?\n/) : []
      const count = lines.length > 0 && lines[0].includes('email') ? Math.max(0, lines.length - 1) : lines.length
      position = count + 1
    } else if (getRes.status !== 404) {
      const text = await getRes.text()
      return NextResponse.json({ ok: false, error: `Storage read failed: ${text}` }, { status: 500 })
    }

    // Write a synthetic test entry
    const nowIso = new Date().toISOString()
    const testEmail = `integration-test+${Date.now()}@example.com`
    const row = `${nowIso},${testEmail}`
    const nextContent = current
      ? (current.trimEnd() + (current.endsWith('\n') ? '' : '\n') + row + '\n')
      : `timestamp,email\n${row}\n`

    const body = {
      message: `chore(waitlist-test): add ${testEmail}`,
      content: Buffer.from(nextContent, 'utf-8').toString('base64'),
      sha,
      branch,
    }
    const putRes = await fetch(`${apiBase}/repos/${repo}/contents/${encodeURIComponent(path)}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(body),
    })
    if (!putRes.ok) {
      const text = await putRes.text()
      return NextResponse.json({ ok: false, error: `Storage write failed: ${text}` }, { status: 500 })
    }

    return NextResponse.json({ ok: true, persistent: true, position, path })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: 'Malformed request' }, { status: 400 })
  }
}

