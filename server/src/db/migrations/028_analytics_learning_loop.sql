create table if not exists public.analytics_learning_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  brand_profile_id uuid references public.brand_profiles(id) on delete set null,
  platform text not null,
  profile_type text not null default 'content-performance',
  summary_text text not null,
  recommendation_text text,
  metrics jsonb not null default '{}'::jsonb,
  patterns jsonb not null default '[]'::jsonb,
  weak_patterns jsonb not null default '[]'::jsonb,
  top_content_ids jsonb not null default '[]'::jsonb,
  analytics_context jsonb not null default '{}'::jsonb,
  source_window_start timestamptz,
  source_window_end timestamptz,
  last_analyzed_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint analytics_learning_profiles_unique
    unique (user_id, platform, profile_type)
);

create index if not exists analytics_learning_profiles_user_id_idx
  on public.analytics_learning_profiles (user_id, updated_at desc);

create index if not exists analytics_learning_profiles_platform_idx
  on public.analytics_learning_profiles (user_id, platform, updated_at desc);

drop trigger if exists set_analytics_learning_profiles_updated_at
  on public.analytics_learning_profiles;
create trigger set_analytics_learning_profiles_updated_at
before update on public.analytics_learning_profiles
for each row
execute function public.set_updated_at();

alter table public.analytics_learning_profiles enable row level security;

drop policy if exists "analytics_learning_profiles_select_own" on public.analytics_learning_profiles;
create policy "analytics_learning_profiles_select_own"
on public.analytics_learning_profiles
for select
using (auth.uid() = user_id);

drop policy if exists "analytics_learning_profiles_insert_own" on public.analytics_learning_profiles;
create policy "analytics_learning_profiles_insert_own"
on public.analytics_learning_profiles
for insert
with check (auth.uid() = user_id);

drop policy if exists "analytics_learning_profiles_update_own" on public.analytics_learning_profiles;
create policy "analytics_learning_profiles_update_own"
on public.analytics_learning_profiles
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "analytics_learning_profiles_delete_own" on public.analytics_learning_profiles;
create policy "analytics_learning_profiles_delete_own"
on public.analytics_learning_profiles
for delete
using (auth.uid() = user_id);

create table if not exists public.analytics_learning_post_signals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  analytics_id uuid not null references public.analytics(id) on delete cascade,
  content_id uuid references public.generated_content(id) on delete set null,
  scheduled_post_id uuid references public.scheduled_posts(id) on delete set null,
  platform text not null,
  source_post_key text not null,
  performance_score double precision not null default 0,
  outcome_label text not null
    check (outcome_label in ('winning', 'solid', 'neutral', 'weak')),
  format_type text,
  caption_length_bucket text,
  hook_style text,
  cta_style text,
  hashtag_bucket text,
  topic_tags jsonb not null default '[]'::jsonb,
  metrics jsonb not null default '{}'::jsonb,
  strategy jsonb not null default '{}'::jsonb,
  user_feedback jsonb not null default '{}'::jsonb,
  published_time timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint analytics_learning_post_signals_unique
    unique (user_id, analytics_id)
);

create index if not exists analytics_learning_post_signals_user_id_idx
  on public.analytics_learning_post_signals (user_id, created_at desc);

create index if not exists analytics_learning_post_signals_platform_idx
  on public.analytics_learning_post_signals (user_id, platform, performance_score desc);

create index if not exists analytics_learning_post_signals_content_idx
  on public.analytics_learning_post_signals (user_id, content_id, performance_score desc);

drop trigger if exists set_analytics_learning_post_signals_updated_at
  on public.analytics_learning_post_signals;
create trigger set_analytics_learning_post_signals_updated_at
before update on public.analytics_learning_post_signals
for each row
execute function public.set_updated_at();

alter table public.analytics_learning_post_signals enable row level security;

drop policy if exists "analytics_learning_post_signals_select_own" on public.analytics_learning_post_signals;
create policy "analytics_learning_post_signals_select_own"
on public.analytics_learning_post_signals
for select
using (auth.uid() = user_id);

drop policy if exists "analytics_learning_post_signals_insert_own" on public.analytics_learning_post_signals;
create policy "analytics_learning_post_signals_insert_own"
on public.analytics_learning_post_signals
for insert
with check (auth.uid() = user_id);

drop policy if exists "analytics_learning_post_signals_update_own" on public.analytics_learning_post_signals;
create policy "analytics_learning_post_signals_update_own"
on public.analytics_learning_post_signals
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "analytics_learning_post_signals_delete_own" on public.analytics_learning_post_signals;
create policy "analytics_learning_post_signals_delete_own"
on public.analytics_learning_post_signals
for delete
using (auth.uid() = user_id);

create table if not exists public.analytics_learning_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trigger_source text not null,
  platforms jsonb not null default '[]'::jsonb,
  status text not null default 'running'
    check (status in ('running', 'completed', 'failed')),
  posts_analyzed integer not null default 0,
  profiles_updated integer not null default 0,
  summary jsonb not null default '{}'::jsonb,
  error_message text,
  source_window_start timestamptz,
  source_window_end timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists analytics_learning_runs_user_id_idx
  on public.analytics_learning_runs (user_id, created_at desc);

drop trigger if exists set_analytics_learning_runs_updated_at
  on public.analytics_learning_runs;
create trigger set_analytics_learning_runs_updated_at
before update on public.analytics_learning_runs
for each row
execute function public.set_updated_at();

alter table public.analytics_learning_runs enable row level security;

drop policy if exists "analytics_learning_runs_select_own" on public.analytics_learning_runs;
create policy "analytics_learning_runs_select_own"
on public.analytics_learning_runs
for select
using (auth.uid() = user_id);

drop policy if exists "analytics_learning_runs_insert_own" on public.analytics_learning_runs;
create policy "analytics_learning_runs_insert_own"
on public.analytics_learning_runs
for insert
with check (auth.uid() = user_id);

drop policy if exists "analytics_learning_runs_update_own" on public.analytics_learning_runs;
create policy "analytics_learning_runs_update_own"
on public.analytics_learning_runs
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "analytics_learning_runs_delete_own" on public.analytics_learning_runs;
create policy "analytics_learning_runs_delete_own"
on public.analytics_learning_runs
for delete
using (auth.uid() = user_id);
