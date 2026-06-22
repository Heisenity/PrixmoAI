alter table public.social_accounts
  add column if not exists is_primary_for_platform boolean not null default false;

create index if not exists social_accounts_platform_verified_idx
  on public.social_accounts (user_id, platform, verification_status, connected_at desc);

create unique index if not exists social_accounts_primary_verified_platform_key
  on public.social_accounts (user_id, platform)
  where is_primary_for_platform = true
    and verification_status = 'verified';

create table if not exists public.social_account_sync_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  social_account_id uuid not null references public.social_accounts(id) on delete cascade,
  platform text not null,
  job_type text not null default 'sync-account'
    check (job_type in ('sync-account', 'daily-sweep')),
  trigger_source text not null default 'manual',
  status text not null default 'queued'
    check (status in ('queued', 'running', 'completed', 'failed', 'skipped')),
  checkpoint_post_id text,
  checkpoint_posted_at timestamptz,
  last_synced_at timestamptz,
  next_refresh_at timestamptz,
  fetched_posts_count integer not null default 0,
  upserted_posts_count integer not null default 0,
  insight_rows_count integer not null default 0,
  visual_assets_analyzed integer not null default 0,
  retry_count integer not null default 0,
  normalized_failure_kind text,
  error_message text,
  raw_summary jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists social_account_sync_runs_user_id_idx
  on public.social_account_sync_runs (user_id, created_at desc);

create index if not exists social_account_sync_runs_social_account_id_idx
  on public.social_account_sync_runs (social_account_id, created_at desc);

create index if not exists social_account_sync_runs_next_refresh_at_idx
  on public.social_account_sync_runs (next_refresh_at)
  where next_refresh_at is not null;

create index if not exists social_account_sync_runs_active_status_idx
  on public.social_account_sync_runs (social_account_id, status, created_at desc)
  where status in ('queued', 'running');

create unique index if not exists social_account_sync_runs_one_active_per_account_key
  on public.social_account_sync_runs (social_account_id)
  where status in ('queued', 'running');

drop trigger if exists set_social_account_sync_runs_updated_at
  on public.social_account_sync_runs;
create trigger set_social_account_sync_runs_updated_at
before update on public.social_account_sync_runs
for each row
execute function public.set_updated_at();

alter table public.social_account_sync_runs enable row level security;

drop policy if exists "social_account_sync_runs_select_own" on public.social_account_sync_runs;
create policy "social_account_sync_runs_select_own"
on public.social_account_sync_runs
for select
using (auth.uid() = user_id);

drop policy if exists "social_account_sync_runs_insert_own" on public.social_account_sync_runs;
create policy "social_account_sync_runs_insert_own"
on public.social_account_sync_runs
for insert
with check (auth.uid() = user_id);

drop policy if exists "social_account_sync_runs_update_own" on public.social_account_sync_runs;
create policy "social_account_sync_runs_update_own"
on public.social_account_sync_runs
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "social_account_sync_runs_delete_own" on public.social_account_sync_runs;
create policy "social_account_sync_runs_delete_own"
on public.social_account_sync_runs
for delete
using (auth.uid() = user_id);

create table if not exists public.social_account_profile_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  social_account_id uuid not null references public.social_accounts(id) on delete cascade,
  sync_run_id uuid references public.social_account_sync_runs(id) on delete set null,
  platform text not null,
  username text,
  display_name text,
  biography text,
  profile_picture_url text,
  followers_count integer,
  follows_count integer,
  media_count integer,
  raw_payload jsonb not null default '{}'::jsonb,
  fetched_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists social_account_profile_snapshots_social_account_id_idx
  on public.social_account_profile_snapshots (social_account_id, fetched_at desc);

create index if not exists social_account_profile_snapshots_user_id_idx
  on public.social_account_profile_snapshots (user_id, fetched_at desc);

drop trigger if exists set_social_account_profile_snapshots_updated_at
  on public.social_account_profile_snapshots;
create trigger set_social_account_profile_snapshots_updated_at
before update on public.social_account_profile_snapshots
for each row
execute function public.set_updated_at();

alter table public.social_account_profile_snapshots enable row level security;

