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

    // Helper function to fetch current file state
    async function fetchCurrentFile() {
      const getRes = await fetch(
        `${apiBase}/repos/${repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(branch)}`,
        { headers }
      )

      if (getRes.ok) {
        const json: any = await getRes.json()
        const content = Buffer.from(json.content, 'base64').toString('utf-8')
        const lines = content.trim() ? content.trim().split(/\r?\n/) : []
        const count = lines.length > 0 && lines[0].includes('email') ? Math.max(0, lines.length - 1) : lines.length
        return {
          sha: json.sha,
          current: content,
          position: count + 1
        }
      } else if (getRes.status === 404) {
        return {
          sha: undefined,
          current: '',
          position: 1
        }
      } else {
        const text = await getRes.text()
        throw new Error(`Storage read failed: ${text}`)
      }
    }

    // Retry logic with exponential backoff for SHA conflicts
    const MAX_RETRIES = 3
    let lastError: string = ''

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        // Fetch fresh file state on each attempt
        const { sha, current, position } = await fetchCurrentFile()

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

        if (putRes.ok) {
          // Success!
          return NextResponse.json({ ok: true, persistent: true, position, path })
        }

        // Handle 409 conflict (stale SHA) - retry with fresh SHA
        if (putRes.status === 409) {
          lastError = `SHA conflict on attempt ${attempt + 1}`
          console.warn(`${lastError}, retrying...`)

          // Exponential backoff: 100ms, 200ms, 400ms
          const backoffMs = 100 * Math.pow(2, attempt)
          await new Promise(resolve => setTimeout(resolve, backoffMs))
          continue
        }

        // Other errors - don't retry
        const text = await putRes.text()
        return NextResponse.json({ ok: false, error: `Storage write failed: ${text}` }, { status: 500 })

      } catch (err: any) {
        lastError = err.message
        // If it's a fetch error for current file, propagate immediately
        if (lastError.includes('Storage read failed')) {
          return NextResponse.json({ ok: false, error: lastError }, { status: 500 })
        }
      }
    }

    // All retries exhausted
    return NextResponse.json({
      ok: false,
      error: `Failed after ${MAX_RETRIES} attempts: ${lastError}`
    }, { status: 500 })

  } catch (e: any) {
    return NextResponse.json({ ok: false, error: 'Malformed request' }, { status: 400 })
  }
}

