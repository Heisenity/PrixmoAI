type Env = {
  RENDER_BACKEND_URL: string;
  CRON_SECRET: string;
};

type ScheduledController = {
  cron: string;
  scheduledTime: number;
};

type WorkerExecutionContext = {
  waitUntil(promise: Promise<unknown>): void;
};

const USER_AGENT = 'PrixmoAI-Cloudflare-Scheduler/1.0';
const REQUEST_TIMEOUT_MS = 25_000;
const MAX_ERROR_LOG_CHARS = 500;

const json = (payload: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(payload), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');

const readLimitedText = async (response: Response) => {
  try {
    return (await response.text()).slice(0, MAX_ERROR_LOG_CHARS);
  } catch {
    return '';
  }
};

const callRenderScheduler = async (env: Env, triggeredAt: string) => {
  const backendUrl = trimTrailingSlash(env.RENDER_BACKEND_URL || '');

  if (!backendUrl || !env.CRON_SECRET) {
    throw new Error('Worker scheduler configuration is incomplete.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${backendUrl}/api/internal/process-scheduled-posts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.CRON_SECRET}`,
        'Content-Type': 'application/json',
        'User-Agent': USER_AGENT,
      },
      body: JSON.stringify({
        source: 'cloudflare-cron',
        triggeredAt,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      console.error(JSON.stringify({
        event: 'scheduler_call_failed',
        status: response.status,
        body: await readLimitedText(response),
      }));
      return;
    }

    console.log(JSON.stringify({
      event: 'scheduler_call_completed',
      status: response.status,
    }));
  } finally {
    clearTimeout(timeout);
  }
};

export default {
  async fetch(_request: Request, env: Env): Promise<Response> {
    return json({
      status: 'healthy',
      service: 'prixmoai-render-scheduler-worker',
      configured: Boolean(env.RENDER_BACKEND_URL),
      timestamp: new Date().toISOString(),
    });
  },

  async scheduled(
    event: ScheduledController,
    env: Env,
    ctx: WorkerExecutionContext
  ): Promise<void> {
    const triggeredAt = new Date(event.scheduledTime).toISOString();

    console.log(JSON.stringify({
      event: 'scheduler_cron_started',
      cron: event.cron,
      triggeredAt,
    }));

    ctx.waitUntil(callRenderScheduler(env, triggeredAt));
  },
};
