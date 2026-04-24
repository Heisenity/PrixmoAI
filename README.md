# PrixmoAI

PrixmoAI is an AI-powered social content workspace for brands, creators, and marketing teams. It combines brand onboarding, content generation, image workflows, scheduling, analytics, billing, and profile intelligence in one product.

The repository is organized as a monorepo with:

- `client/` - React + Vite frontend
- `server/` - Express + TypeScript API and worker orchestration

## What The Product Does

PrixmoAI helps teams move from brand setup to publishing and performance review inside one workflow.

Core product areas include:

- Guided onboarding and brand profile setup
- AI-assisted industry mapping and brand description generation
- Content generation for captions, hashtags, scripts, and workspace drafts
- Image upload and AI image generation flows
- Social scheduling and Meta account connection
- Analytics dashboards and research views
- Billing and plan-aware usage controls
- Persistent brand memory and AI activity logging

## Tech Stack

### Frontend

- React 18
- TypeScript
- Vite
- React Router
- Framer Motion
- Supabase JS client

### Backend

- Node.js
- Express 5
- TypeScript
- Zod for validation
- Supabase for auth and data access
- BullMQ + Redis for queue-backed background work

### AI / Media Integrations

- Google Gemini
- Groq
- Hugging Face
- Cloudflare Worker image endpoint
- FLUX-compatible image generation endpoints
- AIMLAPI / Pixazo image integrations

### Platform Integrations

- Supabase
- Meta / Instagram / Facebook OAuth
- Redis / Upstash Redis
- R2-compatible object storage
- Razorpay billing webhook support

## Repository Structure

```text
PrixmoAI/
├── client/                  # React app
│   ├── public/
│   └── src/
│       ├── components/
│       ├── hooks/
│       ├── lib/
│       ├── pages/
│       └── types/
├── server/                  # Express API, AI flows, queues, migrations
│   ├── src/
│   │   ├── ai/
│   │   ├── config/
│   │   ├── controllers/
│   │   ├── db/
│   │   │   ├── migrations/
│   │   │   └── queries/
│   │   ├── middleware/
│   │   ├── routes/
│   │   ├── services/
│   │   └── types/
│   └── dist/
├── .env.example
├── package.json
└── README.md
```

## Main Application Routes

### Frontend Pages

- `/` - landing page
- `/login` - sign in
- `/signup` - account creation
- `/forgot-password`
- `/reset-password`
- `/onboarding` - protected onboarding flow
- `/app/generate` - AI content workspace
- `/app/dashboard`
- `/app/analytics`
- `/app/scheduler`
- `/app/billing`
- `/app/settings`

### Backend API Areas

- `/api/auth` - profile, onboarding, AI suggestions, username checks
- `/api/content` - content generation history and lifecycle
- `/api/generate` - workspace conversations, drafts, transcription
- `/api/images` - source image upload/import and image generation
- `/api/scheduler` - social accounts, drafts, scheduled posts, Meta OAuth
- `/api/analytics` - dashboard metrics and internal research endpoints
- `/api/billing` - plans, checkout, subscription sync, cancel
- `/api/runtime` - job runtime inspection and cancellation
- `/health` - health check

## Key Features

### 1. Brand Onboarding

The onboarding/settings experience captures a structured brand profile, including:

- brand name
- full name
- phone number
- username
- country and language
- website and logo
- primary / secondary brand colors
- primary and secondary industries
- target audience
- brand voice
- brand description

The onboarding flow also includes:

- AI industry suggestion
- AI brand description generation
- username availability checks and recommendations
- profile persistence and memory logging

### 2. Generate Workspace

The generate workspace is the main AI authoring surface. It supports:

- copy generation
- image generation
- draft description support
- audio transcription
- conversation-based workspace flows
- plan-aware feature gating

### 3. Scheduler

The scheduler supports:

- Meta OAuth connection
- Instagram and Facebook account linking
- media asset preparation
- scheduled post creation
- batch scheduling workflows
- publishing queue management

