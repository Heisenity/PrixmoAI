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

alter table public.generate_messages
  add column if not exists archived_at timestamptz,
  add column if not exists archive_manifest_id uuid references public.archive_manifests(id) on delete set null,
  add column if not exists archive_key text,
  add column if not exists content_preview text;

create index if not exists generate_messages_archive_candidate_idx
  on public.generate_messages (created_at asc)
  where archived_at is null;

alter table public.generated_assets
  add column if not exists archived_at timestamptz,
  add column if not exists archive_manifest_id uuid references public.archive_manifests(id) on delete set null,
  add column if not exists archive_key text;

create index if not exists generated_assets_archive_candidate_idx
  on public.generated_assets (created_at asc)
  where archived_at is null;

alter table public.social_account_posts_raw
  add column if not exists raw_payload_archived_at timestamptz,
  add column if not exists raw_payload_archive_manifest_id uuid references public.archive_manifests(id) on delete set null,
  add column if not exists raw_payload_archive_key text;

create index if not exists social_account_posts_raw_payload_archive_candidate_idx
  on public.social_account_posts_raw (posted_at desc)
  where raw_payload_archived_at is null
    and posted_at is not null;

alter table public.social_account_post_insights
  add column if not exists payload_archived_at timestamptz,
  add column if not exists payload_archive_manifest_id uuid references public.archive_manifests(id) on delete set null,
  add column if not exists payload_archive_key text;

create index if not exists social_account_post_insights_payload_archive_candidate_idx
  on public.social_account_post_insights (created_at desc)
  where payload_archived_at is null;
