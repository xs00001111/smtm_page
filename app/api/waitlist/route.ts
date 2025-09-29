import { NextResponse } from 'next/server'

// Saves waitlist entries to GitHub as a CSV file when configured via env vars.
// Env required: GITHUB_TOKEN (repo content write), GITHUB_REPO (e.g. owner/name)
// Optional: GITHUB_BRANCH (default: main), WAITLIST_FILE (default: data/waitlist.csv)
export async function POST(req: Request) {
  try {
    const { email } = await req.json()
    const valid = typeof email === 'string' && /.+@.+\..+/.test(email)
    if (!valid) return NextResponse.json({ error: 'Invalid email' }, { status: 400 })

    const repo = process.env.GITHUB_REPO
    const token = process.env.GITHUB_TOKEN
    const branch = process.env.GITHUB_BRANCH || 'main'
    const path = process.env.WAITLIST_FILE || 'data/waitlist.csv'

    // If GitHub env not configured, accept without persistence (temporary fallback)
    if (!repo || !token) {
      return NextResponse.json({ ok: true, position: null })
    }

    const apiBase = 'https://api.github.com'
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    }

    // 1) Try to read existing file to compute position and append
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
      // If header present, subtract 1
      const count = lines.length > 0 && lines[0].includes('email') ? Math.max(0, lines.length - 1) : lines.length
      position = count + 1
    } else if (getRes.status !== 404) {
      const text = await getRes.text()
      return NextResponse.json({ error: `Storage read failed: ${text}` }, { status: 500 })
    }

    const nowIso = new Date().toISOString()
    const row = `${nowIso},${email}`
    const nextContent = current
      ? (current.trimEnd() + (current.endsWith('\n') ? '' : '\n') + row + '\n')
      : `timestamp,email\n${row}\n`

    const body = {
      message: `chore(waitlist): add ${email}`,
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
      return NextResponse.json({ error: `Storage write failed: ${text}` }, { status: 500 })
    }

    return NextResponse.json({ ok: true, position })
  } catch (e: any) {
    return NextResponse.json({ error: 'Malformed request' }, { status: 400 })
  }
}
