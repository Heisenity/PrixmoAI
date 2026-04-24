create table if not exists public.brand_profile_memory_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  brand_profile_id uuid references public.brand_profiles(id) on delete set null,
  save_context text not null default 'system'
    check (save_context in ('onboarding', 'settings', 'system')),
  event_type text not null
    check (event_type in ('created', 'updated', 'saved')),
  changed_fields text[] not null default '{}',
  previous_snapshot jsonb,
  current_snapshot jsonb not null,
  field_changes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists brand_profile_memory_events_user_id_idx
  on public.brand_profile_memory_events (user_id, created_at desc);

create index if not exists brand_profile_memory_events_brand_profile_id_idx
  on public.brand_profile_memory_events (brand_profile_id, created_at desc);

alter table public.brand_profile_memory_events enable row level security;

drop policy if exists "brand_profile_memory_events_select_own" on public.brand_profile_memory_events;
create policy "brand_profile_memory_events_select_own"
on public.brand_profile_memory_events
for select
using (auth.uid() = user_id);

drop policy if exists "brand_profile_memory_events_insert_own" on public.brand_profile_memory_events;
create policy "brand_profile_memory_events_insert_own"
on public.brand_profile_memory_events
for insert
with check (auth.uid() = user_id);

create table if not exists public.industry_suggestion_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  brand_profile_id uuid references public.brand_profiles(id) on delete set null,
  request_context text not null default 'settings'
    check (request_context in ('onboarding', 'settings', 'system')),
  status text not null
    check (status in ('success', 'fallback', 'error')),
  provider text,
  request_payload jsonb not null,
  response_payload jsonb,
  error_message text,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists industry_suggestion_logs_user_id_idx
  on public.industry_suggestion_logs (user_id, created_at desc);

create index if not exists industry_suggestion_logs_brand_profile_id_idx
  on public.industry_suggestion_logs (brand_profile_id, created_at desc);

alter table public.industry_suggestion_logs enable row level security;

drop policy if exists "industry_suggestion_logs_select_own" on public.industry_suggestion_logs;
create policy "industry_suggestion_logs_select_own"
on public.industry_suggestion_logs
for select
using (auth.uid() = user_id);

drop policy if exists "industry_suggestion_logs_insert_own" on public.industry_suggestion_logs;
create policy "industry_suggestion_logs_insert_own"
on public.industry_suggestion_logs
for insert
with check (auth.uid() = user_id);
