alter table public.brand_profiles
add column if not exists country text,
add column if not exists language text,
add column if not exists website_url text,
add column if not exists logo_url text,
add column if not exists primary_color text,
add column if not exists secondary_color text,
add column if not exists accent_color text;
