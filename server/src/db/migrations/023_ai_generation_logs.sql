create table if not exists public.brand_description_suggestion_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  brand_profile_id uuid references public.brand_profiles(id) on delete set null,
  request_context text not null default 'settings'
    check (request_context in ('onboarding', 'settings', 'system')),
  status text not null
    check (status in ('success', 'error')),
  provider text,
  request_payload jsonb not null,
  response_payload jsonb,
  error_message text,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists brand_description_suggestion_logs_user_id_idx
  on public.brand_description_suggestion_logs (user_id, created_at desc);

create index if not exists brand_description_suggestion_logs_brand_profile_id_idx
  on public.brand_description_suggestion_logs (brand_profile_id, created_at desc);

alter table public.brand_description_suggestion_logs enable row level security;

drop policy if exists "brand_description_suggestion_logs_select_own" on public.brand_description_suggestion_logs;
create policy "brand_description_suggestion_logs_select_own"
on public.brand_description_suggestion_logs
for select
using (auth.uid() = user_id);

drop policy if exists "brand_description_suggestion_logs_insert_own" on public.brand_description_suggestion_logs;
create policy "brand_description_suggestion_logs_insert_own"
on public.brand_description_suggestion_logs
for insert
with check (auth.uid() = user_id);

create table if not exists public.username_recommendation_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  brand_profile_id uuid references public.brand_profiles(id) on delete set null,
  request_context text not null default 'settings'
    check (request_context in ('onboarding', 'settings', 'system')),
  status text not null
    check (status in ('success', 'error')),
  desired_username text not null,
  normalized_username text not null,
  is_available boolean not null default false,
  provider text,
  request_payload jsonb not null,
  response_payload jsonb,
  error_message text,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists username_recommendation_logs_user_id_idx
  on public.username_recommendation_logs (user_id, created_at desc);

create index if not exists username_recommendation_logs_brand_profile_id_idx
  on public.username_recommendation_logs (brand_profile_id, created_at desc);

create index if not exists username_recommendation_logs_normalized_username_idx
  on public.username_recommendation_logs (normalized_username, created_at desc);

alter table public.username_recommendation_logs enable row level security;

drop policy if exists "username_recommendation_logs_select_own" on public.username_recommendation_logs;
create policy "username_recommendation_logs_select_own"
on public.username_recommendation_logs
for select
using (auth.uid() = user_id);

drop policy if exists "username_recommendation_logs_insert_own" on public.username_recommendation_logs;
create policy "username_recommendation_logs_insert_own"
on public.username_recommendation_logs
for insert
with check (auth.uid() = user_id);
