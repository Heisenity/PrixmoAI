alter table public.brand_memory_embeddings
  add column if not exists quality_score double precision not null default 0.5,
  add column if not exists promotion_score double precision not null default 0,
  add column if not exists performance_score double precision not null default 0,
  add column if not exists reuse_count integer not null default 0,
  add column if not exists successful_reuse_count integer not null default 0,
  add column if not exists acceptance_count integer not null default 0,
  add column if not exists rejection_count integer not null default 0,
  add column if not exists regeneration_count integer not null default 0,
  add column if not exists edit_count integer not null default 0,
  add column if not exists schedule_use_count integer not null default 0,
  add column if not exists last_feedback_at timestamptz,
  add column if not exists archived_at timestamptz;

create index if not exists brand_memory_embeddings_quality_idx
  on public.brand_memory_embeddings (
    user_id,
    memory_type,
    quality_score desc,
    performance_score desc,
    updated_at desc
  )
  where archived_at is null;

create table if not exists public.brand_memory_feedback_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  brand_profile_id uuid references public.brand_profiles(id) on delete set null,
  source_table text not null,
  source_id uuid not null,
  source_key text not null default 'primary',
  memory_type text not null,
  event_type text not null
    check (
      event_type in (
        'accepted',
        'rejected',
        'regenerated',
        'edited',
        'scheduled',
        'reused',
        'performance_promoted',
        'performance_demoted',
        'schedule_opened'
      )
    ),
  platform text,
  content_id uuid references public.generated_content(id) on delete set null,
  generated_image_id uuid references public.generated_images(id) on delete set null,
  scheduled_post_id uuid references public.scheduled_posts(id) on delete set null,
  scheduled_item_id uuid references public.scheduled_items(id) on delete set null,
  intensity double precision not null default 1,
  was_ai_recommended boolean not null default false,
  weight_delta double precision,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists brand_memory_feedback_events_user_id_idx
  on public.brand_memory_feedback_events (user_id, created_at desc);

create index if not exists brand_memory_feedback_events_source_idx
  on public.brand_memory_feedback_events (user_id, source_table, source_id, source_key, created_at desc);

create index if not exists brand_memory_feedback_events_platform_idx
  on public.brand_memory_feedback_events (user_id, platform, created_at desc);

alter table public.brand_memory_feedback_events enable row level security;

drop policy if exists "brand_memory_feedback_events_select_own" on public.brand_memory_feedback_events;
create policy "brand_memory_feedback_events_select_own"
on public.brand_memory_feedback_events
for select
using (auth.uid() = user_id);

drop policy if exists "brand_memory_feedback_events_insert_own" on public.brand_memory_feedback_events;
create policy "brand_memory_feedback_events_insert_own"
on public.brand_memory_feedback_events
for insert
with check (auth.uid() = user_id);

drop policy if exists "brand_memory_feedback_events_update_own" on public.brand_memory_feedback_events;
create policy "brand_memory_feedback_events_update_own"
on public.brand_memory_feedback_events
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "brand_memory_feedback_events_delete_own" on public.brand_memory_feedback_events;
create policy "brand_memory_feedback_events_delete_own"
on public.brand_memory_feedback_events
for delete
using (auth.uid() = user_id);

create table if not exists public.brand_memory_generation_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  brand_profile_id uuid references public.brand_profiles(id) on delete set null,
  task_type text not null,
  request_context text,
  provider text,
  rerank_provider text,
  fallback_used boolean not null default false,
  retrieval_strategy text,
  query_text text not null,
  selected_platform text,
  selected_goal text,
  retrieved_memories jsonb not null default '[]'::jsonb,
  selected_memories jsonb not null default '[]'::jsonb,
  analytics_context jsonb not null default '{}'::jsonb,
  evaluation_summary jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists brand_memory_generation_logs_user_id_idx
  on public.brand_memory_generation_logs (user_id, created_at desc);

create index if not exists brand_memory_generation_logs_task_idx
  on public.brand_memory_generation_logs (user_id, task_type, created_at desc);

alter table public.brand_memory_generation_logs enable row level security;

drop policy if exists "brand_memory_generation_logs_select_own" on public.brand_memory_generation_logs;
create policy "brand_memory_generation_logs_select_own"
on public.brand_memory_generation_logs
for select
using (auth.uid() = user_id);

