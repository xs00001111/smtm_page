# Trade API (Execution Service)

Purpose
- Receives signed trade requests and (in the future) places orders using stored credentials.
- Validates HMAC-signed requests from the bot/portal.
- Reads execution credentials from Google Secret Manager referenced by Supabase.

Deployment
- Intended to run on Google Cloud Run behind HTTPS.
- Not deployed on Netlify or Render; render.yaml includes only the bot worker and Netlify builds only `apps/web`.

Environment
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
- `GCP_PROJECT_ID` (or `GOOGLE_CLOUD_PROJECT`)
- `BOT_HMAC_KID` and `BOT_SHARED_SECRET`

Local Dev
- `npm run dev -w @smtm/trade-api`

Unit Tests
- `npm run test -w @smtm/trade-api`
- Tests use Vitest + Supertest and mock Supabase/Secret Manager. No external calls are made.

Security Notes
- Never commit real secrets. Provide values via env/Secret Manager in Cloud Run.
- All state-changing endpoints require HMAC headers.
