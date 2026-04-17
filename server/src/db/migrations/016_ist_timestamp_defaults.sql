create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

alter table if exists public.brand_profiles
  alter column created_at set default now(),
  alter column updated_at set default now();

alter table if exists public.generated_content
  alter column created_at set default now(),
  alter column updated_at set default now();

alter table if exists public.generated_images
  alter column created_at set default now(),
  alter column updated_at set default now();

alter table if exists public.social_accounts
  alter column connected_at set default now(),
  alter column created_at set default now(),
  alter column updated_at set default now();

alter table if exists public.scheduled_posts
  alter column created_at set default now(),
  alter column updated_at set default now();

alter table if exists public.analytics
  alter column recorded_at set default now(),
  alter column created_at set default now(),
  alter column updated_at set default now();

alter table if exists public.subscriptions
  alter column created_at set default now(),
  alter column updated_at set default now();

alter table if exists public.usage_tracking
  alter column used_at set default now();

alter table if exists public.generate_conversations
  alter column created_at set default now(),
  alter column updated_at set default now();

alter table if exists public.generate_messages
  alter column created_at set default now();

alter table if exists public.generated_assets
  alter column created_at set default now();

alter table if exists public.oauth_connection_sessions
  alter column created_at set default now(),
  alter column updated_at set default now();

alter table if exists public.analytics_audience_snapshots
  alter column recorded_at set default now(),
  alter column created_at set default now(),
  alter column updated_at set default now();

alter table if exists public.media_assets
  alter column created_at set default now();

alter table if exists public.schedule_batches
  alter column created_at set default now(),
  alter column updated_at set default now();

alter table if exists public.scheduled_items
  alter column created_at set default now(),
  alter column updated_at set default now();

alter table if exists public.draft_batches
  alter column created_at set default now();
