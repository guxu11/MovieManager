# Movie Manager -- Agent Context

## Purpose

A lightweight movie file location index system. Users scan video directories on each device, then search by filename/keyword to find which device and folder contains a given file. No actual files are uploaded -- only metadata (filename, relative path, size, mtime, extracted code).

## Architecture

### Three Components

1. **Web Frontend** (`index.html` + `app.js` + `styles.css`)
   - Pure static site served from repo root
   - No build step, no framework
   - Runs on any device's browser
   - Dual-store: API store or Demo/local store

2. **Browser Extension** (`extension/`)
   - Manifest V3 Chrome/Edge popup extension
   - Contains app.html, app.js, styles.css, background.js, manifest.json
   - Identical UI to web app but adds: favorites tab, native messaging support, directory handle persistence, pagination, search caching
   - `extension/app.js` (~1314 lines) is the authoritative version (larger than root app.js ~729 lines)
   - `extension/background.js` service worker handles native messaging bridge

3. **Native Messaging Host** (`native-helper/`)
   - Python script + optional precompiled C binary
   - Protocol: 4-byte little-endian length prefix + JSON payload over stdin/stdout
   - Message types: `PING_HELPER`, `SCAN_DIRECTORY`, `OPEN_LOCAL_FILE`
   - Security: `allowedRoots` whitelist from `config.json`
   - Player selection: IINA > VLC > ffplay > default opener (macOS)

### Backend

- **Vercel Serverless Functions** (`api/`)
  - 6 route handlers: health, sync, search, sources, favorites, reindex-search
  - 3 lib modules: supabase.js (core utilities), deepl.js (translation), search-text.js (alias dictionary)
  - No framework (Express-less, raw Vercel handler convention)
  - Every route: `if (req.method !== "X") return methodNotAllowed(res)`

- **Supabase** (`supabase/`)
  - PostgreSQL 17 with pg_trgm for GIN trigram search
  - RLS enabled; anon/authenticated roles have zero permissions
  - All DB access is server-side via Vercel API using `SUPABASE_SERVICE_ROLE_KEY`
  - 3 migrations in `supabase/migrations/`

### Deployment

- Frontend + Extension: static files (any CDN or Vercel static hosting)
- API: Vercel serverless (env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, optional `DEEPL_API_KEY`)
- Supabase: cloud project (or local via `supabase start`)

## Data Flow

```
User scans directory
  --> JS walks filesystem (WebFS API or file picker)
  --> Normalizes file metadata (filename, relative_path, size, mtime, code)
  --> Chunks of 500 POST /api/sync
  --> API validates, dedupes, upserts into Supabase files table
  --> GIN trigram index on search_text/search_aliases
  --> User searches GET /api/search?q=keyword
  --> API does GIN ilike search, fetches all candidates (batched), JS-level token match
  --> Returns paginated results with device/source nesting
```

## Key Constants (must stay in sync across components)

| Constant | Values | Locations |
|----------|--------|-----------|
| `VIDEO_SUFFIXES` | `mp4,ts,mkv,avi,mov,wmv,flv,m4v` | `app.js:1`, `extension/app.js:1`, `api/lib/supabase.js:3` |
| `REMOTE_SYNC_CHUNK_SIZE` | `500` | `app.js:5`, `extension/app.js:7` |
| `DEMO_KEY` | `"movie-manager:demo-db"` | `app.js:3`, `extension/app.js:3` |
| `SETTINGS_KEY` | `"movie-manager:settings"` | `app.js:2`, `extension/app.js:2` |
| `NATIVE_HOST` | `"com.movie_manager.helper"` | `extension/background.js:1`, `native-helper/install_native_host.py:11` |
| `DEFAULT_API_BASE_URL` | `"https://moviemanager-rho.vercel.app"` | `app.js:6`, `extension/app.js:10` |
| `CHUNK_SIZE` (API) | `500` | `api/lib/supabase.js` |
| `MAX_FILES_PER_SYNC` | `30000` | `api/lib/supabase.js` |

## Search Logic

1. **Code matching** -- Regex `(?:^|[^a-z0-9])([a-z]{2,8})[\\s._-]*0*([0-9]{2,6})(?:[^a-z0-9]|$)` extracts codes like `ABC-123` from filenames. Exact code match goes directly to SQL.
2. **Token matching** -- Query split by `[\s._,，、;；|/()[\]{}']+` into parts. Each part expanded by synonym dictionary. SQL `ilike` wildcard match across `filename`, `relative_path`, `search_text`, `search_aliases` GIN indexes.
3. **DeepL fallback** -- If tokens lack dictionary coverage, call DeepL to translate query to EN/ZH/JA, then expand search with translations.
4. **JS filter** -- After fetching SQL candidates, run JS-level `matchesSearchTokens()` for precision (dictionary alias expansion that SQL cannot do).

