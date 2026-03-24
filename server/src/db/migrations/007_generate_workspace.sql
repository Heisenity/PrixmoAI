create table if not exists public.generate_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  last_message_preview text,
  conversation_type text not null default 'mixed',
  is_archived boolean not null default false,
  is_deleted boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint generate_conversations_type_check
    check (conversation_type in ('copy', 'image', 'mixed'))
);

create index if not exists generate_conversations_user_id_idx
  on public.generate_conversations (user_id);

create index if not exists generate_conversations_updated_at_idx
  on public.generate_conversations (updated_at desc);

drop trigger if exists set_generate_conversations_updated_at on public.generate_conversations;
create trigger set_generate_conversations_updated_at
before update on public.generate_conversations
for each row
execute function public.set_updated_at();

alter table public.generate_conversations enable row level security;

drop policy if exists "generate_conversations_select_own" on public.generate_conversations;
create policy "generate_conversations_select_own"
on public.generate_conversations
for select
using (auth.uid() = user_id);

drop policy if exists "generate_conversations_insert_own" on public.generate_conversations;
create policy "generate_conversations_insert_own"
on public.generate_conversations
for insert
with check (auth.uid() = user_id);

drop policy if exists "generate_conversations_update_own" on public.generate_conversations;
create policy "generate_conversations_update_own"
on public.generate_conversations
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "generate_conversations_delete_own" on public.generate_conversations;
create policy "generate_conversations_delete_own"
on public.generate_conversations
for delete
using (auth.uid() = user_id);

create table if not exists public.generate_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.generate_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null,
  message_type text not null default 'text',
  content text,
  metadata jsonb not null default '{}'::jsonb,
  generation_id uuid,
  created_at timestamptz not null default timezone('utc', now()),
  constraint generate_messages_role_check
    check (role in ('user', 'assistant', 'system')),
  constraint generate_messages_type_check
    check (message_type in ('text', 'copy', 'image', 'metadata'))
);

create index if not exists generate_messages_conversation_id_idx
  on public.generate_messages (conversation_id, created_at asc);

create index if not exists generate_messages_user_id_idx
  on public.generate_messages (user_id);

alter table public.generate_messages enable row level security;

drop policy if exists "generate_messages_select_own" on public.generate_messages;
create policy "generate_messages_select_own"
on public.generate_messages
for select
using (auth.uid() = user_id);

drop policy if exists "generate_messages_insert_own" on public.generate_messages;
create policy "generate_messages_insert_own"
on public.generate_messages
for insert
with check (auth.uid() = user_id);

drop policy if exists "generate_messages_update_own" on public.generate_messages;
create policy "generate_messages_update_own"
on public.generate_messages
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "generate_messages_delete_own" on public.generate_messages;
create policy "generate_messages_delete_own"
on public.generate_messages
for delete
using (auth.uid() = user_id);

create table if not exists public.generated_assets (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.generate_conversations(id) on delete cascade,
  message_id uuid not null references public.generate_messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  asset_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  constraint generated_assets_type_check
    check (asset_type in ('copy', 'hashtags', 'script', 'image', 'prompt'))
);

create index if not exists generated_assets_conversation_id_idx
  on public.generated_assets (conversation_id, created_at asc);

create index if not exists generated_assets_message_id_idx
  on public.generated_assets (message_id);

alter table public.generated_assets enable row level security;

drop policy if exists "generated_assets_select_own" on public.generated_assets;
create policy "generated_assets_select_own"
on public.generated_assets
for select
using (auth.uid() = user_id);

drop policy if exists "generated_assets_insert_own" on public.generated_assets;
create policy "generated_assets_insert_own"
on public.generated_assets
for insert
with check (auth.uid() = user_id);

drop policy if exists "generated_assets_update_own" on public.generated_assets;
create policy "generated_assets_update_own"
on public.generated_assets
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "generated_assets_delete_own" on public.generated_assets;
create policy "generated_assets_delete_own"
on public.generated_assets
for delete
using (auth.uid() = user_id);

alter table public.generated_content
  add column if not exists conversation_id uuid references public.generate_conversations(id) on delete set null;

create index if not exists generated_content_conversation_id_idx
  on public.generated_content (conversation_id);

alter table public.generated_images
  add column if not exists conversation_id uuid references public.generate_conversations(id) on delete set null;

create index if not exists generated_images_conversation_id_idx
  on public.generated_images (conversation_id);
