alter table public.usage_tracking
  add column if not exists idempotency_key text;

create unique index if not exists usage_tracking_user_feature_idempotency_idx
  on public.usage_tracking (user_id, feature_key, idempotency_key)
  where idempotency_key is not null;
