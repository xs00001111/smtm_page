# Link API (Execution Link Service)

Purpose
- Stores and manages encrypted execution credentials for a Telegram user.
- Validates HMAC-signed requests from the portal service.
- Persists a linkage reference in Supabase and stores credentials in Google Secret Manager.

Deployment
- Intended to run on Google Cloud Run behind HTTPS.
- Not deployed on Netlify or Render; render.yaml includes only the bot worker and Netlify builds only `apps/web`.

Environment
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
- `GCP_PROJECT_ID` (or `GOOGLE_CLOUD_PROJECT`)
- `PORTAL_HMAC_KID` and `PORTAL_SHARED_SECRET`

Local Dev
- `npm run dev -w @smtm/link-api`

Unit Tests
- `npm run test -w @smtm/link-api`
- Tests use Vitest + Supertest and mock Supabase/Secret Manager. No external calls are made.

Security Notes
- Never commit real secrets. Provide values via env/Secret Manager in Cloud Run.
- All state-changing endpoints require HMAC headers.
