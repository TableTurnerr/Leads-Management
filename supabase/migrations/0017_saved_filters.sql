-- ============================================================================
-- 0017_saved_filters.sql
-- Per-user / per-team named filter snapshots. The `filters` jsonb stores the
-- exact shape of the Filters object in web/src/lib/types.ts so loading is a
-- straight assignment in the store.
-- ============================================================================

create table if not exists public.saved_filters (
    id          uuid primary key default gen_random_uuid(),
    user_id     uuid not null references auth.users(id) on delete cascade,
    name        text not null,
    scope       text not null check (scope in ('private', 'team')),
    filters     jsonb not null,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

create index if not exists saved_filters_user_id_idx
    on public.saved_filters (user_id);
create index if not exists saved_filters_scope_idx
    on public.saved_filters (scope);

-- A user can't have two private filters with the same name. Team names live in
-- a shared namespace so the unique partial index spans all users for scope=team.
create unique index if not exists saved_filters_private_name_uniq
    on public.saved_filters (user_id, name)
    where scope = 'private';
create unique index if not exists saved_filters_team_name_uniq
    on public.saved_filters (name)
    where scope = 'team';

alter table public.saved_filters enable row level security;

-- Read: own private rows, plus every team row.
drop policy if exists "saved_filters_read" on public.saved_filters;
create policy "saved_filters_read" on public.saved_filters
    for select to authenticated
    using (
        scope = 'team'
        or (select auth.uid()) = user_id
    );

-- Insert: caller must own the row. Both scopes are allowed; team rows are
-- visible to everyone but only the creator can mutate them.
drop policy if exists "saved_filters_insert" on public.saved_filters;
create policy "saved_filters_insert" on public.saved_filters
    for insert to authenticated
    with check ((select auth.uid()) = user_id);

drop policy if exists "saved_filters_update" on public.saved_filters;
create policy "saved_filters_update" on public.saved_filters
    for update to authenticated
    using ((select auth.uid()) = user_id);

drop policy if exists "saved_filters_delete" on public.saved_filters;
create policy "saved_filters_delete" on public.saved_filters
    for delete to authenticated
    using ((select auth.uid()) = user_id);