drop policy if exists "social_account_profile_snapshots_select_own" on public.social_account_profile_snapshots;
create policy "social_account_profile_snapshots_select_own"
on public.social_account_profile_snapshots
for select
using (auth.uid() = user_id);

drop policy if exists "social_account_profile_snapshots_insert_own" on public.social_account_profile_snapshots;
create policy "social_account_profile_snapshots_insert_own"
on public.social_account_profile_snapshots
for insert
with check (auth.uid() = user_id);

drop policy if exists "social_account_profile_snapshots_update_own" on public.social_account_profile_snapshots;
create policy "social_account_profile_snapshots_update_own"
on public.social_account_profile_snapshots
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "social_account_profile_snapshots_delete_own" on public.social_account_profile_snapshots;
create policy "social_account_profile_snapshots_delete_own"
on public.social_account_profile_snapshots
for delete
using (auth.uid() = user_id);

create table if not exists public.social_account_posts_raw (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  social_account_id uuid not null references public.social_accounts(id) on delete cascade,
  platform text not null,
  external_post_id text not null,
  shortcode text,
  permalink text,
  caption_text text,
  caption_hash text,
  media_fingerprint text,
  media_type text,
  media_product_type text,
  normalized_format text,
  posted_at timestamptz,
  media_url text,
  thumbnail_url text,
  like_count integer not null default 0,
  comments_count integer not null default 0,
  share_count integer not null default 0,
  save_count integer not null default 0,
  reaction_count integer not null default 0,
  impressions_count integer not null default 0,
  reach_count integer not null default 0,
  video_views_count integer not null default 0,
  raw_payload jsonb not null default '{}'::jsonb,
  last_metrics_synced_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint social_account_posts_raw_unique unique (user_id, social_account_id, external_post_id)
);

create index if not exists social_account_posts_raw_social_account_posted_at_idx
  on public.social_account_posts_raw (social_account_id, posted_at desc);

create index if not exists social_account_posts_raw_shortcode_idx
  on public.social_account_posts_raw (shortcode)
  where shortcode is not null;

create index if not exists social_account_posts_raw_permalink_idx
  on public.social_account_posts_raw (permalink)
  where permalink is not null;

drop trigger if exists set_social_account_posts_raw_updated_at
  on public.social_account_posts_raw;
create trigger set_social_account_posts_raw_updated_at
before update on public.social_account_posts_raw
for each row
execute function public.set_updated_at();

alter table public.social_account_posts_raw enable row level security;

drop policy if exists "social_account_posts_raw_select_own" on public.social_account_posts_raw;
create policy "social_account_posts_raw_select_own"
on public.social_account_posts_raw
for select
using (auth.uid() = user_id);

drop policy if exists "social_account_posts_raw_insert_own" on public.social_account_posts_raw;
create policy "social_account_posts_raw_insert_own"
on public.social_account_posts_raw
for insert
with check (auth.uid() = user_id);

drop policy if exists "social_account_posts_raw_update_own" on public.social_account_posts_raw;
create policy "social_account_posts_raw_update_own"
on public.social_account_posts_raw
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "social_account_posts_raw_delete_own" on public.social_account_posts_raw;
create policy "social_account_posts_raw_delete_own"
on public.social_account_posts_raw
for delete
using (auth.uid() = user_id);

create table if not exists public.social_account_post_insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  social_account_id uuid not null references public.social_accounts(id) on delete cascade,
  social_account_post_raw_id uuid not null references public.social_account_posts_raw(id) on delete cascade,
  sync_run_id uuid not null references public.social_account_sync_runs(id) on delete cascade,
  platform text not null,
  like_count integer not null default 0,
  comments_count integer not null default 0,
  share_count integer not null default 0,
  save_count integer not null default 0,
  reaction_count integer not null default 0,
  impressions_count integer not null default 0,
  reach_count integer not null default 0,
  video_views_count integer not null default 0,
  metrics jsonb not null default '{}'::jsonb,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint social_account_post_insights_run_unique unique (social_account_post_raw_id, sync_run_id)
);

create index if not exists social_account_post_insights_post_idx
  on public.social_account_post_insights (social_account_post_raw_id, created_at desc);

