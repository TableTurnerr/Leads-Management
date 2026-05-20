-- ============================================================================
-- 0021_user_selections.sql
-- Per-user persisted selection of restaurant IDs, so a user signing in on a
-- new device or after clearing localStorage resumes with the same selection
-- they left behind. One row per user; the client upserts on change.
-- ============================================================================

create table if not exists public.user_selections (
    user_id        uuid primary key references auth.users(id) on delete cascade,
    restaurant_ids integer[] not null default '{}',
    updated_at     timestamptz not null default now()
);

create index if not exists user_selections_updated_at_idx
    on public.user_selections (updated_at desc);

alter table public.user_selections enable row level security;

drop policy if exists "user_selections_read" on public.user_selections;
create policy "user_selections_read" on public.user_selections
    for select to authenticated
    using ((select auth.uid()) = user_id);

drop policy if exists "user_selections_insert" on public.user_selections;
create policy "user_selections_insert" on public.user_selections
    for insert to authenticated
    with check ((select auth.uid()) = user_id);

drop policy if exists "user_selections_update" on public.user_selections;
create policy "user_selections_update" on public.user_selections
    for update to authenticated
    using ((select auth.uid()) = user_id)
    with check ((select auth.uid()) = user_id);

drop policy if exists "user_selections_delete" on public.user_selections;
create policy "user_selections_delete" on public.user_selections
    for delete to authenticated
    using ((select auth.uid()) = user_id);
