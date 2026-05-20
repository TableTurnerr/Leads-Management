-- Auth has moved to the cloud Supabase project. Local public.* tables can no
-- longer FK to local auth.users because user IDs are minted by the cloud
-- instance and never inserted into the local auth.users. RLS still enforces
-- ownership through auth.uid() (read from the verified JWT).

alter table public.user_settings
    drop constraint if exists user_settings_user_id_fkey;

alter table public.saved_filters
    drop constraint if exists saved_filters_user_id_fkey;

alter table public.lead_action_logs
    drop constraint if exists lead_action_logs_user_id_fkey;

alter table public.user_selections
    drop constraint if exists user_selections_user_id_fkey;

alter table public.user_approval_shortcuts
    drop constraint if exists user_approval_shortcuts_user_id_fkey;
