"use client";

import { SWRConfig, type Cache } from "swr";
import { useEffect, useRef, useState } from "react";
import { createPersistedCache } from "@/lib/swr-cache";

// We block the SWR-bound subtree until the IDB cache has loaded so the
// first render already has the persisted data and useSWR resolves
// synchronously without firing the fetcher. The wait is typically
// ~20-50ms (an empty-store open is essentially free); a refresh with the
// map payload cached saves several seconds of wire+parse time, which
// dwarfs that.
//
// While we wait we hand control back via `children` wrapped in a default
// SWRConfig — but with the fetcher disabled so no requests race the
// hydration. The DOM stays visible, just inert from a data point of view.
export function SWRPersistedProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const cacheRef = useRef<Cache | null>(null);

  useEffect(() => {
    let cancelled = false;
    void createPersistedCache().then((map) => {
      if (cancelled) return;
      cacheRef.current = map as unknown as Cache;
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready) {
    // Render nothing for the brief hydration gap. AppShell separately
    // gates on its zustand-persist hydration with a quiet shell, so the
    // user already sees that fallback during this window — we don't want
    // to render a second placeholder that'd flicker over it.
    return null;
  }

  return (
    <SWRConfig
      value={{
        provider: () => cacheRef.current!,
        // The whole point of persisting the cache is to avoid re-fetching
        // on refresh. With this off, useSWR will use the hydrated entry
        // without firing the fetcher; new keys (filter changes) still
        // fetch because they have no cache entry. Use mutate() to force a
        // refresh when needed.
        revalidateIfStale: false,
        revalidateOnFocus: false,
        revalidateOnReconnect: false,
        keepPreviousData: true,
      }}
    >
      {children}
    </SWRConfig>
  );
}