### Alias Dictionary (`api/lib/search-text.js`)

- 77 semantic groups of equivalent terms (en/zh/ja)
- Example: `["nurse", "nurses", "护士", "護理", "看護", "看護師"]`
- `buildSearchDocument()` expands filename tokens through alias lookup for search indexing
- `tokenizeSearchQuery()` splits and expands query tokens
- `hasDictionaryCoverage()` gates whether DeepL fallback is needed

## Database Schema

```
devices (1) ──< sources (*)
   │                  │
   │                  │
   └──────────────────┘
     (also direct)

devices (1) ──< files (*)
```

### `public.devices`
| Column | Type | Constraints |
|--------|------|-------------|
| `id` | UUID | PK, gen_random_uuid() |
| `name` | TEXT | NOT NULL, UNIQUE |
| `created_at` | TIMESTAMPTZ | DEFAULT now() |
| `last_sync_at` | TIMESTAMPTZ | nullable |

### `public.sources`
| Column | Type | Constraints |
|--------|------|-------------|
| `id` | UUID | PK, gen_random_uuid() |
| `device_id` | UUID | FK -> devices(id) ON DELETE CASCADE |
| `name` | TEXT | NOT NULL |
| `path_label` | TEXT | nullable (real filesystem root for display) |
| `file_count` | INTEGER | DEFAULT 0 |
| `created_at` | TIMESTAMPTZ | |
| `last_sync_at` | TIMESTAMPTZ | |
| UNIQUE | | (device_id, name) |

### `public.files`
| Column | Type | Constraints |
|--------|------|-------------|
| `id` | UUID | PK, gen_random_uuid() |
| `device_id` | UUID | FK -> devices(id) ON DELETE CASCADE |
| `source_id` | UUID | FK -> sources(id) ON DELETE CASCADE |
| `filename` | TEXT | NOT NULL |
| `relative_path` | TEXT | NOT NULL |
| `size_bytes` | BIGINT | |
| `mtime` | TIMESTAMPTZ | |
| `code` | TEXT | Extracted from filename |
| `is_favorite` | BOOLEAN | DEFAULT false |
| `last_seen_at` | TIMESTAMPTZ | DEFAULT now() |
| `search_text` | TEXT | Full search text |
| `search_aliases` | TEXT | Expanded alias versions |

### Indexes
- `files_code_idx` on `(code)` -- btree
- `files_device_source_idx` on `(device_id, source_id)` -- btree
- `files_filename_trgm_idx` on `filename` -- GIN trigram
- `files_device_filename_unique` on `(device_id, filename)` -- unique
- `files_favorite_idx` on `(is_favorite, last_seen_at desc)` -- btree
- `files_search_text_trgm_idx` on `search_text` -- GIN trigram
- `files_search_aliases_trgm_idx` on `search_aliases` -- GIN trigram

## Duplicate Code Locations

- `extractCode()` and `isVideoFile()` exist in **3 files**: `app.js`, `extension/app.js`, `api/lib/supabase.js`
- `normalizeCode()` exists in all 3 as well
- `normalizeSearchText()` and alias dictionary in `api/lib/search-text.js`
- `formatBytes()` and `formatDate()` exist in both frontend `app.js` and extension `app.js`
- **Rule**: when updating a duplicated function, update ALL copies

## Settings & Environment

| File | Purpose | Git tracked? |
|------|---------|-------------|
| `.env` | Empty (Vercel env vars are server-side only) | Yes (empty) |
| `vercel.json` | Vercel deployment config | Yes |
| `extension/config.js` | Override API base URL | No (gitignored) |
| `extension/config.example.js` | Template for config.js | Yes |
| `native-helper/config.json` | allowedRoots + player | No (gitignored) |
| `native-helper/config.example.json` | Template | Yes |
| `supabase/config.toml` | Supabase local dev config | Yes |

## How to Run Locally

```bash
# Serve frontend and extension (both are static files)
python3 -m http.server 4173
# Open http://localhost:4173 for web, http://localhost:4173/extension/ for extension popup

# For API development, start Supabase locally:
supabase start
supabase db push
# Then point API env vars to localhost

# Apply schema to cloud project:
./scripts/apply_schema.sh [project-ref]
```

## Git Workflow

- Single branch: `master` (now also `harness` for harness infrastructure)
- Version `0.3.4` in extension manifest
- Recent versions: 0.2.2, with windows fix

## Things an Agent Should Not Change Without Care

- **Supabase schema** -- must also update `supabase/schema.sql` and create a migration
- **VIDEO_SUFFIXES** -- defined in 3 files, all must be updated together
- **Never commit secrets** -- API keys, `.env` values, `native-helper/config.json` are gitignored
- **API uses Supabase REST** -- no raw SQL; changing to raw SQL requires adding parameterized queries
- **Frontend dual-store pattern** -- both `createApiStore` and `createDemoStore` must maintain the same interface