drop policy if exists "brand_memory_generation_logs_insert_own" on public.brand_memory_generation_logs;
create policy "brand_memory_generation_logs_insert_own"
on public.brand_memory_generation_logs
for insert
with check (auth.uid() = user_id);

drop policy if exists "brand_memory_generation_logs_update_own" on public.brand_memory_generation_logs;
create policy "brand_memory_generation_logs_update_own"
on public.brand_memory_generation_logs
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "brand_memory_generation_logs_delete_own" on public.brand_memory_generation_logs;
create policy "brand_memory_generation_logs_delete_own"
on public.brand_memory_generation_logs
for delete
using (auth.uid() = user_id);

create table if not exists public.brand_platform_memory_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  brand_profile_id uuid references public.brand_profiles(id) on delete set null,
  platform text not null,
  snapshot_type text not null default 'performance',
  summary_text text not null,
  metrics jsonb not null default '{}'::jsonb,
  top_posts jsonb not null default '[]'::jsonb,
  signals jsonb not null default '{}'::jsonb,
  source_window_start timestamptz,
  source_window_end timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint brand_platform_memory_snapshots_unique
    unique (user_id, platform, snapshot_type)
);

create index if not exists brand_platform_memory_snapshots_user_id_idx
  on public.brand_platform_memory_snapshots (user_id, updated_at desc);

create index if not exists brand_platform_memory_snapshots_platform_idx
  on public.brand_platform_memory_snapshots (user_id, platform, updated_at desc);

drop trigger if exists set_brand_platform_memory_snapshots_updated_at
  on public.brand_platform_memory_snapshots;
create trigger set_brand_platform_memory_snapshots_updated_at
before update on public.brand_platform_memory_snapshots
for each row
execute function public.set_updated_at();

alter table public.brand_platform_memory_snapshots enable row level security;

drop policy if exists "brand_platform_memory_snapshots_select_own" on public.brand_platform_memory_snapshots;
create policy "brand_platform_memory_snapshots_select_own"
on public.brand_platform_memory_snapshots
for select
using (auth.uid() = user_id);

drop policy if exists "brand_platform_memory_snapshots_insert_own" on public.brand_platform_memory_snapshots;
create policy "brand_platform_memory_snapshots_insert_own"
on public.brand_platform_memory_snapshots
for insert
with check (auth.uid() = user_id);

drop policy if exists "brand_platform_memory_snapshots_update_own" on public.brand_platform_memory_snapshots;
create policy "brand_platform_memory_snapshots_update_own"
on public.brand_platform_memory_snapshots
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "brand_platform_memory_snapshots_delete_own" on public.brand_platform_memory_snapshots;
create policy "brand_platform_memory_snapshots_delete_own"
on public.brand_platform_memory_snapshots
for delete
using (auth.uid() = user_id);

alter table public.scheduled_items
  add column if not exists metadata jsonb not null default '{}'::jsonb;

drop function if exists public.match_brand_memory(
  extensions.vector(768),
  uuid,
  integer,
  text[]
);

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
  similarity double precision,
  quality_score double precision,
  promotion_score double precision,
  performance_score double precision,
  reuse_count integer,
  successful_reuse_count integer,
  acceptance_count integer,
  rejection_count integer,
  regeneration_count integer,
  edit_count integer,
  schedule_use_count integer,
  last_feedback_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
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
    1 - (brand_memory_embeddings.embedding <=> query_embedding) as similarity,
    brand_memory_embeddings.quality_score,
    brand_memory_embeddings.promotion_score,
    brand_memory_embeddings.performance_score,
    brand_memory_embeddings.reuse_count,
    brand_memory_embeddings.successful_reuse_count,
    brand_memory_embeddings.acceptance_count,
    brand_memory_embeddings.rejection_count,
    brand_memory_embeddings.regeneration_count,
    brand_memory_embeddings.edit_count,
    brand_memory_embeddings.schedule_use_count,
    brand_memory_embeddings.last_feedback_at,
    brand_memory_embeddings.archived_at,
    brand_memory_embeddings.created_at,
    brand_memory_embeddings.updated_at
  from public.brand_memory_embeddings
  where brand_memory_embeddings.user_id = match_user_id
    and brand_memory_embeddings.archived_at is null
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

