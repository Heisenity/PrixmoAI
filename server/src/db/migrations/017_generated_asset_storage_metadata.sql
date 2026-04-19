alter table if exists public.generated_content
  add column if not exists storage_provider text,
  add column if not exists storage_bucket text,
  add column if not exists storage_object_key text,
  add column if not exists storage_public_url text,
  add column if not exists storage_content_type text,
  add column if not exists storage_size_bytes bigint;

alter table if exists public.generated_images
  add column if not exists storage_provider text,
  add column if not exists storage_bucket text,
  add column if not exists storage_object_key text,
  add column if not exists storage_public_url text,
  add column if not exists storage_content_type text,
  add column if not exists storage_size_bytes bigint;
