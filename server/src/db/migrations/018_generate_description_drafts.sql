create table if not exists public.generate_description_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  draft_scope text not null,
  language text not null,
  content text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz not null default (timezone('utc', now()) + interval '48 hours'),
  constraint generate_description_drafts_scope_check
    check (char_length(trim(draft_scope)) > 0),
  constraint generate_description_drafts_content_check
    check (char_length(trim(content)) > 0),
  constraint generate_description_drafts_language_check
    check (language in ('en', 'bn', 'hi', 'ur', 'ta', 'te', 'ml', 'kn', 'pa')),
  constraint generate_description_drafts_unique_scope_language
    unique (user_id, draft_scope, language)
);

create index if not exists generate_description_drafts_user_scope_idx
  on public.generate_description_drafts (user_id, draft_scope);

create index if not exists generate_description_drafts_expires_at_idx
  on public.generate_description_drafts (expires_at);

drop trigger if exists set_generate_description_drafts_updated_at
  on public.generate_description_drafts;
create trigger set_generate_description_drafts_updated_at
before update on public.generate_description_drafts
for each row
execute function public.set_updated_at();

alter table public.generate_description_drafts enable row level security;

drop policy if exists "generate_description_drafts_select_own"
  on public.generate_description_drafts;
create policy "generate_description_drafts_select_own"
on public.generate_description_drafts
for select
using (auth.uid() = user_id);

drop policy if exists "generate_description_drafts_insert_own"
  on public.generate_description_drafts;
create policy "generate_description_drafts_insert_own"
on public.generate_description_drafts
for insert
with check (auth.uid() = user_id);

drop policy if exists "generate_description_drafts_update_own"
  on public.generate_description_drafts;
create policy "generate_description_drafts_update_own"
on public.generate_description_drafts
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "generate_description_drafts_delete_own"
  on public.generate_description_drafts;
create policy "generate_description_drafts_delete_own"
on public.generate_description_drafts
for delete
using (auth.uid() = user_id);
