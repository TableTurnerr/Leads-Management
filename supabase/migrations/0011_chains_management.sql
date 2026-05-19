-- ============================================================================
-- 0011_chains_management.sql
-- The seeded fast_food_chains table only matched restaurants whose name was
-- byte-for-byte identical (case-insensitive) to a row in the list, so most
-- locations like "McDonalds @ Old Atlanta" or "Domino's Pizza Inc" slipped
-- through as normal leads. This migration:
--
--   1. Adds a normalized form of `name` to both tables and indexes it.
--   2. Defines a matching rule based on equality + length-≥4 prefix in
--      either direction. That captures "McDonalds @ Old Atlanta" ↔
--      "McDonald's" and "Chipotle" ↔ "Chipotle Mexican Grill" without
--      hitting "McDonald BBQ" or unrelated short prefixes.
--   3. Exposes RPCs so the web app can add/remove chain names at runtime
--      and have is_chain reflowed across the leads table automatically.
--   4. Backfills is_chain across all existing rows.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- normalize helper
-- ----------------------------------------------------------------------------
create or replace function public.chain_name_norm(p_name text)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
    select regexp_replace(lower(coalesce(p_name, '')), '[^a-z0-9]+', '', 'g');
$$;

-- ----------------------------------------------------------------------------
-- normalized columns
-- Stored generated columns let us index the normalized form and keep it
-- consistent on every insert/update without trigger plumbing.
-- ----------------------------------------------------------------------------
alter table public.restaurants
    add column if not exists name_norm text
    generated always as (regexp_replace(lower(coalesce(name, '')), '[^a-z0-9]+', '', 'g')) stored;

alter table public.fast_food_chains
    add column if not exists name_norm text
    generated always as (regexp_replace(lower(coalesce(name, '')), '[^a-z0-9]+', '', 'g')) stored;

create index if not exists idx_restaurants_name_norm on public.restaurants(name_norm);
create index if not exists idx_fast_food_chains_name_norm on public.fast_food_chains(name_norm);

-- ----------------------------------------------------------------------------
-- backfill is_chain under the new rule
-- A restaurant counts as a chain when its name_norm equals or is a prefix
-- variant (≥4 chars) of any name_norm in fast_food_chains.
-- ----------------------------------------------------------------------------
update public.restaurants r
   set is_chain = exists (
       select 1
       from public.fast_food_chains c
       where r.name_norm <> ''
         and c.name_norm <> ''
         and (
             r.name_norm = c.name_norm
             or (length(c.name_norm) >= 4 and r.name_norm like c.name_norm || '%')
             or (length(r.name_norm) >= 4 and c.name_norm like r.name_norm || '%')
         )
   );

-- ----------------------------------------------------------------------------
-- RPC: list chains with current match counts
-- ----------------------------------------------------------------------------
create or replace function public.chains_list()
returns table(name text, matches bigint)
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
    select c.name,
           coalesce((
               select count(*)::bigint
               from public.restaurants r
               where r.name_norm <> ''
                 and (
                     r.name_norm = c.name_norm
                     or (length(c.name_norm) >= 4 and r.name_norm like c.name_norm || '%')
                     or (length(r.name_norm) >= 4 and c.name_norm like r.name_norm || '%')
                 )
           ), 0) as matches
    from public.fast_food_chains c
    order by c.name;
$$;

-- ----------------------------------------------------------------------------
-- RPC: add a chain
-- Inserts the row (idempotent on name) and flips is_chain=true for every
-- matching restaurant. Returns the canonical chain name, whether the row
-- was newly added, and how many restaurants are now marked.
-- ----------------------------------------------------------------------------
create or replace function public.chains_add(p_name text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
    v_name    text := btrim(p_name);
    v_norm    text;
    v_added   boolean := false;
    v_matches bigint  := 0;
begin
    if v_name is null or v_name = '' then
        raise exception 'chain name cannot be empty';
    end if;

    v_norm := public.chain_name_norm(v_name);
    if v_norm = '' then
        raise exception 'chain name must contain alphanumeric characters';
    end if;

    insert into public.fast_food_chains(name)
    values (v_name)
    on conflict (name) do nothing;
    if found then
        v_added := true;
    end if;

    update public.restaurants r
       set is_chain = true
     where r.is_chain = false
       and r.name_norm <> ''
       and (
           r.name_norm = v_norm
           or (length(v_norm)        >= 4 and r.name_norm like v_norm || '%')
           or (length(r.name_norm)   >= 4 and v_norm      like r.name_norm || '%')
       );

    select count(*) into v_matches
    from public.restaurants r
    where r.name_norm <> ''
      and (
          r.name_norm = v_norm
          or (length(v_norm)        >= 4 and r.name_norm like v_norm || '%')
          or (length(r.name_norm)   >= 4 and v_norm      like r.name_norm || '%')
      );

    return jsonb_build_object(
        'name',    v_name,
        'added',   v_added,
        'matches', v_matches
    );
end;
$$;

-- ----------------------------------------------------------------------------
-- RPC: remove a chain
-- Deletes the chain row, then re-derives is_chain for any restaurant that
-- previously matched it: a row stays flagged iff some *other* chain still
-- matches it.
-- ----------------------------------------------------------------------------
create or replace function public.chains_remove(p_name text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
    v_removed   boolean := false;
    v_unmarked  bigint  := 0;
begin
    delete from public.fast_food_chains where name = p_name;
    if found then
        v_removed := true;
    end if;

    with reflowed as (
        update public.restaurants r
           set is_chain = exists (
               select 1
               from public.fast_food_chains c
               where r.name_norm <> ''
                 and c.name_norm <> ''
                 and (
                     r.name_norm = c.name_norm
                     or (length(c.name_norm) >= 4 and r.name_norm like c.name_norm || '%')
                     or (length(r.name_norm) >= 4 and c.name_norm like r.name_norm || '%')
                 )
           )
         where r.is_chain = true
        returning r.is_chain
    )
    select count(*) filter (where is_chain = false) into v_unmarked from reflowed;

    return jsonb_build_object(
        'removed',  v_removed,
        'unmarked', coalesce(v_unmarked, 0)
    );
end;
$$;

-- ----------------------------------------------------------------------------
-- Grants
-- Authenticated users can list/add/remove. RLS still gates direct table
-- access; these RPCs run as definer so the function bodies can write.
-- ----------------------------------------------------------------------------
grant execute on function public.chains_list()         to authenticated;
grant execute on function public.chains_add(text)      to authenticated;
grant execute on function public.chains_remove(text)   to authenticated;
