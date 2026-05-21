# Restaurants Data

Internal tooling for browsing, filtering, and managing a dataset of ~146k restaurants. Built for lead review and export workflows.

## What it does

- Browse and filter restaurants by category, price tier, rating, city, chain status, and more
- Map view, category breakdowns, and column explorer for dataset exploration
- Approval workflow — mark leads as approved/rejected, log actions, set per-user keyboard shortcuts
- Export filtered results to CSV or push selected rows to Google Sheets
- Save and restore named filter sets

## Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4 |
| State | Zustand (persisted to `localStorage`) |
| Data fetching | SWR |
| Charts / map | Plotly.js (lazy-loaded) |
| Database | Postgres via self-hosted Supabase (`supabase.tableturnerr.com`) |
| Auth | Supabase Cloud (JWTs verified by self-hosted instance) |
| Ingest | Python (`ingest/ingest.py`) — loads CSVs, refreshes caches |
| Sheets integration | Google Apps Script webhook (`apps-script/`) |

## Setup

### Frontend (`web/`)

1. Copy `web/.env.example` to `web/.env.local` and fill in the values:
   - `NEXT_PUBLIC_SUPABASE_AUTH_URL` / `NEXT_PUBLIC_SUPABASE_AUTH_ANON_KEY` — cloud Supabase project for auth
   - `NEXT_PUBLIC_SUPABASE_DATA_URL` / `NEXT_PUBLIC_SUPABASE_DATA_ANON_KEY` — self-hosted instance for data
   - `SUPABASE_DATA_SERVICE_ROLE_KEY` — service role key (server-side only)

2. Install and run:

```bash
cd web
npm install
npm run dev
```

### Ingest (`ingest/`)

1. Copy `ingest/.env.example` to `ingest/.env` and fill in the service role key.
2. Place source CSV files in `Database/`.

```bash
cd ingest
pip install -r requirements.txt
python ingest.py
```

### Database migrations

Migrations live in `supabase/migrations/` and are applied manually:

```bash
# SSH to server, then:
psql -U postgres -d postgres -f supabase/migrations/NNNN_description.sql
```

## Repository layout

```
web/                   Next.js frontend
ingest/                CSV ingestion pipeline
scripts/               One-off utilities
apps-script/           Google Apps Script (Sheets webhook)
supabase/migrations/   SQL migrations (0001 – 0025)
Database/              Source CSV files
processed/             Post-ingest output
```
