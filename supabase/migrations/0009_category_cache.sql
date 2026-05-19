-- ============================================================================
-- 0009_category_cache.sql
-- The Categories tab fires two filter-derived RPCs side by side, both of
-- which were unnesting cat_list across the entire 144k-row table on every
-- page load (~5s cold). Extending the existing category-counts MV to
-- include rating stats turns category_stats into a single index read and
-- gives top_categories a fast path for the unfiltered case.
-- ============================================================================

drop materialized view if exists public.restaurants_category_counts cascade;

create materialized view public.restaurants_category_counts as
select
    cat,
    count(*)::bigint                                                              as cnt,
    count(*) filter (where rating is not null)::bigint                            as cnt_rated,
    avg(rating) filter (where rating is not null)::numeric(3,2)                   as avg_rating
from public.restaurants, unnest(cat_list) as cat
group by cat;

create unique index idx_restaurants_category_counts_cat
    on public.restaurants_category_counts (cat);

create index idx_restaurants_category_counts_cnt
    on public.restaurants_category_counts (cnt desc);

create index idx_restaurants_category_counts_avg
    on public.restaurants_category_counts (avg_rating desc nulls last);

grant select on public.restaurants_category_counts to authenticated, anon, service_role;

-- restaurants_facets is structurally unchanged but had to be re-declared
-- because the MV it depended on was rebuilt with `cascade`.
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

-- Read from the MV. Constant time.
create or replace function public.restaurants_category_stats(
    p_min_count int default 50,
    p_limit     int default 30
)
returns table(category text, count bigint, avg_rating numeric)
language sql
stable
set search_path = public, extensions
as $$
    select cat as category, cnt_rated as count, avg_rating
    from public.restaurants_category_counts
    where cnt_rated >= p_min_count
      and avg_rating is not null
    order by avg_rating desc nulls last
    limit p_limit;
$$;

-- top_categories is filter-aware; split the heavy work into _compute and
-- short-circuit the default-filter case through the cached counts.
create or replace function public.restaurants_top_categories_compute(
    p_province     text    default null,
    p_city         text    default null,
    p_categories   text[]  default null,
    p_price_bucket text    default null,
    p_chain_only   boolean default null,
    p_min_reviews  integer default 0,
    p_score_min    numeric default 0,
    p_score_max    numeric default 5,
    p_search       text    default null,
    p_limit        integer default 25
)
returns table(category text, count bigint)
language sql
stable
set search_path = public, extensions
as $$
    with filtered as MATERIALIZED (
        select cat_list
        from public.restaurants
        where (p_province     is null or province     = p_province)
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
    )
    select cat as category, count(*)::bigint as count
    from filtered, unnest(cat_list) as cat
    group by cat
    order by count desc
    limit p_limit;
$$;

create or replace function public.restaurants_top_categories(
    p_province     text    default null,
    p_city         text    default null,
    p_categories   text[]  default null,
    p_price_bucket text    default null,
    p_chain_only   boolean default null,
    p_min_reviews  integer default 0,
    p_score_min    numeric default 0,
    p_score_max    numeric default 5,
    p_search       text    default null,
    p_limit        integer default 25
)
returns table(category text, count bigint)
language sql
stable
set search_path = public, extensions
as $$
    select * from (
        select cat as category, cnt as count
        from public.restaurants_category_counts
        where p_province     is null
          and p_city         is null
          and p_categories   is null
          and p_price_bucket is null
          and p_chain_only   is null
          and p_min_reviews  = 0
          and p_score_min    = 0
          and p_score_max    = 5
          and p_search       is null
        order by cnt desc
        limit p_limit
    ) cached
    union all
    select * from public.restaurants_top_categories_compute(
        p_province, p_city, p_categories, p_price_bucket,
        p_chain_only, p_min_reviews, p_score_min, p_score_max, p_search, p_limit
    ) live
    where not (
        p_province     is null
        and p_city         is null
        and p_categories   is null
        and p_price_bucket is null
        and p_chain_only   is null
        and p_min_reviews  = 0
        and p_score_min    = 0
        and p_score_max    = 5
        and p_search       is null
    )
    limit p_limit;
$$;

create or replace function public.refresh_restaurants_caches()
returns void
language sql
security definer
set search_path = public, extensions
as $$
    refresh materialized view concurrently public.restaurants_category_counts;
$$;
