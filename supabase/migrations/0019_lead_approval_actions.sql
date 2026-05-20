-- ============================================================================
-- 0019_lead_approval_actions.sql
-- Extend lead_action_logs to record approval-mode events:
--   lead_approved   user marked a single lead as Approved
--   lead_rejected   user marked a single lead as Rejected
--   lead_skipped    user skipped a lead without deciding
--   approval_start  snapshot of the lead set queued into approval mode
--   approval_end    snapshot of approve/reject counts when the session closes
-- ============================================================================

alter table public.lead_action_logs
    drop constraint if exists lead_action_logs_action_check;

alter table public.lead_action_logs
    add constraint lead_action_logs_action_check
    check (action in (
        'csv_download',
        'send_to_sheets',
        'selection_snapshot',
        'lead_approved',
        'lead_rejected',
        'lead_skipped',
        'approval_start',
        'approval_end'
    ));