create index if not exists social_account_post_insights_sync_run_idx
  on public.social_account_post_insights (sync_run_id, created_at desc);

drop trigger if exists set_social_account_post_insights_updated_at
  on public.social_account_post_insights;
create trigger set_social_account_post_insights_updated_at
before update on public.social_account_post_insights
for each row
execute function public.set_updated_at();

alter table public.social_account_post_insights enable row level security;

drop policy if exists "social_account_post_insights_select_own" on public.social_account_post_insights;
create policy "social_account_post_insights_select_own"
on public.social_account_post_insights
for select
using (auth.uid() = user_id);

drop policy if exists "social_account_post_insights_insert_own" on public.social_account_post_insights;
create policy "social_account_post_insights_insert_own"
on public.social_account_post_insights
for insert
with check (auth.uid() = user_id);

drop policy if exists "social_account_post_insights_update_own" on public.social_account_post_insights;
create policy "social_account_post_insights_update_own"
on public.social_account_post_insights
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "social_account_post_insights_delete_own" on public.social_account_post_insights;
create policy "social_account_post_insights_delete_own"
on public.social_account_post_insights
for delete
using (auth.uid() = user_id);

create table if not exists public.social_account_intelligence_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  social_account_id uuid not null references public.social_accounts(id) on delete cascade,
  platform text not null,
  summary_text text not null,
  account_tone text,
  main_themes jsonb not null default '[]'::jsonb,
  repeated_keywords jsonb not null default '[]'::jsonb,
  hook_styles jsonb not null default '[]'::jsonb,
  cta_styles jsonb not null default '[]'::jsonb,
  caption_length_pattern text,
  emoji_style text,
  hashtag_behavior text,
  posting_cadence jsonb not null default '{}'::jsonb,
  format_mix jsonb not null default '{}'::jsonb,
  best_patterns jsonb not null default '[]'::jsonb,
  weak_patterns jsonb not null default '[]'::jsonb,
  visual_dna jsonb not null default '{}'::jsonb,
  performance_context jsonb not null default '{}'::jsonb,
  summary_payload jsonb not null default '{}'::jsonb,
  source_post_count integer not null default 0,
  last_post_id text,
  last_post_timestamp timestamptz,
  last_synced_at timestamptz,
  next_refresh_at timestamptz,
  source_window_start timestamptz,
  source_window_end timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint social_account_intelligence_profiles_unique unique (social_account_id)
);

create index if not exists social_account_intelligence_profiles_user_platform_idx
  on public.social_account_intelligence_profiles (user_id, platform, updated_at desc);

create index if not exists social_account_intelligence_profiles_next_refresh_at_idx
  on public.social_account_intelligence_profiles (next_refresh_at)
  where next_refresh_at is not null;

create index if not exists social_account_intelligence_profiles_last_synced_at_idx
  on public.social_account_intelligence_profiles (last_synced_at desc)
  where last_synced_at is not null;

drop trigger if exists set_social_account_intelligence_profiles_updated_at
  on public.social_account_intelligence_profiles;
create trigger set_social_account_intelligence_profiles_updated_at
before update on public.social_account_intelligence_profiles
for each row
execute function public.set_updated_at();

alter table public.social_account_intelligence_profiles enable row level security;

drop policy if exists "social_account_intelligence_profiles_select_own" on public.social_account_intelligence_profiles;
create policy "social_account_intelligence_profiles_select_own"
on public.social_account_intelligence_profiles
for select
using (auth.uid() = user_id);

drop policy if exists "social_account_intelligence_profiles_insert_own" on public.social_account_intelligence_profiles;
create policy "social_account_intelligence_profiles_insert_own"
on public.social_account_intelligence_profiles
for insert
with check (auth.uid() = user_id);

drop policy if exists "social_account_intelligence_profiles_update_own" on public.social_account_intelligence_profiles;
create policy "social_account_intelligence_profiles_update_own"
on public.social_account_intelligence_profiles
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "social_account_intelligence_profiles_delete_own" on public.social_account_intelligence_profiles;
create policy "social_account_intelligence_profiles_delete_own"
on public.social_account_intelligence_profiles
for delete
using (auth.uid() = user_id);
