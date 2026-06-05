create table if not exists public.admin_access_grants (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  granted_user_id uuid references auth.users(id) on delete set null,
  role text not null default 'support'
    check (role in ('admin2', 'support', 'analytics', 'readonly', 'custom')),
  permissions jsonb not null default '[]'::jsonb,
  notes text,
  created_by_user_id uuid references auth.users(id) on delete set null,
  revoked_by_user_id uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists admin_access_grants_active_email_key
  on public.admin_access_grants (lower(email))
  where revoked_at is null;

create index if not exists admin_access_grants_email_idx
  on public.admin_access_grants (lower(email), revoked_at);

create index if not exists admin_access_grants_granted_user_id_idx
  on public.admin_access_grants (granted_user_id, revoked_at);

drop trigger if exists set_admin_access_grants_updated_at
  on public.admin_access_grants;
create trigger set_admin_access_grants_updated_at
before update on public.admin_access_grants
for each row
execute function public.set_updated_at();

alter table public.admin_access_grants enable row level security;

create table if not exists public.admin_health_events (
  id uuid primary key default gen_random_uuid(),
  event text not null,
  level text not null default 'info'
    check (level in ('info', 'warn', 'error')),
  request_id text,
  user_id uuid references auth.users(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  plan text,
  provider text,
  platform text,
  queue text,
  job_id text,
  failure_kind text,
  retryable boolean,
  payload jsonb not null default '{}'::jsonb,
  reviewed_at timestamptz,
  reviewed_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists admin_health_events_created_at_idx
  on public.admin_health_events (created_at desc);

create index if not exists admin_health_events_event_idx
  on public.admin_health_events (event, created_at desc);

create index if not exists admin_health_events_level_idx
  on public.admin_health_events (level, created_at desc);

create index if not exists admin_health_events_user_id_idx
  on public.admin_health_events (user_id, created_at desc);

create index if not exists admin_health_events_queue_idx
  on public.admin_health_events (queue, created_at desc)
  where queue is not null;

create index if not exists admin_health_events_job_id_idx
  on public.admin_health_events (job_id, created_at desc)
  where job_id is not null;

alter table public.admin_health_events enable row level security;

create table if not exists public.admin_safe_action_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  target_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  status text not null default 'completed'
    check (status in ('completed', 'failed')),
  request_payload jsonb not null default '{}'::jsonb,
  result_payload jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists admin_safe_action_logs_created_at_idx
  on public.admin_safe_action_logs (created_at desc);

create index if not exists admin_safe_action_logs_actor_idx
  on public.admin_safe_action_logs (actor_user_id, created_at desc);

create index if not exists admin_safe_action_logs_target_idx
  on public.admin_safe_action_logs (target_user_id, created_at desc);

alter table public.admin_safe_action_logs enable row level security;
