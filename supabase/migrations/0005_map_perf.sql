-- ============================================================================
-- 0005_map_perf.sql
-- The map RPC was hitting Supabase's 8s authenticated-role statement_timeout
-- on the unfiltered case (a seq scan over the whole table + jsonb_agg of
-- 144k rows). The facets RPC was even worse (~18s) because it unnested
-- cat_list across the whole table on every page load.
--
-- Fix: a partial covering index so the map's "all points" path is index-only,
-- and a materialized category-count cache so facets is a constant-time read.
-- ============================================================================

-- Index-only scan for the map's slim payload. Without this, Postgres seq
-- scans the entire 220MB heap.
create index if not exists idx_restaurants_map_cover
    on public.restaurants (id)
    include (name, latitude, longitude, rating, ratings)
    where latitude is not null and longitude is not null;

-- One row per category, refreshed on ingest. Cheap to read, expensive to
-- compute from scratch. The facets RPC, the Categories tab top-N, and the
-- column explorer's "category" view all derive from this.
create materialized view if not exists public.restaurants_category_counts as
select cat, count(*)::bigint as cnt
from public.restaurants, unnest(cat_list) as cat
group by cat;

create unique index if not exists idx_restaurants_category_counts_cat
    on public.restaurants_category_counts (cat);

create index if not exists idx_restaurants_category_counts_cnt
    on public.restaurants_category_counts (cnt desc);

grant select on public.restaurants_category_counts to authenticated, anon, service_role;

-- Refresh helper for the ingest script to call after bulk-loading new rows.
create or replace function public.refresh_restaurants_caches()
returns void
language sql
security definer
set search_path = public, extensions
as $$
    refresh materialized view concurrently public.restaurants_category_counts;
$$;

-- Read the cached top categories instead of re-aggregating the whole table.
create or replace function public.restaurants_facets()
returns jsonb
language sql
stable
set search_path = public, extensions
as $$
    with prov as (
        select distinct province as v
        from public.restaurants
        where province is not null
    ),
    price as (
        select distinct price_bucket as v
        from public.restaurants
        where price_bucket is not null
    ),
    cats as (
        select cat
        from public.restaurants_category_counts
        order by cnt desc
        limit 60
    )
    select jsonb_build_object(
        'provinces',     coalesce((select jsonb_agg(v order by v) from prov),  '[]'::jsonb),
        'priceBuckets',  coalesce((select jsonb_agg(v) from price),            '[]'::jsonb),
        'topCategories', coalesce((select jsonb_agg(cat) from cats),           '[]'::jsonb)
    );
$$;
