create table if not exists public.archive_manifests (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  archive_provider text not null default 'r2',
  bucket text not null,
  object_key text not null,
  archive_key text not null unique,
  row_count integer not null default 0,
  oldest_created_at timestamptz,
  newest_created_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  archived_at timestamptz not null default timezone('utc', now())
);

create index if not exists archive_manifests_table_name_archived_at_idx
  on public.archive_manifests (table_name, archived_at desc);

alter table public.archive_manifests enable row level security;

create index if not exists scheduled_item_logs_created_at_idx
  on public.scheduled_item_logs (created_at desc);

create index if not exists brand_memory_generation_logs_created_at_idx
  on public.brand_memory_generation_logs (created_at desc);

create index if not exists analytics_learning_runs_completed_created_at_idx
  on public.analytics_learning_runs (created_at desc)
  where status in ('completed', 'failed');

create index if not exists industry_suggestion_logs_created_at_idx
  on public.industry_suggestion_logs (created_at desc);

create index if not exists brand_description_suggestion_logs_created_at_idx
  on public.brand_description_suggestion_logs (created_at desc);

create index if not exists username_recommendation_logs_created_at_idx
  on public.username_recommendation_logs (created_at desc);

create index if not exists usage_tracking_used_at_idx
  on public.usage_tracking (used_at desc);
