"use client";

import { useState } from "react";
import { useSWRConfig } from "swr";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { clearPersistedCache } from "@/lib/swr-cache";

// Manual escape hatch from the persisted SWR cache. We deliberately set
// `revalidateIfStale: false` globally so refreshes are instant, which
// means freshness needs an explicit trigger when the user knows the
// underlying data has moved. This button drops everything (in-memory +
// IDB) and forces every mounted useSWR hook to re-fetch.
export function RefreshDataButton() {
  const { cache, mutate } = useSWRConfig();
  const [open, setOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  async function handleConfirm() {
    setRefreshing(true);
    try {
      // Clear the in-memory cache first so any hook that re-renders
      // before the mutate fires shows skeletons instead of stale data.
      // The map is also kept here (3-4MB) — wiping it is what the user
      // actually paid for by clicking this.
      for (const k of Array.from(cache.keys())) cache.delete(k);
      await clearPersistedCache();
      // Filter `() => true` matches every active key; revalidate: true
      // bypasses our global revalidateIfStale: false.
      await mutate(() => true, undefined, { revalidate: true });
      toast.success("Data refreshed.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Refresh failed";
      toast.error(msg);
    } finally {
      setRefreshing(false);
      setOpen(false);
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => setOpen(true)}
        disabled={refreshing}
        title="Refresh data"
        aria-label="Refresh data"
      >
        <RefreshCw
          className={refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"}
        />
      </Button>

      <Dialog open={open} onOpenChange={(v) => !refreshing && setOpen(v)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Refresh data?</DialogTitle>
            <DialogDescription>
              Clears the local cache and re-fetches every active query.
              The map payload is several megabytes, so this may take a
              moment. Your filters, selection, and view are preserved.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={refreshing}
            >
              Cancel
            </Button>
            <Button onClick={handleConfirm} disabled={refreshing}>
              {refreshing ? "Refreshing…" : "Refresh"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
