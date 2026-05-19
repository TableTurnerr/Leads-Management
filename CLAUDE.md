# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

```
web/          Next.js 16 frontend (App Router, React 19, TypeScript, Tailwind CSS 4)
ingest/       Python script that loads restaurant CSVs into Supabase
scripts/      One-off utilities (Python, MJS)
supabase/migrations/   Ordered SQL migrations (applied to the self-hosted instance)
```

## Development commands

All frontend commands run from `web/`:

```bash
cd web
npm run dev      # start dev server (runs kill-stale-postcss-workers.mjs first)
npm run build    # production build
npm run lint     # ESLint
```

Ingest (from `ingest/`):

```bash
pip install -r requirements.txt
python ingest.py
```

## Supabase

The database is a **self-hosted Supabase instance** running on a remote SSH server, accessible at `https://supabase.tableturnerr.com`. It is **not** a Supabase Cloud project — Supabase MCP cloud tools (`execute_sql`, `list_projects`, etc.) will not work here.

To interact with the database:
- **REST API (PostgREST):** `https://supabase.tableturnerr.com/rest/v1/` with `Authorization: Bearer <service_role_key>` and `apikey: <service_role_key>` headers. Service role key is in `ingest/.env`.
- **Direct SQL:** via SSH to the server, then `psql`.
- **Migrations:** create a numbered file in `supabase/migrations/` (e.g. `0013_foo.sql`) and apply it manually via psql on the server or `supabase db push`.

## Database architecture

The core table is `public.restaurants` (~146k rows). Key columns:

| Column | Type | Purpose |
|--------|------|---------|
| `cat_list` | `text[]` | Normalized category array — used for all filtering and aggregation |
| `category` | `text` | Raw source string from ingest; do not use for filtering |
| `is_chain` | `boolean` | Populated by the chains management page |
| `price_bucket` | `text` | Normalised price tier (`$`, `$$`, `$$$`, `$$$$`) |

### Why RPCs, not direct table queries

PostgREST's `db-max-rows` is set to 1000 on this instance. All queries that return more than 1000 rows must go through a custom Postgres function (RPC). Direct `.from("restaurants").select(...)` is only safe for small result sets (e.g. fetching a handful of rows by ID).

### Caching layer

Three server-side caches absorb the unfiltered "default view" load:

- `public.overview_cache` — pre-computed JSON for `restaurants_overview()` with no filters. Refreshed by ingest via `refresh_overview_cache()`.
- `public.map_cache` — pre-computed JSON for `restaurants_map_points()` with no filters. Refreshed by ingest via `refresh_map_cache()`.
- `public.restaurants_category_counts` — **materialized view** unnesting `cat_list` with per-category counts and rating stats. Refreshed via `refresh_restaurants_caches()`. Source for the facets RPC and the Categories tab.

Each cache-backed RPC checks whether all params are at their no-op defaults; if so it reads the cache row. Otherwise it falls through to a `_compute` variant.

### Filter-aware RPCs

Every data path (overview, map, categories, table export) shares the same composable WHERE predicate. The filter object in TypeScript (`Filters` in `web/src/lib/types.ts`) is translated to RPC args by `filtersToRpcArgs()` in `web/src/lib/filters.ts`. Disabled filter groups are resolved to their null/empty defaults before the call — downstream code never reads `enabled` flags.

## Frontend architecture

- **State:** Zustand store (`web/src/lib/store.ts`) persisted to `localStorage` under key `tt-app-state-v1`. Holds filters, selected rows, active tab, map viewport, and table sort/pagination state.
- **Data fetching:** SWR hooks, one per tab. Each hook's cache key includes the serialised filter state.
- **Tabs:** `overview`, `map`, `categories`, `column`, `table`, `selected` — rendered by `web/src/components/app-shell.tsx`.
- **Supabase client:** two variants — `web/src/lib/supabase/client.ts` (browser) and `web/src/lib/supabase/server.ts` (RSC/Route Handlers). The proxy client in `web/src/lib/supabase/proxy.ts` routes requests through the self-hosted URL.
- **UI components:** shadcn/ui in `web/src/components/ui/`. Plotly.js is used for all charts via a lazy-loaded wrapper (`plotly-impl.tsx`) to avoid SSR issues.

## Next.js version note

The `web/AGENTS.md` file contains a critical warning: **this Next.js version (16.x) has breaking changes** from prior versions. Read `web/node_modules/next/dist/docs/` before writing any App Router code. Do not assume behaviour from earlier Next.js training data.