drop function if exists public.hybrid_match_brand_memory(
  extensions.vector(768),
  text,
  uuid,
  integer,
  text[],
  integer,
  integer
);

create or replace function public.hybrid_match_brand_memory(
  query_embedding extensions.vector(768),
  query_text text,
  match_user_id uuid,
  match_count integer default 7,
  match_memory_types text[] default null,
  vector_limit integer default 24,
  keyword_limit integer default 24
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
  similarity double precision,
  vector_similarity double precision,
  keyword_score double precision,
  hybrid_score double precision,
  quality_score double precision,
  promotion_score double precision,
  performance_score double precision,
  reuse_count integer,
  successful_reuse_count integer,
  acceptance_count integer,
  rejection_count integer,
  regeneration_count integer,
  edit_count integer,
  schedule_use_count integer,
  last_feedback_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
set search_path = public, extensions
as $$
  with normalized_query as (
    select nullif(trim(coalesce(query_text, '')), '') as text_query
  ),
  vector_matches as (
    select
      memory.id,
      greatest(0::double precision, 1 - (memory.embedding <=> query_embedding)) as vector_similarity
    from public.brand_memory_embeddings as memory
    where memory.user_id = match_user_id
      and memory.archived_at is null
      and (
        match_memory_types is null
        or cardinality(match_memory_types) = 0
        or memory.memory_type = any(match_memory_types)
      )
    order by memory.embedding <=> query_embedding
    limit greatest(coalesce(vector_limit, 24), 1)
  ),
  keyword_matches as (
    select
      memory.id,
      ts_rank_cd(memory.search_document, websearch_to_tsquery('simple', normalized_query.text_query))::double precision as keyword_score
    from public.brand_memory_embeddings as memory
    cross join normalized_query
    where normalized_query.text_query is not null
      and memory.user_id = match_user_id
      and memory.archived_at is null
      and (
        match_memory_types is null
        or cardinality(match_memory_types) = 0
        or memory.memory_type = any(match_memory_types)
      )
      and memory.search_document @@ websearch_to_tsquery('simple', normalized_query.text_query)
    order by keyword_score desc
    limit greatest(coalesce(keyword_limit, 24), 1)
  ),
  candidate_scores as (
    select
      coalesce(vector_matches.id, keyword_matches.id) as id,
      coalesce(vector_matches.vector_similarity, 0::double precision) as vector_similarity,
      coalesce(
        keyword_matches.keyword_score / (1 + keyword_matches.keyword_score),
        0::double precision
      ) as keyword_score
    from vector_matches
    full outer join keyword_matches
      on keyword_matches.id = vector_matches.id
  )
  select
    memory.id,
    memory.brand_profile_id,
    memory.source_table,
    memory.source_id,
    memory.source_key,
    memory.memory_type,
    memory.content_text,
    memory.metadata,
    greatest(
      candidate_scores.vector_similarity,
      least(
        1::double precision,
        candidate_scores.vector_similarity * 0.82
          + candidate_scores.keyword_score * 0.28
          + case
              when candidate_scores.vector_similarity > 0
               and candidate_scores.keyword_score > 0
                then 0.05
              else 0
            end
      )
    ) as similarity,
    candidate_scores.vector_similarity,
    candidate_scores.keyword_score,
    least(
      1::double precision,
      candidate_scores.vector_similarity * 0.82
        + candidate_scores.keyword_score * 0.28
        + case
            when candidate_scores.vector_similarity > 0
             and candidate_scores.keyword_score > 0
              then 0.05
            else 0
          end
    ) as hybrid_score,
    memory.quality_score,
    memory.promotion_score,
    memory.performance_score,
    memory.reuse_count,
    memory.successful_reuse_count,
    memory.acceptance_count,
    memory.rejection_count,
    memory.regeneration_count,
    memory.edit_count,
    memory.schedule_use_count,
    memory.last_feedback_at,
    memory.archived_at,
    memory.created_at,
    memory.updated_at
  from candidate_scores
  join public.brand_memory_embeddings as memory
    on memory.id = candidate_scores.id
  order by hybrid_score desc, similarity desc, memory.created_at desc
  limit greatest(coalesce(match_count, 7), 1);
$$;

grant execute on function public.hybrid_match_brand_memory(
  extensions.vector(768),
  text,
  uuid,
  integer,
  text[],
  integer,
  integer
) to authenticated, service_role;
