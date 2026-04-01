create table if not exists public.oauth_connection_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('meta')),
  platform text not null check (platform in ('facebook')),
  selection_type text not null check (selection_type in ('facebook_pages')),
  payload jsonb not null default '{}'::jsonb,
  expires_at timestamptz not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists oauth_connection_sessions_user_id_idx
  on public.oauth_connection_sessions (user_id);

create index if not exists oauth_connection_sessions_expires_at_idx
  on public.oauth_connection_sessions (expires_at);

drop trigger if exists set_oauth_connection_sessions_updated_at on public.oauth_connection_sessions;
create trigger set_oauth_connection_sessions_updated_at
before update on public.oauth_connection_sessions
for each row
execute function public.set_updated_at();

alter table public.oauth_connection_sessions enable row level security;

drop policy if exists "oauth_connection_sessions_select_own" on public.oauth_connection_sessions;
create policy "oauth_connection_sessions_select_own"
on public.oauth_connection_sessions
for select
using (auth.uid() = user_id);

drop policy if exists "oauth_connection_sessions_insert_own" on public.oauth_connection_sessions;
create policy "oauth_connection_sessions_insert_own"
on public.oauth_connection_sessions
for insert
with check (auth.uid() = user_id);

drop policy if exists "oauth_connection_sessions_update_own" on public.oauth_connection_sessions;
create policy "oauth_connection_sessions_update_own"
on public.oauth_connection_sessions
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "oauth_connection_sessions_delete_own" on public.oauth_connection_sessions;
create policy "oauth_connection_sessions_delete_own"
on public.oauth_connection_sessions
for delete
using (auth.uid() = user_id);
