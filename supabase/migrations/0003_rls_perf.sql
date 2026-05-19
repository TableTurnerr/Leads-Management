-- ============================================================================
-- 0003_rls_perf.sql
-- Wrap auth.uid() in (select ...) so Postgres caches the value once per
-- query instead of evaluating the function on every row. Matters more for
-- larger tables but the planner-cleanup is free.
-- ============================================================================

drop policy if exists "user_settings_own_select" on public.user_settings;
create policy "user_settings_own_select" on public.user_settings
    for select to authenticated
    using ((select auth.uid()) = user_id);

drop policy if exists "user_settings_own_upsert" on public.user_settings;
create policy "user_settings_own_upsert" on public.user_settings
    for insert to authenticated
    with check ((select auth.uid()) = user_id);

drop policy if exists "user_settings_own_update" on public.user_settings;
create policy "user_settings_own_update" on public.user_settings
    for update to authenticated
    using ((select auth.uid()) = user_id);
