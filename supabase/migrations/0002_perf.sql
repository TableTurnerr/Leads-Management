-- ============================================================================
-- 0002_perf.sql
-- Move aggregation into Postgres so the API stops shipping raw rows to the
-- browser just to count them. Each filter change should be a single RPC
-- returning kilobytes, not megabytes of rows.
-- ============================================================================

-- Move pg_trgm and btree_gin into the `extensions` schema (clean up the
-- "Extension in Public" advisor). The trigram index has a hard dependency on
-- gin_trgm_ops so we drop it first.
drop index if exists public.idx_restaurants_name_trgm;
alter extension pg_trgm   set schema extensions;
alter extension btree_gin set schema extensions;
create index if not exists idx_restaurants_name_trgm
    on public.restaurants using gin (name extensions.gin_trgm_ops);

-- Drop old single-purpose RPCs; replaced below.
drop function if exists public.restaurants_top_cities(text, int);
drop function if exists public.restaurants_category_stats(int, int);

-- ----------------------------------------------------------------------------
-- One JSON blob with every metric the Overview tab renders.
-- ----------------------------------------------------------------------------
create or replace function public.restaurants_overview(
    p_province     text    default null,
    p_city         text    default null,
    p_categories   text[]  default null,
    p_price_bucket text    default null,
    p_chain_only   boolean default null,
    p_min_reviews  integer default 0,
    p_score_min    numeric default 0,
    p_score_max    numeric default 5,
    p_search       text    default null
)
returns jsonb
language sql
stable
set search_path = public, extensions
as $$
    with filtered as (
        select rating, ratings, price_bucket, city, province
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
    ),
    totals as (
        select
            count(*)::bigint                  as total,
            count(distinct city)              as cities,
            count(distinct province)          as provinces,
            avg(rating)::numeric(4,2)         as avg_rating,
            coalesce(sum(ratings), 0)::bigint as total_reviews
        from filtered
    ),
    score_buckets as (
        select width_bucket(rating::numeric, 0, 5, 40) as b,
               count(*)::bigint as cnt
        from filtered where rating is not null
        group by 1
    ),
    review_buckets as (
        select width_bucket(log(greatest(ratings, 1)), 0, 7, 40) as b,
               count(*)::bigint as cnt
        from filtered where ratings is not null and ratings > 0
        group by 1
    ),
    top_cities as (
        select city, count(*)::bigint as cnt
        from filtered where city is not null
        group by city order by cnt desc limit 15
    ),
    top_provinces as (
        select province, count(*)::bigint as cnt
        from filtered where province is not null
        group by province order by cnt desc limit 20
    ),
    price_breakdown as (
        select price_bucket as price, count(*)::bigint as cnt
        from filtered
        where price_bucket is not null and price_bucket <> 'Unknown'
        group by price order by cnt desc limit 6
    )
    select jsonb_build_object(
        'total',         (select total         from totals),
        'cities',        (select cities        from totals),
        'provinces',     (select provinces     from totals),
        'avgRating',     (select avg_rating    from totals),
        'totalReviews',  (select total_reviews from totals),
        'scoreBuckets', coalesce((
            select jsonb_agg(jsonb_build_object(
                'bucket', (b - 0.5) * (5.0 / 40),
                'count',  cnt
            ) order by b) from score_buckets
        ), '[]'::jsonb),
        'reviewBuckets', coalesce((
            select jsonb_agg(jsonb_build_object(
                'bucket', power(10, (b - 0.5) * (7.0 / 40)),
                'count',  cnt
            ) order by b) from review_buckets
        ), '[]'::jsonb),
        'topCities', coalesce((
            select jsonb_agg(jsonb_build_object('city', city, 'count', cnt) order by cnt desc)
            from top_cities
        ), '[]'::jsonb),
        'topProvinces', coalesce((
            select jsonb_agg(jsonb_build_object('province', province, 'count', cnt) order by cnt desc)
            from top_provinces
        ), '[]'::jsonb),
        'priceBreakdown', coalesce((
            select jsonb_agg(jsonb_build_object('price', price, 'count', cnt) order by cnt desc)
            from price_breakdown
        ), '[]'::jsonb)
    );
$$;

