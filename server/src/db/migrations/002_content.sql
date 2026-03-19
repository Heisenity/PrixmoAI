create table if not exists public.generated_content (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  brand_profile_id uuid references public.brand_profiles(id) on delete set null,
  product_name text not null,
  product_description text,
  product_image_url text,
  platform text,
  goal text,
  tone text,
  audience text,
  keywords jsonb not null default '[]'::jsonb,
  captions jsonb not null default '[]'::jsonb,
  hashtags jsonb not null default '[]'::jsonb,
  reel_script jsonb not null default '{"hook":"","body":"","cta":""}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists generated_content_user_id_idx
  on public.generated_content (user_id);

create index if not exists generated_content_created_at_idx
  on public.generated_content (created_at desc);

drop trigger if exists set_generated_content_updated_at on public.generated_content;
create trigger set_generated_content_updated_at
before update on public.generated_content
for each row
execute function public.set_updated_at();

alter table public.generated_content enable row level security;

drop policy if exists "generated_content_select_own" on public.generated_content;
create policy "generated_content_select_own"
on public.generated_content
for select
using (auth.uid() = user_id);

drop policy if exists "generated_content_insert_own" on public.generated_content;
create policy "generated_content_insert_own"
on public.generated_content
for insert
with check (auth.uid() = user_id);

drop policy if exists "generated_content_update_own" on public.generated_content;
create policy "generated_content_update_own"
on public.generated_content
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "generated_content_delete_own" on public.generated_content;
create policy "generated_content_delete_own"
on public.generated_content
for delete
using (auth.uid() = user_id);

create table if not exists public.generated_images (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  content_id uuid references public.generated_content(id) on delete set null,
  source_image_url text,
  generated_image_url text not null,
  background_style text,
  prompt text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists generated_images_user_id_idx
  on public.generated_images (user_id);

create index if not exists generated_images_created_at_idx
  on public.generated_images (created_at desc);

drop trigger if exists set_generated_images_updated_at on public.generated_images;
create trigger set_generated_images_updated_at
before update on public.generated_images
for each row
execute function public.set_updated_at();

alter table public.generated_images enable row level security;

drop policy if exists "generated_images_select_own" on public.generated_images;
create policy "generated_images_select_own"
on public.generated_images
for select
using (auth.uid() = user_id);

drop policy if exists "generated_images_insert_own" on public.generated_images;
create policy "generated_images_insert_own"
on public.generated_images
for insert
with check (auth.uid() = user_id);

drop policy if exists "generated_images_update_own" on public.generated_images;
create policy "generated_images_update_own"
on public.generated_images
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "generated_images_delete_own" on public.generated_images;
create policy "generated_images_delete_own"
on public.generated_images
for delete
using (auth.uid() = user_id);
