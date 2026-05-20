-- ============================================================================
-- 0022_user_approval_shortcuts.sql
-- Per-user keyboard shortcut bindings for the approval mode UI. One row per
-- user; client upserts on change. Stored as jsonb so the action set can grow
-- without a migration.
-- ============================================================================

create table if not exists public.user_approval_shortcuts (
    user_id    uuid primary key references auth.users(id) on delete cascade,
    shortcuts  jsonb not null default '{}'::jsonb,
    updated_at timestamptz not null default now()
);

alter table public.user_approval_shortcuts enable row level security;

drop policy if exists "user_approval_shortcuts_read" on public.user_approval_shortcuts;
create policy "user_approval_shortcuts_read" on public.user_approval_shortcuts
    for select to authenticated
    using ((select auth.uid()) = user_id);

drop policy if exists "user_approval_shortcuts_insert" on public.user_approval_shortcuts;
create policy "user_approval_shortcuts_insert" on public.user_approval_shortcuts
    for insert to authenticated
    with check ((select auth.uid()) = user_id);

drop policy if exists "user_approval_shortcuts_update" on public.user_approval_shortcuts;
create policy "user_approval_shortcuts_update" on public.user_approval_shortcuts
    for update to authenticated
    using ((select auth.uid()) = user_id)
    with check ((select auth.uid()) = user_id);

drop policy if exists "user_approval_shortcuts_delete" on public.user_approval_shortcuts;
create policy "user_approval_shortcuts_delete" on public.user_approval_shortcuts
    for delete to authenticated
    using ((select auth.uid()) = user_id);
