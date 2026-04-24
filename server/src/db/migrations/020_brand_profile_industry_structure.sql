alter table public.brand_profiles
add column if not exists primary_industry text,
add column if not exists secondary_industries text[] not null default '{}';
