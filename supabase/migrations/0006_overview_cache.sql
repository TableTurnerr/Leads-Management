-- ============================================================================
-- 0006_overview_cache.sql
-- The unfiltered Overview RPC scans the entire 220MB heap and burns 5-13s
-- cold (well over the 8s authenticated statement_timeout). It only needs
-- to be recomputed when the underlying data changes, so we cache the JSON
-- result in a tiny one-row table and return it directly when no filters
-- are applied. Filtered calls still compute live but those are typically
-- fast because filter columns are indexed.
-- ============================================================================

create table if not exists public.overview_cache (
    id            smallint    primary key default 1,
    data          jsonb       not null,
    refreshed_at  timestamptz not null default now(),
    constraint overview_cache_single_row check (id = 1)
);

alter table public.overview_cache enable row level security;

drop policy if exists "overview_cache_read_auth" on public.overview_cache;
create policy "overview_cache_read_auth" on public.overview_cache
    for select to authenticated using (true);

-- Internal: actually compute the overview. Heavy. Use MATERIALIZED to keep
-- the planner from picking a degenerate index scan on the inlined CTE.
create or replace function public.restaurants_overview_compute(
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
    with filtered as MATERIALIZED (
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

-- Public entry point: read from cache when no filters are applied, else
-- compute live. The cache hit is one indexed row read (<1ms).
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
        then coalesce(
            (select data from public.overview_cache where id = 1),
            public.restaurants_overview_compute()
        )
        else public.restaurants_overview_compute(
            p_province, p_city, p_categories, p_price_bucket,
            p_chain_only, p_min_reviews, p_score_min, p_score_max, p_search
        )
    end;
$$;

-- Service-role refresh helper for the ingest script (or pg_cron).
create or replace function public.refresh_overview_cache()
returns void
language sql
security definer
set search_path = public, extensions
as $$
    insert into public.overview_cache (id, data, refreshed_at)
    values (1, public.restaurants_overview_compute(), now())
    on conflict (id)
    do update set data = excluded.data, refreshed_at = excluded.refreshed_at;
$$;

-- Initial population so the cache exists for the very first authenticated
-- request after this migration runs. Service role has no statement_timeout
-- so we can afford the cold scan here.
select public.refresh_overview_cache();
