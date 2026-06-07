create extension if not exists pg_trgm;
create extension if not exists pgcrypto;

create table if not exists public.devices (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now(),
  last_sync_at timestamptz
);

create table if not exists public.sources (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.devices(id) on delete cascade,
  name text not null,
  path_label text,
  file_count integer not null default 0,
  created_at timestamptz not null default now(),
  last_sync_at timestamptz,
  unique (device_id, name)
);

create table if not exists public.files (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.devices(id) on delete cascade,
  source_id uuid not null references public.sources(id) on delete cascade,
  filename text not null,
  relative_path text not null,
  size_bytes bigint,
  mtime timestamptz,
  code text,
  last_seen_at timestamptz not null default now()
);

create index if not exists files_code_idx on public.files (code);
create index if not exists files_device_source_idx on public.files (device_id, source_id);
create index if not exists files_filename_trgm_idx on public.files using gin (filename gin_trgm_ops);
create unique index if not exists files_device_filename_unique on public.files (device_id, filename);

alter table public.sources add column if not exists file_count integer not null default 0;

update public.sources
set file_count = counts.file_count
from (
  select source_id, count(*)::integer as file_count
  from public.files
  group by source_id
) counts
where public.sources.id = counts.source_id;

alter table public.devices enable row level security;
alter table public.sources enable row level security;
alter table public.files enable row level security;

grant usage on schema public to anon;
revoke all on public.devices from anon;
revoke all on public.sources from anon;
revoke all on public.files from anon;
revoke all on public.devices from authenticated;
revoke all on public.sources from authenticated;
revoke all on public.files from authenticated;
revoke all on public.devices from public;
revoke all on public.sources from public;
revoke all on public.files from public;
