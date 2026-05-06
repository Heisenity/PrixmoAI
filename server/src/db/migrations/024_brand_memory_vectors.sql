create extension if not exists vector with schema extensions;

create table if not exists public.brand_memory_embeddings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  brand_profile_id uuid references public.brand_profiles(id) on delete set null,
  source_table text not null,
  source_id uuid not null,
  source_key text not null default 'primary',
  memory_type text not null,
  content_text text not null,
  embedding extensions.vector(768) not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint brand_memory_embeddings_source_unique
    unique (user_id, source_table, source_id, source_key)
);

create index if not exists brand_memory_embeddings_user_id_idx
  on public.brand_memory_embeddings (user_id, created_at desc);

create index if not exists brand_memory_embeddings_brand_profile_id_idx
  on public.brand_memory_embeddings (brand_profile_id, created_at desc);

create or replace function public.set_brand_memory_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists set_brand_memory_embeddings_updated_at
  on public.brand_memory_embeddings;
create trigger set_brand_memory_embeddings_updated_at
before update on public.brand_memory_embeddings
for each row
execute function public.set_brand_memory_updated_at();

alter table public.brand_memory_embeddings enable row level security;

drop policy if exists "brand_memory_embeddings_select_own" on public.brand_memory_embeddings;
create policy "brand_memory_embeddings_select_own"
on public.brand_memory_embeddings
for select
using (auth.uid() = user_id);

drop policy if exists "brand_memory_embeddings_insert_own" on public.brand_memory_embeddings;
create policy "brand_memory_embeddings_insert_own"
on public.brand_memory_embeddings
for insert
with check (auth.uid() = user_id);

drop policy if exists "brand_memory_embeddings_update_own" on public.brand_memory_embeddings;
create policy "brand_memory_embeddings_update_own"
on public.brand_memory_embeddings
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "brand_memory_embeddings_delete_own" on public.brand_memory_embeddings;
create policy "brand_memory_embeddings_delete_own"
on public.brand_memory_embeddings
for delete
using (auth.uid() = user_id);

create or replace function public.match_brand_memory(
  query_embedding extensions.vector(768),
  match_user_id uuid,
  match_count integer default 5,
  match_memory_types text[] default null
)
returns table (
  id uuid,
  brand_profile_id uuid,
  source_table text,
  source_id uuid,
  source_key text,
  memory_type text,
  content_text text,
  metadata jsonb,
  similarity double precision
)
language sql
stable
set search_path = public, extensions
as $$
  select
    brand_memory_embeddings.id,
    brand_memory_embeddings.brand_profile_id,
    brand_memory_embeddings.source_table,
    brand_memory_embeddings.source_id,
    brand_memory_embeddings.source_key,
    brand_memory_embeddings.memory_type,
    brand_memory_embeddings.content_text,
    brand_memory_embeddings.metadata,
    1 - (brand_memory_embeddings.embedding <=> query_embedding) as similarity
  from public.brand_memory_embeddings
  where brand_memory_embeddings.user_id = match_user_id
    and (
      match_memory_types is null
      or cardinality(match_memory_types) = 0
      or brand_memory_embeddings.memory_type = any(match_memory_types)
    )
  order by brand_memory_embeddings.embedding <=> query_embedding
  limit greatest(coalesce(match_count, 5), 1);
$$;

grant execute on function public.match_brand_memory(extensions.vector(768), uuid, integer, text[])
  to authenticated, service_role;
