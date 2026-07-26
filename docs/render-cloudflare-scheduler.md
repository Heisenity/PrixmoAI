# Render + Cloudflare Scheduled Publishing

PrixmoAI uses the existing Express backend, Supabase tables, and Meta publishing service. A Cloudflare Worker Cron Trigger wakes the Render backend every minute and calls the protected internal scheduler endpoint.

## Flow

```text
User schedules post → scheduled_posts.status = scheduled
Cloudflare Cron every minute → Render internal endpoint
Render claims due rows atomically → existing Meta publisher runs
Success → published
Temporary failure → failed with next_retry_at
Permanent failure → failed
```

## Render setup

Required server-side variables:

```env
CRON_SECRET=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

Keep `CRON_SECRET` and `SUPABASE_SERVICE_ROLE_KEY` only in Render/Doppler. Never expose them with `VITE_`, `NEXT_PUBLIC_`, `PUBLIC_`, screenshots, or Git.

Endpoints:

- `GET /health` returns a tiny safe health payload.
- `POST /api/internal/process-scheduled-posts` processes due scheduled posts.

Manual scheduler test:

```bash
curl -X POST "https://YOUR_RENDER_URL/api/internal/process-scheduled-posts" \
  -H "Authorization: Bearer YOUR_CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"source":"manual-test"}'
```

Verify Render health:

```bash
curl "https://YOUR_RENDER_URL/health"
```

## Database migration

Apply:

```text
server/src/db/migrations/034_render_cron_scheduler_processing.sql
```

It adds retry/processing metadata to `scheduled_posts`, extends the status check to include `processing`, and adds scheduler indexes. It does not delete existing scheduled-post data.

## Cloudflare setup

```bash
cd cloudflare/render-scheduler-worker
npm install
npx wrangler login
npx wrangler secret put CRON_SECRET
npx wrangler deploy
```

Set `RENDER_BACKEND_URL` in `wrangler.jsonc` or the Cloudflare dashboard. Set `CRON_SECRET` with Wrangler secrets only.

Cron schedule:

```cron
* * * * *
```

Check logs:

```bash
npx wrangler tail
```

## Development and verification

Backend:

```bash
npm run typecheck --workspace server
npm test --workspace server
npm run build --workspace server
```

Frontend:

```bash
npm run typecheck --workspace client
npm run build --workspace client
```

Worker:

```bash
cd cloudflare/render-scheduler-worker
npm install
npm run typecheck
```

The automated tests mock scheduler processing and never call real social media APIs.
