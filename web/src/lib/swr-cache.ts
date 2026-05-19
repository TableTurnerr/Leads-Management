"use client";

// SWR's default cache is in-memory only, so every page refresh re-fires
// every hook. The map RPC alone is ~3-4MB of JSON, which we'd rather not
// pay on every reload. This module backs SWR's cache with IndexedDB so a
// refresh hydrates from disk and SWRConfig's `revalidateIfStale: false`
// skips the network entirely (filter changes still generate new keys and
// fetch fresh).
//
// localStorage was tempting (sync API, simpler hydration) but its 5MB
// per-origin cap is right where the map payload lives. IDB has no such
// limit and is the only place we can safely park settled SWR state.

const DB_NAME = "tt-swr-cache";
const STORE = "kv";
const ENTRIES_KEY = "entries-v1";

// 6h matches our scraper cadence: refreshes inside the window are
// instant; anything older falls through to a live fetch. If you tighten
// the ingest schedule, drop this to match.
const TTL_MS = 6 * 60 * 60 * 1000;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function idbGet<T>(key: string): Promise<T | null> {
  try {
    const db = await openDb();
    return await new Promise<T | null>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve((req.result ?? null) as T | null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

async function idbPut(key: string, value: unknown): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Cache is best-effort; a quota or transaction error shouldn't break
    // the app.
  }
}

async function idbDelete(key: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // ignore
  }
}

// Drop the persisted SWR cache from IDB. Used by the manual "Refresh
// data" affordance; in-memory SWR cache is cleared by the caller via
// useSWRConfig().cache so this only needs to wipe the on-disk copy.
export async function clearPersistedCache(): Promise<void> {
  await idbDelete(ENTRIES_KEY);
}

type SwrState = {
  data?: unknown;
  error?: unknown;
  isLoading?: boolean;
  isValidating?: boolean;
};

type PersistedEntry = [string, { data: unknown; t: number }];

// PersistMap is a drop-in Map that fires `onChange` whenever an entry is
// added, replaced, or removed. SWR's provider contract only requires
// keys/get/set/delete, all of which we inherit; the override lets us
// schedule a debounced write back to IDB without monkeypatching.
//
// We seed the map via super.set in the constructor body (not via the
// inherited iterable-arg ctor) because that path would call our override
// before `onChange` is assigned and crash on the first hydration.
class PersistMap<V> extends Map<string, V> {
  private onChange: () => void;
  constructor(entries: Iterable<[string, V]>, onChange: () => void) {
    super();
    this.onChange = onChange;
    for (const [k, v] of entries) super.set(k, v);
  }
  set(k: string, v: V) {
    super.set(k, v);
    this.onChange();
    return this;
  }
  delete(k: string) {
    const r = super.delete(k);
    if (r) this.onChange();
    return r;
  }
  clear() {
    super.clear();
    this.onChange();
  }
}

function debounce<F extends (...args: never[]) => void>(fn: F, ms: number) {
  let h: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<F>) => {
    if (h) clearTimeout(h);
    h = setTimeout(() => fn(...args), ms);
  };
}

export async function createPersistedCache(): Promise<Map<string, SwrState>> {
  if (typeof window === "undefined") return new Map();

  const raw = await idbGet<PersistedEntry[]>(ENTRIES_KEY);
  const initial: [string, SwrState][] = [];
  const now = Date.now();
  if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (!Array.isArray(entry) || entry.length !== 2) continue;
      const [k, v] = entry;
      if (typeof k !== "string" || !v || typeof v !== "object") continue;
      if (typeof v.t !== "number" || now - v.t > TTL_MS) continue;
      // Reconstruct a settled SWR state — explicitly clear the loading
      // flags so SWR doesn't think there's a pending request from a
      // previous session.
      initial.push([
        k,
        {
          data: v.data,
          error: undefined,
          isLoading: false,
          isValidating: false,
        },
      ]);
    }
  }

  const flush = () => {
    const stamp = Date.now();
    const out: PersistedEntry[] = [];
    map.forEach((v, k) => {
      // Skip in-flight or errored entries. We also skip SWR's internal
      // bookkeeping keys whose value shape doesn't carry `data`.
      if (!v || typeof v !== "object") return;
      if (v.isValidating || v.isLoading) return;
      if (v.error !== undefined) return;
      if (v.data === undefined) return;
      out.push([k, { data: v.data, t: stamp }]);
    });
    void idbPut(ENTRIES_KEY, out);
  };

  // Persist ~500ms after the last mutation. SWR rewrites a key several
  // times during one fetch lifecycle (state transitions), so coalescing
  // saves on IDB churn.
  const flushDebounced = debounce(flush, 500);
  const map = new PersistMap<SwrState>(initial, flushDebounced);

  // pagehide fires reliably across browsers (including bfcache and
  // mobile) where beforeunload misses. visibilitychange catches the case
  // where the tab is backgrounded but not closed.
  window.addEventListener("pagehide", flush);
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });

  return map;
}
