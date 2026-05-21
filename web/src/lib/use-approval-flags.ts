"use client";

import { useMemo } from "react";
import { useAppStore } from "./store";
import type { ApprovalFlagsPayload } from "./filters";

// Bundle the approval-status bucket arrays from the store into the payload
// shape the RPCs expect. include/exclude are filled in by filtersToRpcArgs
// from the live filter set, so callers don't have to thread them through.
export function useApprovalFlags(): ApprovalFlagsPayload {
  const approvedIds     = useAppStore((s) => s.approvedIds);
  const rejectedIds     = useAppStore((s) => s.rejectedIds);
  const skippedIds      = useAppStore((s) => s.skippedIds);
  const downloadedIds   = useAppStore((s) => s.downloadedIds);
  const sentToSheetsIds = useAppStore((s) => s.sentToSheetsIds);
  return useMemo<ApprovalFlagsPayload>(
    () => ({
      includeStatuses: [],
      excludeStatuses: [],
      approvedIds,
      rejectedIds,
      skippedIds,
      downloadedIds,
      sentToSheetsIds,
    }),
    [approvedIds, rejectedIds, skippedIds, downloadedIds, sentToSheetsIds],
  );
}
