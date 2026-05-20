"use client";

import { useMemo } from "react";
import { useAppStore } from "./store";
import type { ApprovalFlagsPayload } from "./filters";

// Bundle the approval-status bucket arrays from the store into the payload shape
// the RPCs expect. `statuses` is filled in by filtersToRpcArgs from
// Filters.approvalStatuses — callers don't need to thread it through themselves.
export function useApprovalFlags(): ApprovalFlagsPayload {
  const approvedIds     = useAppStore((s) => s.approvedIds);
  const rejectedIds     = useAppStore((s) => s.rejectedIds);
  const skippedIds      = useAppStore((s) => s.skippedIds);
  const downloadedIds   = useAppStore((s) => s.downloadedIds);
  const sentToSheetsIds = useAppStore((s) => s.sentToSheetsIds);
  return useMemo<ApprovalFlagsPayload>(
    () => ({
      statuses: [],
      approvedIds,
      rejectedIds,
      skippedIds,
      downloadedIds,
      sentToSheetsIds,
    }),
    [approvedIds, rejectedIds, skippedIds, downloadedIds, sentToSheetsIds],
  );
}