### 4. Analytics

The analytics area includes:

- KPI summaries
- chart-based engagement views
- history exploration
- platform filtering
- internal research endpoints for deeper analysis

### 5. Billing

Billing includes:

- plan catalog
- checkout
- subscription sync
- cancellation
- plan-based usage enforcement in generation flows

## AI Workflows

PrixmoAI uses structured prompts and validated request schemas to convert brand inputs into AI operations.

Examples:

- AI industry suggestion uses business problem text, brand name, website, optional social context, and the allowed industry catalog
- AI brand description generation uses brand name, industry, primary/secondary industries, brand voice, optional website, optional social context, and the short user brief
- Username recommendation uses desired username, brand name, full name, and email-local-part context

The backend uses provider fallback patterns where available. Current defaults in server config include:

- Gemini: `gemini-2.5-flash`
- Groq: `llama-3.3-70b-versatile`

## Workers And Runtime Behavior

The server can run both as an API and as a queue-backed worker host.

At startup it can optionally boot:

- content generation workers
- image generation workers
- scheduler publishing workers
- analytics sync workers

Important behavior:

- If Redis is missing, queue-backed runtime features are effectively disabled
- If Meta OAuth credentials are missing, Meta-dependent features remain idle
- Worker startup is controlled through environment flags

## Environment Variables

This project uses two env layers:

- `server/.env` for backend runtime
- client env for Vite

Start with:

- [`/.env.example`](./.env.example) as the backend template
- [`client/.env.example`](./client/.env.example)

### Backend Environment Categories

#### Core Infrastructure

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CLIENT_APP_URL`
- `SERVER_PUBLIC_URL`

#### Redis / Queue Runtime

- `REDIS_URL`
- `REDIS_TOKEN`
- `REDIS_TLS`
- `REDIS_KEY_PREFIX`
- `BULLMQ_PREFIX`
- `LOW_REDIS_COMMAND_MODE`
- `START_GENERATION_WORKERS_ON_BOOT`
- `START_BACKGROUND_WORKERS_ON_BOOT`

#### AI Providers

- `GEMINI_API_KEY`
- `GROQ_API_KEY`
- `HUGGINGFACE_API_KEY`
- provider/model timeout settings

#### Image Generation / Media

- `CLOUDFLARE_WORKER_API_KEY`
- `CLOUDFLARE_WORKER_IMAGE_URL`
- `FLUX_API_ENDPOINT`
- `FLUX_STATUS_ENDPOINT`
- `PIXAZO_API_KEY`
- `AIMLAPI_KEY`

#### Object Storage

- `R2_ACCOUNT_ID`
- `R2_S3_ENDPOINT`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_GENERATED_BUCKET`
- `R2_PUBLIC_BASE_URL`

#### Meta OAuth

- `META_FACEBOOK_APP_ID`
- `META_FACEBOOK_APP_SECRET`
- `META_INSTAGRAM_APP_ID`
- `META_INSTAGRAM_APP_SECRET`
- `META_OAUTH_STATE_SECRET`
- redirect URI variables

#### Billing

- billing/provider credentials depending on your deployment setup

### Frontend Environment

- `VITE_API_BASE_URL`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## Local Development

### Prerequisites

- Node.js 18+ recommended
- npm
- Supabase project
- Redis or Upstash Redis for queue-backed features
- At least one configured AI provider for meaningful generation features

### 1. Install Dependencies

From the monorepo root:

```bash
npm install
```

### 2. Configure Environment Files

Create and fill:

```bash
cp .env.example server/.env
cp client/.env.example client/.env
```

You will need real values for Supabase and whichever AI/storage integrations you want to use.

### 3. Apply Database Migrations

The SQL files under [`server/src/db/migrations`](./server/src/db/migrations) are the source of truth for schema changes.

This repository does not currently include a dedicated migration runner script. Apply the SQL files in order using your preferred Supabase/Postgres workflow, for example:

- Supabase SQL Editor
- `supabase db push` / migration tooling if your team already uses it
- direct Postgres execution in a controlled environment

If you are starting fresh, apply the migrations in numeric order.

### 4. Start The Backend

```bash
cd server
npm run dev
```

The API runs on:

- `http://localhost:5000`

Health check:

- `http://localhost:5000/health`

### 5. Start The Frontend

In a second terminal:

```bash
cd client
npm run dev
```

The Vite app runs on:

- `http://localhost:5173`

## Available Scripts

### Root

The root package is mainly used for npm workspaces.

```bash
npm install
```

### Client

```bash
cd client
npm run dev
npm run build
npm run preview
npm run typecheck
```

Optional Doppler-based variants:

```bash
npm run doppler:dev
npm run doppler:build
npm run doppler:typecheck
```

### Server

```bash
cd server
npm run dev
npm run build
npm run start
npm run typecheck
```

Optional Doppler-based variants:

```bash
npm run doppler:dev
npm run doppler:build
npm run doppler:start
npm run doppler:typecheck
```

## Suggested First-Time Setup Order

If you are onboarding a new developer, this order works well:

1. Clone the repository
2. Run `npm install` at the root
3. Fill `.env` and `client/.env`
4. Apply database migrations in order
5. Start the server
6. Start the client
7. Open `http://localhost:5173`
8. Create/sign in to a user account
9. Complete onboarding
10. Test generation, scheduling, and analytics features progressively based on which providers are configured

## Data And Migrations

The backend stores:

- brand profiles
- content history
- generated images
- scheduler data
- analytics data
- billing/subscription records
- brand memory events
- AI activity logs

Recent migrations also support:

- richer brand profile attributes
- structured industry data
- username uniqueness
- developer-facing AI activity logs

## Logging And Observability

The project currently supports two kinds of AI logging:

### Terminal Logs

The server prints live logs for:

- industry suggestion
- brand description generation
- username availability and recommendation

These logs help during local debugging and active development.

### Database Logs

The backend also persists certain AI activity for longer-term developer review. This is useful when you need:

- request/response tracing
- debugging after the fact
- product audit trails
- future analysis of AI-assisted workflows

## Deployment Notes

Before deploying to production, make sure:

- Supabase keys and URLs are configured correctly
- Redis is available if you depend on queued workloads
- at least one AI provider is configured
- Meta OAuth redirect URLs match the deployed backend URL
- object storage is configured for uploaded/generated media
- billing webhook handling matches your live billing environment

## Current Limitations

- No built-in automated migration runner is included in the repo today
- Several advanced features depend on third-party credentials to be useful
- Queue-backed behavior is reduced when Redis is not configured
- Some product areas are best exercised with real provider credentials rather than mock mode

## Contributing

When contributing:

- keep client and server changes scoped and well documented
- update migrations for any schema changes
- typecheck and build the affected package before opening a PR
- avoid committing secrets or real production env values
- prefer updating this README when setup expectations change

Recommended verification:

```bash
cd client && npm run typecheck && npm run build
cd ../server && npm run typecheck && npm run build
```

## Troubleshooting

### The client starts but authenticated features fail

Check:

- `VITE_API_BASE_URL`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

### The server starts but AI features do nothing useful

Check:

- `GEMINI_API_KEY`
- `GROQ_API_KEY`
- any provider-specific timeout/model settings

### Scheduling or background jobs do not run

Check:

- `REDIS_URL`
- worker startup flags
- Meta OAuth credentials for social publishing flows

### Uploaded or generated media fails

Check:

- R2/storage variables
- Cloudflare/FLUX/AIMLAPI/Pixazo credentials

### Onboarding or profile save fails after schema changes

Check:

- whether all recent SQL migrations were applied

## License

This repository currently does not declare a dedicated project license in the root metadata. Add one before public distribution if needed.
