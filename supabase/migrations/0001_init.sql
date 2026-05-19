-- ============================================================================
-- Restaurants Data — initial schema
-- ============================================================================

create extension if not exists pg_trgm;
create extension if not exists btree_gin;

-- ----------------------------------------------------------------------------
-- restaurants: one row per restaurant location, from Combined_Restaurants.csv
-- ----------------------------------------------------------------------------
create table if not exists public.restaurants (
    id              bigserial primary key,
    name            text not null,
    address         text,
    city            text,
    province        text,
    postal_code     text,
    country         text,
    latitude        double precision,
    longitude       double precision,
    website         text,
    phone           text,
    category        text,
    categories      text,
    cat_list        text[] default '{}',
    rating          numeric(3,2),
    ratings         integer,
    price_range     text,
    price_bucket    text,
    position        integer,
    link            text,
    images          text,
    geo_coordinates text,
    time_zone       text,
    keys            text,
    location_name   text,
    is_chain        boolean default false,
    dataset         text not null default 'main',
    created_at      timestamptz not null default now(),
    -- prevent duplicate rows on re-ingest
    unique (dataset, name, address, city, province)
);

create index if not exists idx_restaurants_province       on public.restaurants(province);
create index if not exists idx_restaurants_city           on public.restaurants(city);
create index if not exists idx_restaurants_rating         on public.restaurants(rating);
create index if not exists idx_restaurants_ratings        on public.restaurants(ratings);
create index if not exists idx_restaurants_price_bucket   on public.restaurants(price_bucket);
create index if not exists idx_restaurants_is_chain       on public.restaurants(is_chain);
create index if not exists idx_restaurants_dataset        on public.restaurants(dataset);
create index if not exists idx_restaurants_lat_lon        on public.restaurants(latitude, longitude);
create index if not exists idx_restaurants_name_trgm      on public.restaurants using gin (name gin_trgm_ops);
create index if not exists idx_restaurants_cat_list_gin   on public.restaurants using gin (cat_list);

-- ----------------------------------------------------------------------------
-- fast_food_chains: reference list (70 names from "Top 50 Fast-Food Chains in USA.csv")
-- ----------------------------------------------------------------------------
create table if not exists public.fast_food_chains (
    name text primary key
);

-- ----------------------------------------------------------------------------
-- user_settings: per-user app settings (Apps Script webhook URL, etc.)
-- ----------------------------------------------------------------------------
create table if not exists public.user_settings (
    user_id          uuid primary key references auth.users(id) on delete cascade,
    sheets_webhook_url text,
    updated_at       timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------
alter table public.restaurants       enable row level security;
alter table public.fast_food_chains  enable row level security;
alter table public.user_settings     enable row level security;

-- restaurants & chains: any authenticated user can read, only service_role can write
drop policy if exists "restaurants_read_auth" on public.restaurants;
create policy "restaurants_read_auth" on public.restaurants
    for select to authenticated using (true);

drop policy if exists "chains_read_auth" on public.fast_food_chains;
create policy "chains_read_auth" on public.fast_food_chains
    for select to authenticated using (true);

-- user_settings: each user reads/writes only their own row
drop policy if exists "user_settings_own_select" on public.user_settings;
create policy "user_settings_own_select" on public.user_settings
    for select to authenticated using (auth.uid() = user_id);

drop policy if exists "user_settings_own_upsert" on public.user_settings;
create policy "user_settings_own_upsert" on public.user_settings
    for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "user_settings_own_update" on public.user_settings;
create policy "user_settings_own_update" on public.user_settings
    for update to authenticated using (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- RPC: facet counts for sidebar filters (province/city/category top-N)
-- ----------------------------------------------------------------------------
create or replace function public.restaurants_top_cities(
    p_province text default null,
    p_limit    int  default 15
)
returns table(city text, count bigint)
language sql stable as $$
    select city, count(*)::bigint
    from public.restaurants
    where city is not null
      and (p_province is null or province = p_province)
    group by city
    order by count(*) desc
    limit p_limit
$$;

create or replace function public.restaurants_category_stats(
    p_min_count int default 50,
    p_limit     int default 30
)
returns table(category text, count bigint, avg_rating numeric)
language sql stable as $$
    select cat as category,
           count(*)::bigint as count,
           avg(rating)::numeric(3,2) as avg_rating
    from public.restaurants, unnest(cat_list) as cat
    where rating is not null
    group by cat
    having count(*) >= p_min_count
    order by avg_rating desc nulls last
    limit p_limit
$$;
