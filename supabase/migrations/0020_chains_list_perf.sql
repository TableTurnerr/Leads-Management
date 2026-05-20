-- ============================================================================
-- 0020_chains_list_perf.sql
-- chains_list() was timing out: 70 chains × ~146k restaurants with three
-- OR'd LIKE conditions, one of which (`c.name_norm like r.name_norm || '%'`)
-- has a pattern that varies per row and cannot use the btree index on
-- restaurants(name_norm). PostgREST/PG cancelled the statement.
--
-- Rewrite as a UNION of three SARGable joins so each branch can use the
-- existing name_norm btree indexes:
--   1. equality                         → idx on either side
--   2. r.name_norm like c.name_norm||'% → idx_restaurants_name_norm (anchored)
--   3. c.name_norm like r.name_norm||'% → idx_fast_food_chains_name_norm
--      (chains as inner; only 70 rows, scanned per restaurant via index)
-- ============================================================================

create or replace function public.chains_list()
returns table(name text, matches bigint)
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
    with pairs as (
        select c.name as chain_name, r.id as rid
        from public.fast_food_chains c
        join public.restaurants r on r.name_norm = c.name_norm
        where c.name_norm <> ''

        union

        select c.name, r.id
        from public.fast_food_chains c
        join public.restaurants r
          on r.name_norm like c.name_norm || '%'
        where length(c.name_norm) >= 4
          and r.name_norm <> ''

        union

        select c.name, r.id
        from public.fast_food_chains c
        join public.restaurants r
          on c.name_norm like r.name_norm || '%'
        where length(r.name_norm) >= 4
          and c.name_norm <> ''
    )
    select c.name,
           coalesce(count(p.rid), 0)::bigint as matches
    from public.fast_food_chains c
    left join pairs p on p.chain_name = c.name
    group by c.name
    order by c.name;
$$;

grant execute on function public.chains_list() to authenticated;
