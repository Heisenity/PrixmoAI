alter table public.social_accounts
  add column if not exists profile_url text,
  add column if not exists oauth_provider text,
  add column if not exists verification_status text not null default 'unverified',
  add column if not exists verified_at timestamptz;

update public.social_accounts
set
  profile_url = coalesce(profile_url, metadata ->> 'profileUrl'),
  verification_status = case
    when coalesce(metadata ->> 'verificationStatus', '') in ('verified', 'expired', 'revoked')
      then metadata ->> 'verificationStatus'
    else verification_status
  end,
  oauth_provider = coalesce(oauth_provider, metadata ->> 'oauthProvider'),
  verified_at = coalesce(verified_at, nullif(metadata ->> 'verifiedAt', '')::timestamptz)
where
  profile_url is null
  or oauth_provider is null
  or verification_status = 'unverified'
  or verified_at is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'social_accounts_verification_status_check'
  ) then
    alter table public.social_accounts
      add constraint social_accounts_verification_status_check
      check (verification_status in ('unverified', 'verified', 'expired', 'revoked'));
  end if;
end $$;

alter table public.scheduled_posts
  add column if not exists external_post_id text,
  add column if not exists publish_attempted_at timestamptz,
  add column if not exists last_error text;

create index if not exists scheduled_posts_status_scheduled_for_idx
  on public.scheduled_posts (status, scheduled_for);
