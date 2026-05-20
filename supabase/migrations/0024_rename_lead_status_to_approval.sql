-- ============================================================================
-- 0024_rename_lead_status_to_approval.sql
-- Rename the approval-status filter plumbing in SQL to match the renamed UI:
--   lead_status_matches  -> approval_status_matches
--   p_lead_statuses      -> p_approval_statuses
-- Drops the v0023 helper and every RPC that referenced it, then recreates
-- them under the new names. Behaviour and signatures (modulo param names)
-- are unchanged.
-- ============================================================================

-- Drop the v0023 helper. The CASCADE pulls every RPC that referenced it; we
-- recreate them all below.
drop function if exists public.lead_status_matches(
    bigint, text[], bigint[], bigint[], bigint[], bigint[], bigint[]
) cascade;

create or replace function public.approval_status_matches(
    p_id                 bigint,
    p_approval_statuses      text[],
    p_approved_ids       bigint[],
    p_rejected_ids       bigint[],
    p_skipped_ids        bigint[],
    p_downloaded_ids     bigint[],
    p_sent_to_sheets_ids bigint[]
)
returns boolean
language sql
immutable
parallel safe
set search_path = public, extensions
as $$
    select
        p_approval_statuses is null
        or (
            ('approved' = any(p_approval_statuses)
                and p_approved_ids is not null
                and p_id = any(p_approved_ids))
            or ('rejected' = any(p_approval_statuses)
                and p_rejected_ids is not null
                and p_id = any(p_rejected_ids)
                and not (p_approved_ids is not null and p_id = any(p_approved_ids)))
            or ('skipped' = any(p_approval_statuses)
                and p_skipped_ids is not null
                and p_id = any(p_skipped_ids)
                and not (p_approved_ids is not null and p_id = any(p_approved_ids))
                and not (p_rejected_ids is not null and p_id = any(p_rejected_ids)))
            or ('pending' = any(p_approval_statuses)
                and not (p_approved_ids   is not null and p_id = any(p_approved_ids))
                and not (p_rejected_ids   is not null and p_id = any(p_rejected_ids))
                and not (p_skipped_ids    is not null and p_id = any(p_skipped_ids)))
            or ('downloaded' = any(p_approval_statuses)
                and p_downloaded_ids is not null
                and p_id = any(p_downloaded_ids))
            or ('sentToSheets' = any(p_approval_statuses)
                and p_sent_to_sheets_ids is not null
                and p_id = any(p_sent_to_sheets_ids))
        );
$$;

-- Drop old signatures; each RPC gains six trailing params, so we cannot use
-- CREATE OR REPLACE without an ambiguity error.
drop function if exists public.restaurants_overview(
    text[], text, text[], text[], text[], boolean,
    boolean, boolean, boolean, boolean,
    integer, integer, numeric, numeric, text, text
) cascade;
drop function if exists public.restaurants_overview_compute(
    text[], text, text[], text[], text[], boolean,
    boolean, boolean, boolean, boolean,
    integer, integer, numeric, numeric, text, text
) cascade;
drop function if exists public.restaurants_map_points(
    text[], text, text[], text[], text[], boolean,
    boolean, boolean, boolean, boolean,
    integer, integer, numeric, numeric, text, text, integer
) cascade;
drop function if exists public.restaurants_map_points_compute(
    text[], text, text[], text[], text[], boolean,
    boolean, boolean, boolean, boolean,
    integer, integer, numeric, numeric, text, text, integer
) cascade;
drop function if exists public.restaurants_top_categories(
    text[], text, text[], text[], text[], boolean,
    boolean, boolean, boolean, boolean,
    integer, integer, numeric, numeric, text, text, integer
) cascade;
drop function if exists public.restaurants_top_categories_compute(
    text[], text, text[], text[], text[], boolean,
    boolean, boolean, boolean, boolean,
    integer, integer, numeric, numeric, text, text, integer
) cascade;
drop function if exists public.restaurants_column_stats(
    text, text[], text, text[], text[], text[], boolean,
    boolean, boolean, boolean, boolean,
    integer, integer, numeric, numeric, text, text, integer
) cascade;
drop function if exists public.restaurants_export_page(
    text[], text, text[], text[], text[], boolean,
    boolean, boolean, boolean, boolean,
    integer, integer, numeric, numeric, text, text, bigint, integer
) cascade;

