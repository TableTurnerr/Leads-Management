-- ============================================================================
-- 0016_facets_limit.sql
-- After consolidation (migrations 0013-0015) the category count dropped from
-- ~1800 to 110. Raise the LIMIT in restaurants_facets from 60 → 200 so all
-- current categories appear in the filter dropdown, with headroom for future
-- additions.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.restaurants_facets()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
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
        limit 200
    )
    select jsonb_build_object(
        'provinces',     coalesce((select jsonb_agg(v order by v) from prov),  '[]'::jsonb),
        'priceBuckets',  coalesce((select jsonb_agg(v) from price),            '[]'::jsonb),
        'topCategories', coalesce((select jsonb_agg(cat) from cats),           '[]'::jsonb)
    );
$function$;
