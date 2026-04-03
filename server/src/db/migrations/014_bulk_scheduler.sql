create table if not exists public.media_assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_type text not null check (source_type in ('upload', 'url', 'generated')),
  media_type text not null check (media_type in ('image', 'video')),
  original_url text,
  storage_url text not null,
  thumbnail_url text,
  filename text,
  mime_type text,
  size_bytes bigint,
  width integer,
  height integer,
  duration_seconds numeric(10, 2),
  content_id uuid references public.generated_content(id) on delete set null,
  generated_image_id uuid references public.generated_images(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists media_assets_user_id_idx
  on public.media_assets (user_id);

create index if not exists media_assets_source_type_idx
  on public.media_assets (source_type);

alter table public.media_assets enable row level security;

drop policy if exists "media_assets_select_own" on public.media_assets;
create policy "media_assets_select_own"
on public.media_assets
for select
using (auth.uid() = user_id);

drop policy if exists "media_assets_insert_own" on public.media_assets;
create policy "media_assets_insert_own"
on public.media_assets
for insert
with check (auth.uid() = user_id);

drop policy if exists "media_assets_update_own" on public.media_assets;
create policy "media_assets_update_own"
on public.media_assets
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "media_assets_delete_own" on public.media_assets;
create policy "media_assets_delete_own"
on public.media_assets
for delete
using (auth.uid() = user_id);

create table if not exists public.schedule_batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  batch_name text,
  status text not null default 'draft'
    check (status in ('draft', 'queued', 'partial', 'completed', 'failed')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists schedule_batches_user_id_idx
  on public.schedule_batches (user_id);

create index if not exists schedule_batches_status_idx
  on public.schedule_batches (status);

drop trigger if exists set_schedule_batches_updated_at on public.schedule_batches;
create trigger set_schedule_batches_updated_at
before update on public.schedule_batches
for each row
execute function public.set_updated_at();

alter table public.schedule_batches enable row level security;

drop policy if exists "schedule_batches_select_own" on public.schedule_batches;
create policy "schedule_batches_select_own"
on public.schedule_batches
for select
using (auth.uid() = user_id);

drop policy if exists "schedule_batches_insert_own" on public.schedule_batches;
create policy "schedule_batches_insert_own"
on public.schedule_batches
for insert
with check (auth.uid() = user_id);

drop policy if exists "schedule_batches_update_own" on public.schedule_batches;
create policy "schedule_batches_update_own"
on public.schedule_batches
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "schedule_batches_delete_own" on public.schedule_batches;
create policy "schedule_batches_delete_own"
on public.schedule_batches
for delete
using (auth.uid() = user_id);

create table if not exists public.scheduled_items (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.schedule_batches(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  media_asset_id uuid not null references public.media_assets(id) on delete cascade,
  scheduled_post_id uuid references public.scheduled_posts(id) on delete set null,
  platform text not null,
  account_id text not null,
  social_account_id uuid not null references public.social_accounts(id) on delete cascade,
  caption text,
  scheduled_at timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending', 'scheduled', 'publishing', 'published', 'failed', 'cancelled')),
  attempt_count integer not null default 0,
  last_error text,
  idempotency_key text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists scheduled_items_idempotency_key_idx
  on public.scheduled_items (idempotency_key);

create index if not exists scheduled_items_batch_id_idx
  on public.scheduled_items (batch_id);

create index if not exists scheduled_items_user_id_idx
  on public.scheduled_items (user_id);

create index if not exists scheduled_items_status_scheduled_at_idx
  on public.scheduled_items (status, scheduled_at);

create index if not exists scheduled_items_platform_idx
  on public.scheduled_items (platform);

create index if not exists scheduled_items_scheduled_post_id_idx
  on public.scheduled_items (scheduled_post_id);

drop trigger if exists set_scheduled_items_updated_at on public.scheduled_items;
create trigger set_scheduled_items_updated_at
before update on public.scheduled_items
for each row
execute function public.set_updated_at();

alter table public.scheduled_items enable row level security;

drop policy if exists "scheduled_items_select_own" on public.scheduled_items;
create policy "scheduled_items_select_own"
on public.scheduled_items
for select
using (auth.uid() = user_id);

drop policy if exists "scheduled_items_insert_own" on public.scheduled_items;
create policy "scheduled_items_insert_own"
on public.scheduled_items
for insert
with check (auth.uid() = user_id);

drop policy if exists "scheduled_items_update_own" on public.scheduled_items;
create policy "scheduled_items_update_own"
on public.scheduled_items
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "scheduled_items_delete_own" on public.scheduled_items;
create policy "scheduled_items_delete_own"
on public.scheduled_items
for delete
using (auth.uid() = user_id);

create table if not exists public.scheduled_item_logs (
  id uuid primary key default gen_random_uuid(),
  scheduled_item_id uuid not null references public.scheduled_items(id) on delete cascade,
  event_type text not null,
  message text not null,
  payload_json jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists scheduled_item_logs_scheduled_item_id_idx
  on public.scheduled_item_logs (scheduled_item_id);

alter table public.scheduled_item_logs enable row level security;

drop policy if exists "scheduled_item_logs_select_own" on public.scheduled_item_logs;
create policy "scheduled_item_logs_select_own"
on public.scheduled_item_logs
for select
using (
  exists (
    select 1
    from public.scheduled_items items
    where items.id = scheduled_item_logs.scheduled_item_id
      and items.user_id = auth.uid()
  )
);

drop policy if exists "scheduled_item_logs_insert_own" on public.scheduled_item_logs;
create policy "scheduled_item_logs_insert_own"
on public.scheduled_item_logs
for insert
with check (
  exists (
    select 1
    from public.scheduled_items items
    where items.id = scheduled_item_logs.scheduled_item_id
      and items.user_id = auth.uid()
  )
);

drop policy if exists "scheduled_item_logs_delete_own" on public.scheduled_item_logs;
create policy "scheduled_item_logs_delete_own"
on public.scheduled_item_logs
for delete
using (
  exists (
    select 1
    from public.scheduled_items items
    where items.id = scheduled_item_logs.scheduled_item_id
      and items.user_id = auth.uid()
  )
);
