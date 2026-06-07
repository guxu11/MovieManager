alter table public.files add column if not exists is_favorite boolean not null default false;

create index if not exists files_favorite_idx
  on public.files (is_favorite, last_seen_at desc);
