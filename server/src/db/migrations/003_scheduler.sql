create table if not exists public.social_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null,
  account_id text not null,
  account_name text,
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  connected_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, platform, account_id)
);

create index if not exists social_accounts_user_id_idx
  on public.social_accounts (user_id);

drop trigger if exists set_social_accounts_updated_at on public.social_accounts;
create trigger set_social_accounts_updated_at
before update on public.social_accounts
for each row
execute function public.set_updated_at();

alter table public.social_accounts enable row level security;

drop policy if exists "social_accounts_select_own" on public.social_accounts;
create policy "social_accounts_select_own"
on public.social_accounts
for select
using (auth.uid() = user_id);

drop policy if exists "social_accounts_insert_own" on public.social_accounts;
create policy "social_accounts_insert_own"
on public.social_accounts
for insert
with check (auth.uid() = user_id);

drop policy if exists "social_accounts_update_own" on public.social_accounts;
create policy "social_accounts_update_own"
on public.social_accounts
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "social_accounts_delete_own" on public.social_accounts;
create policy "social_accounts_delete_own"
on public.social_accounts
for delete
using (auth.uid() = user_id);

create table if not exists public.scheduled_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  social_account_id uuid not null references public.social_accounts(id) on delete cascade,
  content_id uuid references public.generated_content(id) on delete set null,
  generated_image_id uuid references public.generated_images(id) on delete set null,
  platform text,
  caption text,
  media_url text,
  scheduled_for timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending', 'scheduled', 'published', 'failed', 'cancelled')),
  published_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists scheduled_posts_user_id_idx
  on public.scheduled_posts (user_id);

create index if not exists scheduled_posts_scheduled_for_idx
  on public.scheduled_posts (scheduled_for);

drop trigger if exists set_scheduled_posts_updated_at on public.scheduled_posts;
create trigger set_scheduled_posts_updated_at
before update on public.scheduled_posts
for each row
execute function public.set_updated_at();

alter table public.scheduled_posts enable row level security;

drop policy if exists "scheduled_posts_select_own" on public.scheduled_posts;
create policy "scheduled_posts_select_own"
on public.scheduled_posts
for select
using (auth.uid() = user_id);

drop policy if exists "scheduled_posts_insert_own" on public.scheduled_posts;
create policy "scheduled_posts_insert_own"
on public.scheduled_posts
for insert
with check (auth.uid() = user_id);

drop policy if exists "scheduled_posts_update_own" on public.scheduled_posts;
create policy "scheduled_posts_update_own"
on public.scheduled_posts
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "scheduled_posts_delete_own" on public.scheduled_posts;
create policy "scheduled_posts_delete_own"
on public.scheduled_posts
for delete
using (auth.uid() = user_id);
