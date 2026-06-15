# Movie Manager -- Feature List

Each feature tracks work across agent sessions. Use `[x]` for done, `[ ]` for pending/doing.

## Core UI
- [x] Basic search by keyword or filename fragment
- [x] Display device name, directory name, path label, relative path, file size, last sync time
- [x] Static site served via python3 -m http.server
- [ ] Full-screen responsive layout on mobile
- [ ] Dark mode toggle
- [ ] Keyboard shortcut for search (e.g., `/` or `Cmd+K`)
- [ ] Result highlight / snippet view

## Sync
- [x] Directory scan via File System Access API (picker)
- [x] Upload file index only (filename, relative_path, size, mtime, code)
- [x] Replace-on-write per device+source snapshot strategy
- [x] Chunked sync (500 files per batch)
- [ ] Delta sync (only upload changed files by mtime/hash)
- [ ] Manual file picker fallback for Safari/Firefox compatibility
- [ ] Sync progress indicator with percentage

## Search
- [x] Token-based search split by common delimiters
- [x] Cross-lingual alias dictionary (en/zh/ja) for common terms (77 groups)
- [x] PostgreSQL GIN trigram fuzzy matching on search_text / search_aliases
- [x] Exact code matching (e.g., "SSIS-894")
- [x] DeepL API translation fallback when dictionary doesn't cover query
- [x] Pagination (10 results per page)
- [x] Search history cached in localStorage (24h TTL)
- [ ] Search history / recent queries sidebar UI
- [ ] Result sorting options (by size, mtime, device)
- [ ] Advanced filters (by device, by directory, by size range)

## Extension
- [x] Manifest V3 Chrome/Edge popup extension
- [x] Favorites tab with star toggle
- [x] Pagination UI in popup
- [x] Native helper integration (open local file, scan directory)
- [x] IndexedDB-based directory handle persistence for one-click sync
- [x] Search state caching in localStorage
- [ ] Automatic background refresh on popup open
- [ ] Context menu "Search with Movie Manager" on selected text
- [ ] Persistent popup state (remember last query across opens)
- [ ] Chrome Web Store publishable build

## Favorites
- [x] Toggle favorite on file rows
- [x] Dedicated favorites tab (limited to 200 results)
- [x] Favorite state synced to database (`is_favorite` column)
- [ ] Favorites filterable by device or source
- [ ] Export favorites list as JSON/CSV

## Native Helper
- [x] Python native messaging host (JSON over stdin/stdout)
- [x] C implementation with precompiled binary
- [x] Cross-platform installer (Windows/Mac/Linux, Chrome/Edge)
- [x] `allowedRoots` whitelist security model
- [x] Player selection chain (IINA > VLC > ffplay > default)
- [x] Recursive directory scan with video extension filter
- [x] Config file (config.json) with allowedRoots + player settings
- [ ] Windows registry-based installer (PowerShell)
- [ ] Linux .desktop entry + D-Bus activation
- [ ] Error codes for file open failures

## API
- [x] `/api/health` -- health check (Supabase connectivity)
- [x] `/api/sync` -- POST: upload file index snapshot
- [x] `/api/search` -- GET: search files with pagination
- [x] `/api/sources` -- GET/PATCH: list/update directory sources
- [x] `/api/favorites` -- GET/PATCH: favorite management
- [x] `/api/reindex-search` -- POST: rebuild search_text/search_aliases
- [x] Supabase REST wrapper (no SDK, direct fetch)
- [x] Input sanitization (safeText, cleanFile, length/suffix/count validation)
- [x] RLS on all tables (anon/authenticated revoked, API uses service role)
- [x] No SQL injection risk (REST only, no raw SQL)
- [ ] Authenticated API routes (JWT tokens)
- [ ] Rate limiting on sync endpoint
- [ ] Pagination on sources list endpoint
- [ ] API response caching (Edge functions / Redis)

## Database
- [x] 3 tables: devices, sources, files
- [x] RLS enabled with zero public access
- [x] GIN trigram indexes on search_text, search_aliases, filename
- [x] Unique constraint (device_id, filename) per device
- [x] Favorite index (is_favorite, last_seen_at desc)
- [x] Code index for exact code lookup
- [x] 3 migrations (initial schema, favorites, enhanced search fields)
- [x] Supabase local dev config (config.toml)
- [ ] Automatic migration versioning via supabase CLI migrations
- [ ] Full-text search using tsvector instead of trigram (opt-in future)
- [ ] Storage bucket for small cover art thumbnails

## DevOps
- [x] Vercel deployment config (vercel.json)
- [x] Supabase CLI schema push script (scripts/apply_schema.sh)
- [x] Local dev via `python3 -m http.server`
- [ ] GitHub Actions CI: lint + syntax check
- [ ] Vercel build hook triggers full redeploy
- [ ] Supabase local dev environment via `supabase start`

## Infrastructure
- [x] Supabase cloud project (PostgreSQL 17)
- [x] Vercel serverless hosting
- [ ] Custom domain setup with SSL
- [ ] Basic analytics (Plausible or self-hosted)
