alter table public.scheduled_posts
  add column if not exists media_type text
    check (media_type in ('image', 'video'));

update public.scheduled_posts
set media_type = 'image'
where media_url is not null
  and media_type is null;
