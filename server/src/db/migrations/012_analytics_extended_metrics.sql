alter table public.analytics
  add column if not exists post_type text,
  add column if not exists caption text,
  add column if not exists media_url text,
  add column if not exists thumbnail_url text,
  add column if not exists reactions integer not null default 0,
  add column if not exists video_plays integer not null default 0,
  add column if not exists completion_rate numeric(8, 2),
  add column if not exists followers_at_post_time integer,
  add column if not exists published_time timestamptz,
  add column if not exists top_comments jsonb not null default '[]'::jsonb;

create index if not exists analytics_published_time_idx
  on public.analytics (published_time desc);
