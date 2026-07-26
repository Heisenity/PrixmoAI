alter table public.scheduled_posts
  add column if not exists processing_started_at timestamptz,
  add column if not exists failed_at timestamptz,
  add column if not exists last_attempt_at timestamptz,
  add column if not exists next_retry_at timestamptz,
  add column if not exists retry_count integer not null default 0,
  add column if not exists platform_response jsonb;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'scheduled_posts_status_check'
      and conrelid = 'public.scheduled_posts'::regclass
  ) then
    alter table public.scheduled_posts
      drop constraint scheduled_posts_status_check;
  end if;
end $$;

alter table public.scheduled_posts
  add constraint scheduled_posts_status_check
  check (status in ('pending', 'scheduled', 'processing', 'published', 'failed', 'cancelled'));

create index if not exists scheduled_posts_due_idx
  on public.scheduled_posts (status, scheduled_for)
  where status = 'scheduled';

create index if not exists scheduled_posts_retry_due_idx
  on public.scheduled_posts (status, next_retry_at)
  where status = 'failed';

create index if not exists scheduled_posts_processing_started_idx
  on public.scheduled_posts (status, processing_started_at)
  where status = 'processing';
