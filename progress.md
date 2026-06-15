# Progress

Tracks what has been completed, is currently being worked on, and what is pending.

## done

- Created Harness Engineering infrastructure (features.md, progress.md, context.md, .hooks/pre-commit, setup/)
- Implemented Core UI (search, display, static serving)
- Implemented Sync (directory scan, index upload, replace-on-write, chunked sync)
- Implemented Search (token search, alias dictionary, GIN trigram, code matching, DeepL fallback, pagination, search cache)
- Implemented Extension (Manifest V3, favorites, pagination, native helper, IndexedDB persistence)
- Implemented Favorites (toggle, dedicated tab, DB-synced state)
- Implemented Native Helper (Python + C, cross-platform installer, allowedRoots security, player chain)
- Implemented API (6 routes, Supabase REST wrapper, input sanitization, RLS)
- Implemented Database (3 tables, RLS, GIN trigram indexes, unique constraints, favorites index, 3 migrations)

## doing

## pending

See [features.md](./features.md) for the full feature list with per-item status.