-- ============================================================================
-- restaurants_overview
-- ============================================================================
create or replace function public.restaurants_overview_compute(
    p_provinces           text[]   default null,
    p_city                text     default null,
    p_categories          text[]   default null,
    p_exclude_categories  text[]   default null,
    p_price_buckets       text[]   default null,
    p_chain_only          boolean  default null,
    p_has_phone           boolean  default null,
    p_has_website         boolean  default null,
    p_has_address         boolean  default null,
    p_has_coordinates     boolean  default null,
    p_min_reviews         integer  default 0,
    p_max_reviews         integer  default null,
    p_score_min           numeric  default 0,
    p_score_max           numeric  default 5,
    p_rating_null_policy  text     default 'include',
    p_search              text     default null,
    p_approval_statuses       text[]   default null,
    p_approved_ids        bigint[] default null,
    p_rejected_ids        bigint[] default null,
    p_skipped_ids         bigint[] default null,
    p_downloaded_ids      bigint[] default null,
    p_sent_to_sheets_ids  bigint[] default null
)
returns jsonb
language sql
stable
set search_path = public, extensions
as $$
    with filtered as MATERIALIZED (
        select rating, ratings, price_bucket, city, province
        from public.restaurants
        where (p_provinces          is null or province     = any(p_provinces))
          and (p_city               is null or city         = p_city)
          and (p_categories         is null or cat_list && p_categories)
          and (p_exclude_categories is null or not (cat_list && p_exclude_categories))
          and (p_price_buckets      is null or price_bucket = any(p_price_buckets))
          and (p_chain_only         is null or is_chain     = p_chain_only)
          and (p_has_phone          is null or (p_has_phone       = (phone     is not null and phone <> '')))
          and (p_has_website        is null or (p_has_website     = (website   is not null and website <> '')))
          and (p_has_address        is null or (p_has_address     = (address   is not null and address <> '')))
          and (p_has_coordinates    is null or (p_has_coordinates = (latitude  is not null and longitude is not null)))
          and (p_min_reviews        = 0    or ratings   >= p_min_reviews)
          and (p_max_reviews        is null or ratings  <= p_max_reviews)
          and (
              case p_rating_null_policy
                  when 'only'    then rating is null
                  when 'exclude' then rating is not null
                                     and ((p_score_min = 0 and p_score_max = 5)
                                          or rating between p_score_min and p_score_max)
                  else (p_score_min = 0 and p_score_max = 5)
                        or rating is null
                        or rating between p_score_min and p_score_max
              end
          )
          and (p_search is null or name ilike '%' || p_search || '%')
          and public.approval_status_matches(
              id, p_approval_statuses,
              p_approved_ids, p_rejected_ids, p_skipped_ids,
              p_downloaded_ids, p_sent_to_sheets_ids
          )
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

create or replace function public.restaurants_overview(
    p_provinces           text[]   default null,
    p_city                text     default null,
    p_categories          text[]   default null,
    p_exclude_categories  text[]   default null,
    p_price_buckets       text[]   default null,
    p_chain_only          boolean  default null,
    p_has_phone           boolean  default null,
    p_has_website         boolean  default null,
    p_has_address         boolean  default null,
    p_has_coordinates     boolean  default null,
    p_min_reviews         integer  default 0,
    p_max_reviews         integer  default null,
    p_score_min           numeric  default 0,
    p_score_max           numeric  default 5,
    p_rating_null_policy  text     default 'include',
    p_search              text     default null,
    p_approval_statuses       text[]   default null,
    p_approved_ids        bigint[] default null,
    p_rejected_ids        bigint[] default null,
    p_skipped_ids         bigint[] default null,
    p_downloaded_ids      bigint[] default null,
    p_sent_to_sheets_ids  bigint[] default null
)
returns jsonb
language sql
stable
set search_path = public, extensions
as $$
    select case
        when p_provinces          is null
         and p_city               is null
         and p_categories         is null
         and p_exclude_categories is null
         and p_price_buckets      is null
         and p_chain_only         is null
         and p_has_phone          is null
         and p_has_website        is null
         and p_has_address        is null
         and p_has_coordinates    is null
         and p_min_reviews        = 0
         and p_max_reviews        is null
         and p_score_min          = 0
         and p_score_max          = 5
         and p_rating_null_policy = 'include'
         and p_search             is null
         and p_approval_statuses      is null
        then coalesce(
            (select data from public.overview_cache where id = 1),
            public.restaurants_overview_compute()
        )
        else public.restaurants_overview_compute(
            p_provinces, p_city, p_categories, p_exclude_categories,
            p_price_buckets, p_chain_only,
            p_has_phone, p_has_website, p_has_address, p_has_coordinates,
            p_min_reviews, p_max_reviews,
            p_score_min, p_score_max, p_rating_null_policy, p_search,
            p_approval_statuses, p_approved_ids, p_rejected_ids,
            p_skipped_ids, p_downloaded_ids, p_sent_to_sheets_ids
        )
    end;
$$;

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

-- ============================================================================
-- restaurants_map_points
-- ============================================================================
create or replace function public.restaurants_map_points_compute(
    p_provinces           text[]   default null,
    p_city                text     default null,
    p_categories          text[]   default null,
    p_exclude_categories  text[]   default null,
    p_price_buckets       text[]   default null,
    p_chain_only          boolean  default null,
    p_has_phone           boolean  default null,
    p_has_website         boolean  default null,
    p_has_address         boolean  default null,
    p_has_coordinates     boolean  default null,
    p_min_reviews         integer  default 0,
    p_max_reviews         integer  default null,
    p_score_min           numeric  default 0,
    p_score_max           numeric  default 5,
    p_rating_null_policy  text     default 'include',
    p_search              text     default null,
    p_limit               integer  default 200000,
    p_approval_statuses       text[]   default null,
    p_approved_ids        bigint[] default null,
    p_rejected_ids        bigint[] default null,
    p_skipped_ids         bigint[] default null,
    p_downloaded_ids      bigint[] default null,
    p_sent_to_sheets_ids  bigint[] default null
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
          and (p_provinces          is null or province     = any(p_provinces))
          and (p_city               is null or city         = p_city)
          and (p_categories         is null or cat_list && p_categories)
          and (p_exclude_categories is null or not (cat_list && p_exclude_categories))
          and (p_price_buckets      is null or price_bucket = any(p_price_buckets))
          and (p_chain_only         is null or is_chain     = p_chain_only)
          and (p_has_phone          is null or (p_has_phone       = (phone     is not null and phone <> '')))
          and (p_has_website        is null or (p_has_website     = (website   is not null and website <> '')))
          and (p_has_address        is null or (p_has_address     = (address   is not null and address <> '')))
          and (p_has_coordinates    is null or p_has_coordinates  = true)
          and (p_min_reviews        = 0    or ratings   >= p_min_reviews)
          and (p_max_reviews        is null or ratings  <= p_max_reviews)
          and (
              case p_rating_null_policy
                  when 'only'    then rating is null
                  when 'exclude' then rating is not null
                                     and ((p_score_min = 0 and p_score_max = 5)
                                          or rating between p_score_min and p_score_max)
                  else (p_score_min = 0 and p_score_max = 5)
                        or rating is null
                        or rating between p_score_min and p_score_max
              end
          )
          and (p_search is null or name ilike '%' || p_search || '%')
          and public.approval_status_matches(
              id, p_approval_statuses,
              p_approved_ids, p_rejected_ids, p_skipped_ids,
              p_downloaded_ids, p_sent_to_sheets_ids
          )
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

create or replace function public.restaurants_map_points(
    p_provinces           text[]   default null,
    p_city                text     default null,
    p_categories          text[]   default null,
    p_exclude_categories  text[]   default null,
    p_price_buckets       text[]   default null,
    p_chain_only          boolean  default null,
    p_has_phone           boolean  default null,
    p_has_website         boolean  default null,
    p_has_address         boolean  default null,
    p_has_coordinates     boolean  default null,
    p_min_reviews         integer  default 0,
    p_max_reviews         integer  default null,
    p_score_min           numeric  default 0,
    p_score_max           numeric  default 5,
    p_rating_null_policy  text     default 'include',
    p_search              text     default null,
    p_limit               integer  default 200000,
    p_approval_statuses       text[]   default null,
    p_approved_ids        bigint[] default null,
    p_rejected_ids        bigint[] default null,
    p_skipped_ids         bigint[] default null,
    p_downloaded_ids      bigint[] default null,
    p_sent_to_sheets_ids  bigint[] default null
)
returns jsonb
language sql
stable
set search_path = public, extensions
as $$
    select case
        when p_provinces          is null
         and p_city               is null
         and p_categories         is null
         and p_exclude_categories is null
         and p_price_buckets      is null
         and p_chain_only         is null
         and p_has_phone          is null
         and p_has_website        is null
         and p_has_address        is null
         and p_has_coordinates    is null
         and p_min_reviews        = 0
         and p_max_reviews        is null
         and p_score_min          = 0
         and p_score_max          = 5
         and p_rating_null_policy = 'include'
         and p_search             is null
         and p_limit              >= 200000
         and p_approval_statuses      is null
        then coalesce(
            (select data from public.map_cache where id = 1),
            public.restaurants_map_points_compute()
        )
        else public.restaurants_map_points_compute(
            p_provinces, p_city, p_categories, p_exclude_categories,
            p_price_buckets, p_chain_only,
            p_has_phone, p_has_website, p_has_address, p_has_coordinates,
            p_min_reviews, p_max_reviews,
            p_score_min, p_score_max, p_rating_null_policy, p_search, p_limit,
            p_approval_statuses, p_approved_ids, p_rejected_ids,
            p_skipped_ids, p_downloaded_ids, p_sent_to_sheets_ids
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

-- ============================================================================
-- restaurants_top_categories
-- ============================================================================
create or replace function public.restaurants_top_categories_compute(
    p_provinces           text[]   default null,
    p_city                text     default null,
    p_categories          text[]   default null,
    p_exclude_categories  text[]   default null,
    p_price_buckets       text[]   default null,
    p_chain_only          boolean  default null,
    p_has_phone           boolean  default null,
    p_has_website         boolean  default null,
    p_has_address         boolean  default null,
    p_has_coordinates     boolean  default null,
    p_min_reviews         integer  default 0,
    p_max_reviews         integer  default null,
    p_score_min           numeric  default 0,
    p_score_max           numeric  default 5,
    p_rating_null_policy  text     default 'include',
    p_search              text     default null,
    p_limit               integer  default 25,
    p_approval_statuses       text[]   default null,
    p_approved_ids        bigint[] default null,
    p_rejected_ids        bigint[] default null,
    p_skipped_ids         bigint[] default null,
    p_downloaded_ids      bigint[] default null,
    p_sent_to_sheets_ids  bigint[] default null
)
returns table(category text, count bigint)
language sql
stable
set search_path = public, extensions
as $$
    with filtered as MATERIALIZED (
        select cat_list
        from public.restaurants
        where (p_provinces          is null or province     = any(p_provinces))
          and (p_city               is null or city         = p_city)
          and (p_categories         is null or cat_list && p_categories)
          and (p_exclude_categories is null or not (cat_list && p_exclude_categories))
          and (p_price_buckets      is null or price_bucket = any(p_price_buckets))
          and (p_chain_only         is null or is_chain     = p_chain_only)
          and (p_has_phone          is null or (p_has_phone       = (phone     is not null and phone <> '')))
          and (p_has_website        is null or (p_has_website     = (website   is not null and website <> '')))
          and (p_has_address        is null or (p_has_address     = (address   is not null and address <> '')))
          and (p_has_coordinates    is null or (p_has_coordinates = (latitude  is not null and longitude is not null)))
          and (p_min_reviews        = 0    or ratings   >= p_min_reviews)
          and (p_max_reviews        is null or ratings  <= p_max_reviews)
          and (
              case p_rating_null_policy
                  when 'only'    then rating is null
                  when 'exclude' then rating is not null
                                     and ((p_score_min = 0 and p_score_max = 5)
                                          or rating between p_score_min and p_score_max)
                  else (p_score_min = 0 and p_score_max = 5)
                        or rating is null
                        or rating between p_score_min and p_score_max
              end
          )
          and (p_search is null or name ilike '%' || p_search || '%')
          and public.approval_status_matches(
              id, p_approval_statuses,
              p_approved_ids, p_rejected_ids, p_skipped_ids,
              p_downloaded_ids, p_sent_to_sheets_ids
          )
    )
    select cat as category, count(*)::bigint as count
    from filtered, unnest(cat_list) as cat
    group by cat
    order by count desc
    limit p_limit;
$$;

create or replace function public.restaurants_top_categories(
    p_provinces           text[]   default null,
    p_city                text     default null,
    p_categories          text[]   default null,
    p_exclude_categories  text[]   default null,
    p_price_buckets       text[]   default null,
    p_chain_only          boolean  default null,
    p_has_phone           boolean  default null,
    p_has_website         boolean  default null,
    p_has_address         boolean  default null,
    p_has_coordinates     boolean  default null,
    p_min_reviews         integer  default 0,
    p_max_reviews         integer  default null,
    p_score_min           numeric  default 0,
    p_score_max           numeric  default 5,
    p_rating_null_policy  text     default 'include',
    p_search              text     default null,
    p_limit               integer  default 25,
    p_approval_statuses       text[]   default null,
    p_approved_ids        bigint[] default null,
    p_rejected_ids        bigint[] default null,
    p_skipped_ids         bigint[] default null,
    p_downloaded_ids      bigint[] default null,
    p_sent_to_sheets_ids  bigint[] default null
)
returns table(category text, count bigint)
language sql
stable
set search_path = public, extensions
as $$
    select * from (
        select cat as category, cnt as count
        from public.restaurants_category_counts
        where p_provinces          is null
          and p_city               is null
          and p_categories         is null
          and p_exclude_categories is null
          and p_price_buckets      is null
          and p_chain_only         is null
          and p_has_phone          is null
          and p_has_website        is null
          and p_has_address        is null
          and p_has_coordinates    is null
          and p_min_reviews        = 0
          and p_max_reviews        is null
          and p_score_min          = 0
          and p_score_max          = 5
          and p_rating_null_policy = 'include'
          and p_search             is null
          and p_approval_statuses      is null
        order by cnt desc
        limit p_limit
    ) cached
    union all
    select * from public.restaurants_top_categories_compute(
        p_provinces, p_city, p_categories, p_exclude_categories,
        p_price_buckets, p_chain_only,
        p_has_phone, p_has_website, p_has_address, p_has_coordinates,
        p_min_reviews, p_max_reviews,
        p_score_min, p_score_max, p_rating_null_policy, p_search, p_limit,
        p_approval_statuses, p_approved_ids, p_rejected_ids,
        p_skipped_ids, p_downloaded_ids, p_sent_to_sheets_ids
    ) live
    where not (
        p_provinces          is null
        and p_city               is null
        and p_categories         is null
        and p_exclude_categories is null
        and p_price_buckets      is null
        and p_chain_only         is null
        and p_has_phone          is null
        and p_has_website        is null
        and p_has_address        is null
        and p_has_coordinates    is null
        and p_min_reviews        = 0
        and p_max_reviews        is null
        and p_score_min          = 0
        and p_score_max          = 5
        and p_rating_null_policy = 'include'
        and p_search             is null
        and p_approval_statuses      is null
    )
    limit p_limit;
$$;

-- ============================================================================
-- restaurants_column_stats
-- ============================================================================
create or replace function public.restaurants_column_stats(
    p_column              text,
    p_provinces           text[]   default null,
    p_city                text     default null,
    p_categories          text[]   default null,
    p_exclude_categories  text[]   default null,
    p_price_buckets       text[]   default null,
    p_chain_only          boolean  default null,
    p_has_phone           boolean  default null,
    p_has_website         boolean  default null,
    p_has_address         boolean  default null,
    p_has_coordinates     boolean  default null,
    p_min_reviews         integer  default 0,
    p_max_reviews         integer  default null,
    p_score_min           numeric  default 0,
    p_score_max           numeric  default 5,
    p_rating_null_policy  text     default 'include',
    p_search              text     default null,
    p_limit               integer  default 20,
    p_approval_statuses       text[]   default null,
    p_approved_ids        bigint[] default null,
    p_rejected_ids        bigint[] default null,
    p_skipped_ids         bigint[] default null,
    p_downloaded_ids      bigint[] default null,
    p_sent_to_sheets_ids  bigint[] default null
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
            where ($1  is null or province     = any($1))
              and ($2  is null or city         = $2)
              and ($3  is null or cat_list && $3)
              and ($4  is null or not (cat_list && $4))
              and ($5  is null or price_bucket = any($5))
              and ($6  is null or is_chain     = $6)
              and ($7  is null or ($7  = (phone     is not null and phone <> '')))
              and ($8  is null or ($8  = (website   is not null and website <> '')))
              and ($9  is null or ($9  = (address   is not null and address <> '')))
              and ($10 is null or ($10 = (latitude  is not null and longitude is not null)))
              and ($11 = 0     or ratings   >= $11)
              and ($12 is null or ratings  <= $12)
              and (
                  case $15
                      when 'only'    then rating is null
                      when 'exclude' then rating is not null
                                         and (($13 = 0 and $14 = 5)
                                              or rating between $13 and $14)
                      else ($13 = 0 and $14 = 5)
                            or rating is null
                            or rating between $13 and $14
                  end
              )
              and ($16 is null or name ilike '%%' || $16 || '%%')
              and public.approval_status_matches(
                  id, $18, $19, $20, $21, $22, $23
              )
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
            limit $17
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
    using p_provinces, p_city, p_categories, p_exclude_categories,
          p_price_buckets, p_chain_only,
          p_has_phone, p_has_website, p_has_address, p_has_coordinates,
          p_min_reviews, p_max_reviews,
          p_score_min, p_score_max, p_rating_null_policy, p_search, p_limit,
          p_approval_statuses, p_approved_ids, p_rejected_ids,
          p_skipped_ids, p_downloaded_ids, p_sent_to_sheets_ids;

    return result;
end;
$$;

-- ============================================================================
-- restaurants_export_page
-- ============================================================================
create or replace function public.restaurants_export_page(
    p_provinces           text[]   default null,
    p_city                text     default null,
    p_categories          text[]   default null,
    p_exclude_categories  text[]   default null,
    p_price_buckets       text[]   default null,
    p_chain_only          boolean  default null,
    p_has_phone           boolean  default null,
    p_has_website         boolean  default null,
    p_has_address         boolean  default null,
    p_has_coordinates     boolean  default null,
    p_min_reviews         integer  default 0,
    p_max_reviews         integer  default null,
    p_score_min           numeric  default 0,
    p_score_max           numeric  default 5,
    p_rating_null_policy  text     default 'include',
    p_search              text     default null,
    p_after_id            bigint   default null,
    p_limit               integer  default 5000,
    p_approval_statuses       text[]   default null,
    p_approved_ids        bigint[] default null,
    p_rejected_ids        bigint[] default null,
    p_skipped_ids         bigint[] default null,
    p_downloaded_ids      bigint[] default null,
    p_sent_to_sheets_ids  bigint[] default null
)
returns table(
    id           bigint,
    name         text,
    address      text,
    city         text,
    province     text,
    postal_code  text,
    country      text,
    latitude     double precision,
    longitude    double precision,
    website      text,
    phone        text,
    category     text,
    rating       numeric,
    ratings      integer,
    price_bucket text,
    is_chain     boolean
)
language sql
stable
set search_path = public, extensions
as $$
    select id, name, address, city, province, postal_code, country,
           latitude, longitude, website, phone, category,
           rating, ratings, price_bucket, is_chain
    from public.restaurants
    where (p_after_id is null or id > p_after_id)
      and (p_provinces          is null or province     = any(p_provinces))
      and (p_city               is null or city         = p_city)
      and (p_categories         is null or cat_list && p_categories)
      and (p_exclude_categories is null or not (cat_list && p_exclude_categories))
      and (p_price_buckets      is null or price_bucket = any(p_price_buckets))
      and (p_chain_only         is null or is_chain     = p_chain_only)
      and (p_has_phone          is null or (p_has_phone       = (phone     is not null and phone <> '')))
      and (p_has_website        is null or (p_has_website     = (website   is not null and website <> '')))
      and (p_has_address        is null or (p_has_address     = (address   is not null and address <> '')))
      and (p_has_coordinates    is null or (p_has_coordinates = (latitude  is not null and longitude is not null)))
      and (p_min_reviews        = 0    or ratings   >= p_min_reviews)
      and (p_max_reviews        is null or ratings  <= p_max_reviews)
      and (
          case p_rating_null_policy
              when 'only'    then rating is null
              when 'exclude' then rating is not null
                                 and ((p_score_min = 0 and p_score_max = 5)
                                      or rating between p_score_min and p_score_max)
              else (p_score_min = 0 and p_score_max = 5)
                    or rating is null
                    or rating between p_score_min and p_score_max
          end
      )
      and (p_search is null or name ilike '%' || p_search || '%')
      and public.approval_status_matches(
          id, p_approval_statuses,
          p_approved_ids, p_rejected_ids, p_skipped_ids,
          p_downloaded_ids, p_sent_to_sheets_ids
      )
    order by id
    limit p_limit;
$$;

-- Refresh caches under the new signatures (data shape unchanged; this just
-- rolls refreshed_at forward so the deploy is observable).
select public.refresh_overview_cache();
select public.refresh_map_cache();

