create table if not exists public.analytics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  scheduled_post_id uuid references public.scheduled_posts(id) on delete cascade,
  content_id uuid references public.generated_content(id) on delete set null,
  platform text,
  post_external_id text,
  reach integer not null default 0,
  impressions integer not null default 0,
  likes integer not null default 0,
  comments integer not null default 0,
  shares integer not null default 0,
  saves integer not null default 0,
  engagement_rate numeric(8, 2),
  recorded_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists analytics_user_id_idx
  on public.analytics (user_id);

create index if not exists analytics_recorded_at_idx
  on public.analytics (recorded_at desc);

drop trigger if exists set_analytics_updated_at on public.analytics;
create trigger set_analytics_updated_at
before update on public.analytics
for each row
execute function public.set_updated_at();

alter table public.analytics enable row level security;

drop policy if exists "analytics_select_own" on public.analytics;
create policy "analytics_select_own"
on public.analytics
for select
using (auth.uid() = user_id);

drop policy if exists "analytics_insert_own" on public.analytics;
create policy "analytics_insert_own"
on public.analytics
for insert
with check (auth.uid() = user_id);

drop policy if exists "analytics_update_own" on public.analytics;
create policy "analytics_update_own"
on public.analytics
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "analytics_delete_own" on public.analytics;
create policy "analytics_delete_own"
on public.analytics
for delete
using (auth.uid() = user_id);
