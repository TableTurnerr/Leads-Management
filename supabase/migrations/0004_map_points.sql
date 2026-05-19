-- ============================================================================
-- 0004_map_points.sql
-- Columnar map payload + bulk row fetch.
--
-- The Map tab used to ship one JSON object per row (`id`, `name`, `city`, …)
-- through PostgREST, which capped us at a few thousand points before the
-- payload + parse cost made the tab unusable. Returning four parallel arrays
-- instead drops the wire size by roughly 5x and lets us draw all ~145k
-- points in a single round trip. Detail fields are fetched lazily by id when
-- the user clicks or sends a selection elsewhere.
-- ============================================================================

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
    with f as (
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

-- ----------------------------------------------------------------------------
-- Bulk fetch by id — used when the user lassos a few hundred points on the
-- map and we need the full detail rows for the Selected tab / Sheets export.
-- ----------------------------------------------------------------------------
create or replace function public.restaurants_by_ids(p_ids bigint[])
returns setof public.restaurants
language sql
stable
set search_path = public, extensions
as $$
    select *
    from public.restaurants
    where id = any(p_ids);
$$;
