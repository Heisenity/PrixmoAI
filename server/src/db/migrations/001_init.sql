create extension if not exists "pgcrypto";

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.brand_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  full_name text not null,
  username text,
  avatar_url text,
  industry text,
  target_audience text,
  brand_voice text,
  description text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists brand_profiles_user_id_idx
  on public.brand_profiles (user_id);

drop trigger if exists set_brand_profiles_updated_at on public.brand_profiles;
create trigger set_brand_profiles_updated_at
before update on public.brand_profiles
for each row
execute function public.set_updated_at();

alter table public.brand_profiles enable row level security;

drop policy if exists "brand_profiles_select_own" on public.brand_profiles;
create policy "brand_profiles_select_own"
on public.brand_profiles
for select
using (auth.uid() = user_id);

drop policy if exists "brand_profiles_insert_own" on public.brand_profiles;
create policy "brand_profiles_insert_own"
on public.brand_profiles
for insert
with check (auth.uid() = user_id);

drop policy if exists "brand_profiles_update_own" on public.brand_profiles;
create policy "brand_profiles_update_own"
on public.brand_profiles
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "brand_profiles_delete_own" on public.brand_profiles;
create policy "brand_profiles_delete_own"
on public.brand_profiles
for delete
using (auth.uid() = user_id);
