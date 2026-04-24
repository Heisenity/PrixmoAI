update public.brand_profiles
set username = nullif(
  left(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(lower(trim(username)), '^@+', ''),
          '[\s-]+',
          '_',
          'g'
        ),
        '[^a-z0-9._]+',
        '',
        'g'
      ),
      '(^[._]+|[._]+$)',
      '',
      'g'
    ),
    30
  ),
  ''
)
where username is not null;

create unique index if not exists brand_profiles_username_unique_idx
  on public.brand_profiles (username)
  where username is not null;
