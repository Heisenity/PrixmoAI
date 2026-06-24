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
