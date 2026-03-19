create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'basic', 'pro')),
  status text not null default 'active'
    check (status in ('trialing', 'active', 'past_due', 'cancelled', 'expired')),
  monthly_limit integer,
  current_period_end timestamptz,
  razorpay_customer_id text,
  razorpay_subscription_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists subscriptions_user_id_idx
  on public.subscriptions (user_id);

drop trigger if exists set_subscriptions_updated_at on public.subscriptions;
create trigger set_subscriptions_updated_at
before update on public.subscriptions
for each row
execute function public.set_updated_at();

alter table public.subscriptions enable row level security;

drop policy if exists "subscriptions_select_own" on public.subscriptions;
create policy "subscriptions_select_own"
on public.subscriptions
for select
using (auth.uid() = user_id);

drop policy if exists "subscriptions_insert_own" on public.subscriptions;
create policy "subscriptions_insert_own"
on public.subscriptions
for insert
with check (auth.uid() = user_id);

drop policy if exists "subscriptions_update_own" on public.subscriptions;
create policy "subscriptions_update_own"
on public.subscriptions
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "subscriptions_delete_own" on public.subscriptions;
create policy "subscriptions_delete_own"
on public.subscriptions
for delete
using (auth.uid() = user_id);

create table if not exists public.usage_tracking (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  feature_key text not null,
  used_at timestamptz not null default timezone('utc', now()),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists usage_tracking_user_feature_idx
  on public.usage_tracking (user_id, feature_key, used_at desc);

alter table public.usage_tracking enable row level security;

drop policy if exists "usage_tracking_select_own" on public.usage_tracking;
create policy "usage_tracking_select_own"
on public.usage_tracking
for select
using (auth.uid() = user_id);

drop policy if exists "usage_tracking_insert_own" on public.usage_tracking;
create policy "usage_tracking_insert_own"
on public.usage_tracking
for insert
with check (auth.uid() = user_id);

drop policy if exists "usage_tracking_update_own" on public.usage_tracking;
create policy "usage_tracking_update_own"
on public.usage_tracking
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "usage_tracking_delete_own" on public.usage_tracking;
create policy "usage_tracking_delete_own"
on public.usage_tracking
for delete
using (auth.uid() = user_id);
