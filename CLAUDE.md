# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

```
web/                   Next.js 16 frontend (App Router, React 19, TypeScript, Tailwind CSS 4)
ingest/                Python pipeline — loads restaurant CSVs into Supabase
scripts/               One-off utilities (gen-supabase-secrets.mjs, setup-cf-tunnel.sh)
apps-script/           Google Apps Script for the Sheets webhook integration
supabase/migrations/   Ordered SQL migrations (0001_init.sql … 0025_*)
Database/              Source CSV data files
processed/             Post-ingest processed output
```

## Development commands

All frontend commands run from `web/`:

```bash
cd web
npm run dev      # start dev server (predev kills stale postcss workers first)
npm run build    # production build
npm run lint     # ESLint
```

Ingest (from `ingest/`):

```bash
pip install -r requirements.txt
python ingest.py
```

## Supabase — split auth/data architecture

Two separate Supabase instances are in use:

| Role | Instance | Env var prefix | Purpose |
|------|----------|----------------|---------|
| Auth | Cloud Supabase | `NEXT_PUBLIC_SUPABASE_AUTH_*` | Sign-in, sign-up, JWT issuance |
| Data | Self-hosted (`supabase.tableturnerr.com`) | `NEXT_PUBLIC_SUPABASE_DATA_*` | All restaurant data |

The self-hosted instance verifies JWTs issued by the cloud instance via JWKS. The service-role key (`SUPABASE_DATA_SERVICE_ROLE_KEY`) is only used server-side in Route Handlers and must never be exposed to the browser.

Supabase MCP cloud tools (`execute_sql`, `list_projects`, etc.) do **not** work against the self-hosted instance. Use:
- **REST API:** `https://supabase.tableturnerr.com/rest/v1/` with `Authorization: Bearer <service_role_key>` and `apikey: <service_role_key>` headers
- **Direct SQL:** SSH to the server then `psql`
- **Migrations:** create a numbered file in `supabase/migrations/` and apply via psql or `supabase db push`

### Client variants in `web/src/lib/supabase/`

| File | Used for |
|------|---------|
| `client.ts` | Browser components — calls auth instance |
| `server.ts` | RSC / Route Handlers — reads cookies for session |
| `proxy.ts` | Routes all data RPC calls to the self-hosted URL |

## Database architecture

Core table: `public.restaurants` (~146k rows).

Key columns:

| Column | Type | Purpose |
|--------|------|---------|
| `cat_list` | `text[]` | Normalized category array — used for all filtering and aggregation |
| `category` | `text` | Raw source string from ingest; do not use for filtering |
| `is_chain` | `boolean` | Populated by the chains management page |
| `price_bucket` | `text` | Normalised price tier (`$`, `$$`, `$$$`, `$$$$`) |
| `approval_status` | `text` | Lead workflow state (`pending`, `approved`, `rejected`, etc.) |

### Why RPCs, not direct table queries

PostgREST's `db-max-rows` is set to 1000 on this instance. All queries returning more than 1000 rows must go through a custom Postgres function (RPC). Direct `.from("restaurants").select(...)` is only safe for small result sets.

### Server-side caching layer

Three caches absorb the unfiltered default-view load:

- `public.overview_cache` — pre-computed JSON for `restaurants_overview()` with no filters; refreshed by ingest via `refresh_overview_cache()`
- `public.map_cache` — pre-computed JSON for `restaurants_map_points()` with no filters; refreshed via `refresh_map_cache()`
- `public.restaurants_category_counts` — materialized view unnesting `cat_list` with per-category counts and rating stats; refreshed via `refresh_restaurants_caches()`

Each cache-backed RPC checks whether all params are at their no-op defaults; if so it reads the cache row, otherwise it falls through to a `_compute` variant.

### Filter-aware RPCs

Every data path (overview, map, categories, table export) shares the same composable WHERE predicate. The `Filters` type (`web/src/lib/types.ts`) is translated to RPC args by `filtersToRpcArgs()` in `web/src/lib/filters.ts`. Disabled filter groups are resolved to their null/empty defaults before the call — downstream code never reads `enabled` flags.

### Saved filters (`public.saved_filters`)

Users can persist named filter sets. CRUD is handled by `/api/saved-filters/` and `[id]/` route handlers. The `SavedFiltersMenu` component loads and applies them.

### Lead approval workflow

Approval state lives in `approval_status` on each restaurant row. Actions are logged to `lead_action_logs` and shortcuts to `user_approval_shortcuts`. The approval mode UI (`approval-mode.tsx`) and `use-approval-flags.ts` / `use-approval-shortcuts.ts` hooks drive this flow.

## Frontend architecture

- **State:** Zustand store (`web/src/lib/store.ts`) persisted to `localStorage` under `tt-app-state-v1`. Holds filters, selected rows, active tab, map viewport, and table sort/pagination state.
- **Data fetching:** SWR hooks, one per tab. Each hook's cache key includes the serialised filter state. Fetcher is in `web/src/lib/fetcher.ts`.
- **Tabs:** `overview`, `map`, `categories`, `column`, `table`, `selected` — rendered by `web/src/components/app-shell.tsx`.
- **UI components:** shadcn/ui in `web/src/components/ui/`. Plotly.js charts use a lazy-loaded wrapper (`plotly-impl.tsx`) to avoid SSR issues.
- **Google Sheets export:** `/api/send-to-sheets/` calls the Apps Script webhook. The script lives in `apps-script/`.

## API routes (`web/src/app/api/`)

| Route | Purpose |
|-------|---------|
| `query/` | Main data RPC (paginated table data) |
| `facets/` | Filter facets and per-value counts |
| `export-csv/` | Full filtered CSV download |
| `send-to-sheets/` | Push selected rows to Google Sheets |
| `saved-filters/` | List / create named filter sets |
| `saved-filters/[id]/` | Update / delete a saved filter |
| `lead-selection/` | Track selected leads |
| `leads/log/` | Log approval actions |
| `approval-shortcuts/` | User-specific approval keyboard shortcuts |
| `auth/signout/` | Sign out |

## Next.js version note

**This is Next.js 16.x with breaking changes from prior versions.** Read `web/node_modules/next/dist/docs/` before writing any App Router code. Do not assume behaviour from earlier Next.js training data.

## Migration naming

Migrations follow the pattern `NNNN_description.sql` (zero-padded to 4 digits). The next migration is `0026_*.sql`. Apply them manually via psql on the server.
