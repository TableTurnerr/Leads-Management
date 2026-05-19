-- ============================================================================
-- 0008_map_payload_slim.sql
-- The cached map JSON was 8.6MB uncompressed (most of it `name` strings),
-- and Next.js dev mode doesn't gzip its outgoing responses, so a Map tab
-- load was waiting on 4s of pure transfer time from the Singapore region.
-- The popover already fetches the full row by id on click, so the map
-- itself only needs the four fields it actually draws.
-- ============================================================================

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
        select id,
               round(latitude::numeric, 5)  as lat,
               round(longitude::numeric, 5) as lon,
               rating
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
        'id',     coalesce(jsonb_agg(id),     '[]'::jsonb),
        'lat',    coalesce(jsonb_agg(lat),    '[]'::jsonb),
        'lon',    coalesce(jsonb_agg(lon),    '[]'::jsonb),
        'rating', coalesce(jsonb_agg(rating), '[]'::jsonb),
        'count',  count(*)::bigint
    )
    from f;
$$;

select public.refresh_map_cache();
