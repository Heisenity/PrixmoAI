alter table public.analytics
  add column if not exists replays integer not null default 0,
  add column if not exists exits integer not null default 0,
  add column if not exists profile_visits integer not null default 0,
  add column if not exists post_clicks integer not null default 0,
  add column if not exists page_likes integer not null default 0;

create table if not exists public.analytics_audience_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  social_account_id uuid not null references public.social_accounts(id) on delete cascade,
  platform text not null,
  followers integer not null default 0,
  impressions integer not null default 0,
  reach integer not null default 0,
  profile_visits integer not null default 0,
  page_likes integer not null default 0,
  age_distribution jsonb not null default '[]'::jsonb,
  gender_distribution jsonb not null default '[]'::jsonb,
  top_locations jsonb not null default '[]'::jsonb,
  active_hours jsonb not null default '{}'::jsonb,
  recorded_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists analytics_audience_snapshots_user_id_idx
  on public.analytics_audience_snapshots (user_id);

create index if not exists analytics_audience_snapshots_social_account_id_idx
  on public.analytics_audience_snapshots (social_account_id);

create index if not exists analytics_audience_snapshots_recorded_at_idx
  on public.analytics_audience_snapshots (recorded_at desc);

drop trigger if exists set_analytics_audience_snapshots_updated_at on public.analytics_audience_snapshots;
create trigger set_analytics_audience_snapshots_updated_at
before update on public.analytics_audience_snapshots
for each row
execute function public.set_updated_at();

alter table public.analytics_audience_snapshots enable row level security;

drop policy if exists "analytics_audience_snapshots_select_own" on public.analytics_audience_snapshots;
create policy "analytics_audience_snapshots_select_own"
on public.analytics_audience_snapshots
for select
using (auth.uid() = user_id);

drop policy if exists "analytics_audience_snapshots_insert_own" on public.analytics_audience_snapshots;
create policy "analytics_audience_snapshots_insert_own"
on public.analytics_audience_snapshots
for insert
with check (auth.uid() = user_id);

drop policy if exists "analytics_audience_snapshots_update_own" on public.analytics_audience_snapshots;
create policy "analytics_audience_snapshots_update_own"
on public.analytics_audience_snapshots
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "analytics_audience_snapshots_delete_own" on public.analytics_audience_snapshots;
create policy "analytics_audience_snapshots_delete_own"
on public.analytics_audience_snapshots
for delete
using (auth.uid() = user_id);
