alter table public.files
  add column if not exists search_text text,
  add column if not exists search_aliases text;

create index if not exists files_search_text_trgm_idx
  on public.files using gin (search_text gin_trgm_ops);

create index if not exists files_search_aliases_trgm_idx
  on public.files using gin (search_aliases gin_trgm_ops);

update public.files
set search_text = trim(concat_ws(' ', filename, relative_path, code)),
    search_aliases = coalesce(search_aliases, '')
where search_text is null;
