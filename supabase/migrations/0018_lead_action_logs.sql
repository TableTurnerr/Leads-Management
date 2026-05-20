-- ============================================================================
-- 0018_lead_action_logs.sql
-- Audit log of lead-touching user actions: CSV downloads (the real ones, not
-- previews), Sheets webhook pushes, and snapshots of the active selection.
-- Used to answer "who pulled which leads, when".
-- ============================================================================

create table if not exists public.lead_action_logs (
    id              bigserial primary key,
    user_id         uuid references auth.users(id) on delete set null,
    user_email      text,
    action          text not null check (action in (
                        'csv_download',
                        'send_to_sheets',
                        'selection_snapshot'
                    )),
    source          text,
    row_count       integer,
    restaurant_ids  integer[],
    filters         jsonb,
    metadata        jsonb,
    created_at      timestamptz not null default now()
);

create index if not exists lead_action_logs_user_id_idx
    on public.lead_action_logs (user_id);
create index if not exists lead_action_logs_created_at_idx
    on public.lead_action_logs (created_at desc);
create index if not exists lead_action_logs_action_idx
    on public.lead_action_logs (action);

alter table public.lead_action_logs enable row level security;

-- A user can read their own log entries. Tighten later if a shared admin view
-- becomes a thing.
drop policy if exists "lead_action_logs_read" on public.lead_action_logs;
create policy "lead_action_logs_read" on public.lead_action_logs
    for select to authenticated
    using ((select auth.uid()) = user_id);

-- A user can only insert rows attributed to themselves. The API route sets
-- user_id from the session, so this is a belt-and-braces check.
drop policy if exists "lead_action_logs_insert" on public.lead_action_logs;
create policy "lead_action_logs_insert" on public.lead_action_logs
    for insert to authenticated
    with check ((select auth.uid()) = user_id);
