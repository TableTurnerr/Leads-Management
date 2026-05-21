"use client";

import { useEffect } from "react";
import { useAppStore } from "./store";

// Hydrate per-status ID arrays from the audit log so the include/exclude
// approval filter (and the status badges) keep working after a localStorage
// clear or when the user signs in on a new device. Runs once after the
// persist layer hydrates; the seed merges into whatever the local store
// already had so pending writes from the current session aren't clobbered.
export function useSyncApprovalHistory() {
  const hasHydrated = useAppStore((s) => s.hasHydrated);
  const seedApprovalStatuses = useAppStore((s) => s.seedApprovalStatuses);

  useEffect(() => {
    if (!hasHydrated) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/leads/status-ids");
        if (!res.ok) return;
        const json = (await res.json()) as {
          approvedIds?: number[];
          rejectedIds?: number[];
          skippedIds?: number[];
          downloadedIds?: number[];
          sentToSheetsIds?: number[];
        };
        if (cancelled) return;
        seedApprovalStatuses({
          approvedIds:     json.approvedIds     ?? [],
          rejectedIds:     json.rejectedIds     ?? [],
          skippedIds:      json.skippedIds      ?? [],
          downloadedIds:   json.downloadedIds   ?? [],
          sentToSheetsIds: json.sentToSheetsIds ?? [],
        });
      } catch {
        // Hydration is best-effort; the user can still mark new statuses
        // locally if the network or auth is flaky.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hasHydrated, seedApprovalStatuses]);
}
