alter table public.brand_memory_embeddings
  add column if not exists search_document tsvector
  generated always as (
    to_tsvector('simple', coalesce(content_text, ''))
  ) stored;

create index if not exists brand_memory_embeddings_search_document_idx
  on public.brand_memory_embeddings
  using gin (search_document);

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
  hybrid_score double precision
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
    ) as hybrid_score
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
