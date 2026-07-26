# PrixmoAI Render Scheduler Worker

Cloudflare Worker Cron Trigger that wakes the Render backend and asks it to process due scheduled posts.

## Configuration

Set `RENDER_BACKEND_URL` in `wrangler.jsonc` or as a Worker variable:

```jsonc
"vars": {
  "RENDER_BACKEND_URL": "https://YOUR_RENDER_SERVICE.onrender.com"
}
```

Set the secret only in Cloudflare:

```bash
npx wrangler secret put CRON_SECRET
```

Use the same `CRON_SECRET` value in Render/Doppler for the backend.

## Deploy

```bash
cd cloudflare/render-scheduler-worker
npm install
npx wrangler login
npx wrangler secret put CRON_SECRET
npx wrangler deploy
```

## Verify

```bash
npx wrangler tail
```

The Cron Trigger runs every minute with:

```cron
* * * * *
```

Never commit real secrets or paste them into screenshots.
