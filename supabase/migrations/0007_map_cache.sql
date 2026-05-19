-- ============================================================================
-- 0007_map_cache.sql
-- The map's columnar payload is genuinely expensive to compute (jsonb_agg
-- over 144k rows × 6 columns runs ~12s cold) and the unfiltered case is by
-- far the most common — every page load of the Map tab. Cache the full
-- jsonb in a single-row table and read it back in <10ms. Filtered queries
-- (rare and smaller) still compute live.
--
-- The reason we use an RPC at all is that PostgREST's db-max-rows caps
-- direct table queries to 1000 rows on this project, so we can't just
-- supabase.from("restaurants").limit(200000) from the client.
-- ============================================================================

create table if not exists public.map_cache (
    id            smallint    primary key default 1,
    data          jsonb       not null,
    refreshed_at  timestamptz not null default now(),
    constraint map_cache_single_row check (id = 1)
);

alter table public.map_cache enable row level security;

drop policy if exists "map_cache_read_auth" on public.map_cache;
create policy "map_cache_read_auth" on public.map_cache
    for select to authenticated using (true);

-- Internal: actually compute the columnar payload.
create or replace function public.restaurants_map_points_compute(
    p_province     text    default null,
    p_city         text    default null,
    p_categories   text[]  default null,
    p_price_bucket text    default null,
    p_chain_only   boolean default null,
    p_min_reviews  integer default 0,
    p_score_min    numeric default 0,
    p_score_max    numeric default 5,
    p_search       text    default null,
    p_limit        integer default 200000
)
returns jsonb
language sql
stable
set search_path = public, extensions
as $$
    with f as MATERIALIZED (
        select id, name, latitude, longitude, rating, ratings
        from public.restaurants
        where latitude is not null and longitude is not null
          and (p_province     is null or province     = p_province)
          and (p_city         is null or city         = p_city)
          and (p_categories   is null or cat_list && p_categories)
          and (p_price_bucket is null or price_bucket = p_price_bucket)
          and (p_chain_only   is null or is_chain     = p_chain_only)
          and (p_min_reviews  = 0     or ratings    >= p_min_reviews)
          and (
              (p_score_min = 0 and p_score_max = 5)
              or rating is null
              or rating between p_score_min and p_score_max
          )
          and (p_search is null or name ilike '%' || p_search || '%')
        limit p_limit
    )
    select jsonb_build_object(
        'id',      coalesce(jsonb_agg(id),        '[]'::jsonb),
        'name',    coalesce(jsonb_agg(name),      '[]'::jsonb),
        'lat',     coalesce(jsonb_agg(latitude),  '[]'::jsonb),
        'lon',     coalesce(jsonb_agg(longitude), '[]'::jsonb),
        'rating',  coalesce(jsonb_agg(rating),    '[]'::jsonb),
        'ratings', coalesce(jsonb_agg(ratings),   '[]'::jsonb),
        'count',   count(*)::bigint
    )
    from f;
$$;

create or replace function public.restaurants_map_points(
    p_province     text    default null,
    p_city         text    default null,
    p_categories   text[]  default null,
    p_price_bucket text    default null,
    p_chain_only   boolean default null,
    p_min_reviews  integer default 0,
    p_score_min    numeric default 0,
    p_score_max    numeric default 5,
    p_search       text    default null,
    p_limit        integer default 200000
)
returns jsonb
language sql
stable
set search_path = public, extensions
as $$
    select case
        when p_province     is null
         and p_city         is null
         and p_categories   is null
         and p_price_bucket is null
         and p_chain_only   is null
         and p_min_reviews  = 0
         and p_score_min    = 0
         and p_score_max    = 5
         and p_search       is null
         and p_limit        >= 200000
        then coalesce(
            (select data from public.map_cache where id = 1),
            public.restaurants_map_points_compute()
        )
        else public.restaurants_map_points_compute(
            p_province, p_city, p_categories, p_price_bucket,
            p_chain_only, p_min_reviews, p_score_min, p_score_max, p_search, p_limit
        )
    end;
$$;

create or replace function public.refresh_map_cache()
returns void
language sql
security definer
set search_path = public, extensions
as $$
    insert into public.map_cache (id, data, refreshed_at)
    values (1, public.restaurants_map_points_compute(), now())
    on conflict (id)
    do update set data = excluded.data, refreshed_at = excluded.refreshed_at;
$$;

select public.refresh_map_cache();
