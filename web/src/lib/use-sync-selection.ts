"use client";

import { useEffect, useRef } from "react";
import { useAppStore } from "./store";

const ENDPOINT = "/api/lead-selection";
const PUT_DEBOUNCE_MS = 1500;

function sameIdSet(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  const seen = new Set(a);
  for (const id of b) if (!seen.has(id)) return false;
  return true;
}

// Mirrors `selectedIds` between the client store and a per-user row on the
// server so a user can resume their selection on another device or after
// clearing localStorage. Server wins on first load when it has anything;
// otherwise local is pushed up. Subsequent client changes are debounced
// upstream.
export function useSyncSelection() {
  const hasHydrated = useAppStore((s) => s.hasHydrated);
  const initialized = useRef(false);
  const lastSent = useRef<number[] | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!hasHydrated || initialized.current) return;
    initialized.current = true;

    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(ENDPOINT, { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as { restaurantIds?: number[] };
        if (cancelled) return;

        const remote = Array.isArray(json.restaurantIds)
          ? json.restaurantIds
          : [];
        const local = useAppStore.getState().selectedIds;

        if (remote.length > 0 && !sameIdSet(remote, local)) {
          useAppStore.getState().setSelectedIds(remote);
          lastSent.current = remote;
        } else if (remote.length === 0 && local.length > 0) {
          await pushSelection(local);
          lastSent.current = local;
        } else {
          lastSent.current = remote;
        }
      } catch {
        // Network/server failure is non-fatal — local state stays usable and
        // the next mutation will retry the upload.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hasHydrated]);

  useEffect(() => {
    if (!hasHydrated) return;

    const unsub = useAppStore.subscribe((state, prev) => {
      if (state.selectedIds === prev.selectedIds) return;
      if (!initialized.current) return;
      const next = state.selectedIds;
      if (lastSent.current && sameIdSet(lastSent.current, next)) return;

      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        void pushSelection(next).then(() => {
          lastSent.current = next;
        });
      }, PUT_DEBOUNCE_MS);
    });

    return () => {
      unsub();
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
    };
  }, [hasHydrated]);
}

async function pushSelection(ids: number[]): Promise<void> {
  try {
    await fetch(ENDPOINT, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ restaurantIds: ids }),
    });
  } catch {
    // Swallow; selection still lives in localStorage and the next change
    // will trigger another attempt.
  }
}