-- ----------------------------------------------------------------------------
-- Sidebar facets: provinces, price buckets, top categories (one round trip).
-- ----------------------------------------------------------------------------
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
        select cat, count(*)::bigint as cnt
        from public.restaurants, unnest(cat_list) as cat
        group by cat
        order by cnt desc
        limit 60
    )
    select jsonb_build_object(
        'provinces',     coalesce((select jsonb_agg(v order by v) from prov),  '[]'::jsonb),
        'priceBuckets',  coalesce((select jsonb_agg(v) from price),            '[]'::jsonb),
        'topCategories', coalesce((select jsonb_agg(cat order by cnt desc) from cats), '[]'::jsonb)
    );
$$;

-- ----------------------------------------------------------------------------
-- Distinct cities for a province (or all if null).
-- ----------------------------------------------------------------------------
create or replace function public.restaurants_cities(p_province text default null)
returns jsonb
language sql
stable
set search_path = public, extensions
as $$
    select coalesce(jsonb_agg(city order by city), '[]'::jsonb)
    from (
        select distinct city
        from public.restaurants
        where city is not null
          and (p_province is null or province = p_province)
    ) c;
$$;

-- ----------------------------------------------------------------------------
-- Top categories with filters applied.
-- ----------------------------------------------------------------------------
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
    select cat as category, count(*)::bigint as count
    from public.restaurants, unnest(cat_list) as cat
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
    group by cat
    order by count desc
    limit p_limit;
$$;

-- ----------------------------------------------------------------------------
-- Avg rating per category (only categories with >= p_min_count restaurants).
-- ----------------------------------------------------------------------------
create or replace function public.restaurants_category_stats(
    p_min_count int default 50,
    p_limit     int default 30
)
returns table(category text, count bigint, avg_rating numeric)
language sql
stable
set search_path = public, extensions
as $$
    select cat as category,
           count(*)::bigint        as count,
           avg(rating)::numeric(3,2) as avg_rating
    from public.restaurants, unnest(cat_list) as cat
    where rating is not null
    group by cat
    having count(*) >= p_min_count
    order by avg_rating desc nulls last
    limit p_limit;
$$;

-- ----------------------------------------------------------------------------
-- Column explorer: counts, distinct, top-N values for one column. Column
-- name is restricted to a whitelist to keep dynamic SQL safe.
-- ----------------------------------------------------------------------------
create or replace function public.restaurants_column_stats(
    p_column       text,
    p_province     text    default null,
    p_city         text    default null,
    p_categories   text[]  default null,
    p_price_bucket text    default null,
    p_chain_only   boolean default null,
    p_min_reviews  integer default 0,
    p_score_min    numeric default 0,
    p_score_max    numeric default 5,
    p_search       text    default null,
    p_limit        integer default 20
)
returns jsonb
language plpgsql
stable
set search_path = public, extensions
as $$
declare
    allowed text[] := array[
        'name','address','city','province','postal_code','category',
        'rating','ratings','price_range','price_bucket',
        'website','phone','country','is_chain','location_name'
    ];
    result jsonb;
begin
    if not p_column = any(allowed) then
        raise exception 'column not allowed: %', p_column;
    end if;

    execute format($f$
        with filtered as (
            select %I::text as v
            from public.restaurants
            where ($1 is null or province     = $1)
              and ($2 is null or city         = $2)
              and ($3 is null or cat_list && $3)
              and ($4 is null or price_bucket = $4)
              and ($5 is null or is_chain     = $5)
              and ($6 = 0     or ratings    >= $6)
              and (($7 = 0 and $8 = 5) or rating is null or rating between $7 and $8)
              and ($9 is null or name ilike '%%' || $9 || '%%')
        ),
        totals as (
            select count(*)::bigint                                       as total,
                   count(*) filter (where v is not null and v <> '')::bigint as non_null,
                   count(distinct v)::bigint                              as uniq
            from filtered
        ),
        top_values as (
            select v as value, count(*)::bigint as count
            from filtered
            where v is not null and v <> ''
            group by v
            order by count desc
            limit $10
        )
        select jsonb_build_object(
            'total',   (select total    from totals),
            'nonNull', (select non_null from totals),
            'unique',  (select uniq     from totals),
            'top',     coalesce((
                select jsonb_agg(jsonb_build_object('value', value, 'count', count) order by count desc)
                from top_values
            ), '[]'::jsonb)
        )
    $f$, p_column)
    into result
    using p_province, p_city, p_categories, p_price_bucket, p_chain_only,
          p_min_reviews, p_score_min, p_score_max, p_search, p_limit;

    return result;
end;
$$;
