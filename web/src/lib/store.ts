"use client";

import { create } from "zustand";
import {
  persist,
  createJSONStorage,
  type StateStorage,
} from "zustand/middleware";
import {
  DEFAULT_ENABLED,
  DEFAULT_FILTERS,
  DEFAULT_APPROVAL_STATUSES,
  type FilterEnabled,
  type Filters,
  type ApprovalStatus,
} from "./types";
import { loadSelectedIds, saveSelectedIds } from "./selected-ids-storage";

export type TabKey =
  | "overview"
  | "map"
  | "categories"
  | "column"
  | "table"
  | "selected";

export type MapView = {
  zoom: number;
  center: { lat: number; lon: number };
};

export const DEFAULT_MAP_VIEW: MapView = {
  zoom: 3,
  center: { lat: 39, lon: -98 },
};

export type TableSortCol = "rating" | "ratings" | "name";

export type MapStyle =
  | "carto-darkmatter"
  | "open-street-map"
  | "satellite";

export const DEFAULT_MAP_STYLE: MapStyle = "carto-darkmatter";

export const MAP_STYLE_OPTIONS: { value: MapStyle; label: string }[] = [
  { value: "carto-darkmatter", label: "Dark" },
  { value: "open-street-map", label: "Streets" },
  { value: "satellite", label: "Satellite" },
];

type AppState = {
  filters: Filters;
  setFilter: <K extends keyof Filters>(key: K, value: Filters[K]) => void;
  setEnabled: <K extends keyof FilterEnabled>(key: K, value: boolean) => void;
  resetFilters: () => void;

  selectedIds: number[];
  setSelectedIds: (ids: number[]) => void;
  clearSelection: () => void;

  activeTab: TabKey;
  setActiveTab: (t: TabKey) => void;

  mapView: MapView;
  setMapView: (v: MapView) => void;
  resetMapView: () => void;

  mapStyle: MapStyle;
  setMapStyle: (s: MapStyle) => void;

  tableSortCol: TableSortCol;
  tableAsc: boolean;
  tablePage: number;
  setTableSortCol: (c: TableSortCol) => void;
  setTableAsc: (v: boolean) => void;
  setTablePage: (p: number) => void;

  categoriesTopN: number;
  setCategoriesTopN: (n: number) => void;

  columnExplorerCol: string;
  columnExplorerTopN: number;
  setColumnExplorerCol: (c: string) => void;
  setColumnExplorerTopN: (n: number) => void;

  approvalMode: boolean;
  approvalQueue: number[];
  approvalIndex: number;
  approvedIds: number[];
  rejectedIds: number[];
  skippedIds: number[];
  downloadedIds: number[];
  sentToSheetsIds: number[];
  startApproval: (ids: number[]) => void;
  exitApproval: () => void;
  setApprovalIndex: (i: number) => void;
  markApproved: (id: number) => void;
  markRejected: (id: number) => void;
  markSkipped: (id: number) => void;
  markDownloaded: (ids: number[]) => void;
  markSentToSheets: (ids: number[]) => void;
  clearApprovalStatuses: () => void;
  seedApprovalStatuses: (seed: {
    approvedIds: number[];
    rejectedIds: number[];
    skippedIds: number[];
    downloadedIds: number[];
    sentToSheetsIds: number[];
  }) => void;

  showAllSelected: boolean;
  setShowAllSelected: (v: boolean) => void;

  hasHydrated: boolean;
  setHasHydrated: (v: boolean) => void;
};

function unionIds(a: number[], b: number[]): number[] {
  if (b.length === 0) return a;
  const seen = new Set(a);
  let changed = false;
  for (const id of b) {
    if (!seen.has(id)) {
      seen.add(id);
      changed = true;
    }
  }
  return changed ? [...seen] : a;
}

// localStorage is undefined during SSR. Hand persist a no-op shim there so
// the store creator doesn't throw when this module is evaluated on the
// server; on the client the real localStorage is used.
const noopStorage: StateStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

const safeStorage = (): StateStorage =>
  typeof window !== "undefined" ? window.localStorage : noopStorage;

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      filters: DEFAULT_FILTERS,
      setFilter: (key, value) =>
        set((s) => ({ filters: { ...s.filters, [key]: value } })),
      setEnabled: (key, value) =>
        set((s) => ({
          filters: {
            ...s.filters,
            enabled: { ...s.filters.enabled, [key]: value },
          },
        })),
      resetFilters: () => set({ filters: DEFAULT_FILTERS }),

      selectedIds: [],
      setSelectedIds: (ids) => set({ selectedIds: ids }),
      clearSelection: () => set({ selectedIds: [], showAllSelected: false }),

      activeTab: "overview",
      setActiveTab: (t) => set({ activeTab: t }),

      mapView: DEFAULT_MAP_VIEW,
      setMapView: (v) => set({ mapView: v }),
      resetMapView: () => set({ mapView: DEFAULT_MAP_VIEW }),

      mapStyle: DEFAULT_MAP_STYLE,
      setMapStyle: (s) => set({ mapStyle: s }),

      tableSortCol: "rating",
      tableAsc: false,
      tablePage: 1,
      setTableSortCol: (c) => set({ tableSortCol: c }),
      setTableAsc: (v) => set({ tableAsc: v }),
      setTablePage: (p) => set({ tablePage: p }),

      categoriesTopN: 25,
      setCategoriesTopN: (n) => set({ categoriesTopN: n }),

      columnExplorerCol: "category",
      columnExplorerTopN: 20,
      setColumnExplorerCol: (c) => set({ columnExplorerCol: c }),
      setColumnExplorerTopN: (n) => set({ columnExplorerTopN: n }),

      approvalMode: false,
      approvalQueue: [],
      approvalIndex: 0,
      approvedIds: [],
      rejectedIds: [],
      skippedIds: [],
      downloadedIds: [],
      sentToSheetsIds: [],
      startApproval: (ids) =>
        set({
          approvalMode: true,
          approvalQueue: ids,
          approvalIndex: 0,
          approvedIds: [],
          rejectedIds: [],
          skippedIds: [],
        }),
      exitApproval: () => set({ approvalMode: false }),
      setApprovalIndex: (i) => set({ approvalIndex: i }),
      markApproved: (id) =>
        set((s) => ({
          approvedIds: s.approvedIds.includes(id)
            ? s.approvedIds
            : [...s.approvedIds, id],
          rejectedIds: s.rejectedIds.filter((x) => x !== id),
          skippedIds: s.skippedIds.filter((x) => x !== id),
        })),
      markRejected: (id) =>
        set((s) => ({
          rejectedIds: s.rejectedIds.includes(id)
            ? s.rejectedIds
            : [...s.rejectedIds, id],
          approvedIds: s.approvedIds.filter((x) => x !== id),
          skippedIds: s.skippedIds.filter((x) => x !== id),
        })),
      markSkipped: (id) =>
        set((s) => ({
          skippedIds: s.skippedIds.includes(id)
            ? s.skippedIds
            : [...s.skippedIds, id],
          approvedIds: s.approvedIds.filter((x) => x !== id),
          rejectedIds: s.rejectedIds.filter((x) => x !== id),
        })),
      markDownloaded: (ids) =>
        set((s) => {
          if (!ids.length) return {} as Partial<AppState>;
          const seen = new Set(s.downloadedIds);
          const next = [...s.downloadedIds];
          for (const id of ids) if (!seen.has(id)) { seen.add(id); next.push(id); }
          return next.length === s.downloadedIds.length
            ? ({} as Partial<AppState>)
            : { downloadedIds: next };
        }),
      markSentToSheets: (ids) =>
        set((s) => {
          if (!ids.length) return {} as Partial<AppState>;
          const seen = new Set(s.sentToSheetsIds);
          const next = [...s.sentToSheetsIds];
          for (const id of ids) if (!seen.has(id)) { seen.add(id); next.push(id); }
          return next.length === s.sentToSheetsIds.length
            ? ({} as Partial<AppState>)
            : { sentToSheetsIds: next };
        }),
      clearApprovalStatuses: () =>
        set({
          approvedIds: [],
          rejectedIds: [],
          skippedIds: [],
          downloadedIds: [],
          sentToSheetsIds: [],
        }),
      seedApprovalStatuses: (seed) =>
        set((s) => ({
          approvedIds:     unionIds(s.approvedIds,     seed.approvedIds),
          rejectedIds:     unionIds(s.rejectedIds,     seed.rejectedIds),
          skippedIds:      unionIds(s.skippedIds,      seed.skippedIds),
          downloadedIds:   unionIds(s.downloadedIds,   seed.downloadedIds),
          sentToSheetsIds: unionIds(s.sentToSheetsIds, seed.sentToSheetsIds),
        })),

      showAllSelected: false,
      setShowAllSelected: (v) => set({ showAllSelected: v }),

      hasHydrated: false,
      setHasHydrated: (v) => set({ hasHydrated: v }),
    }),
    {
      name: "tt-app-state-v1",
      version: 10,
      storage: createJSONStorage(safeStorage),
      migrate: (persisted, version) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const s = persisted as any;
        if (version < 2 && s?.filters && s.filters.isChainOnly == null) {
          s.filters.isChainOnly = false;
        }
        // v2 → v3: category values in cat_list were consolidated (1797 → 110
        // distinct values). Clear any saved category filters so stale names
        // (e.g. "Korean BBQ", "Pizza restaurant") don't silently return 0 rows.
        if (version < 3 && s?.filters) {
          s.filters.categories = [];
          s.filters.excludeCategories = [];
        }
        if (
          version < 4 &&
          (s?.mapStyle === "carto-positron" ||
            s?.mapStyle === "white-bg" ||
            s?.mapStyle === "3d")
        ) {
          s.mapStyle = DEFAULT_MAP_STYLE;
        }
        // v4 → v5: selectedIds moved to its own compact storage key. Keep the
        // old array around so onRehydrateStorage can migrate it on first run.
        if (version < 6 && s?.filters) {
          if (!Array.isArray(s.filters.approvalStatuses)) {
            s.filters.approvalStatuses = [];
          }
          if (s.filters.enabled && s.filters.enabled.approvalStatuses == null) {
            s.filters.enabled.approvalStatuses = true;
          }
        }
        // v6 → v7: approval-status default flipped from [] (show all) to
        // "everything except rejected". Upgrade existing users who were
        // still on the old default; preserve anyone with a real selection.
        if (version < 7 && s?.filters) {
          if (
            !Array.isArray(s.filters.approvalStatuses) ||
            s.filters.approvalStatuses.length === 0
          ) {
            s.filters.approvalStatuses = [...DEFAULT_APPROVAL_STATUSES];
          }
        }
        if (version < 8 && s?.filters && s.filters.isChainOnly == null) {
          s.filters.isChainOnly = false;
        }
        // v8 → v9: filter key renamed from leadStatuses to approvalStatuses
        // (matches the renamed UI section and SQL params).
        if (version < 9 && s?.filters) {
          if (Array.isArray(s.filters.leadStatuses) && !Array.isArray(s.filters.approvalStatuses)) {
            s.filters.approvalStatuses = s.filters.leadStatuses;
          }
          delete s.filters.leadStatuses;
          if (s.filters.enabled) {
            if (s.filters.enabled.leadStatuses != null && s.filters.enabled.approvalStatuses == null) {
              s.filters.enabled.approvalStatuses = s.filters.enabled.leadStatuses;
            }
            delete s.filters.enabled.leadStatuses;
          }
        }
        // v9 → v10: approvalStatuses split into includeApprovalStatuses /
        // excludeApprovalStatuses. The old field was an include-only list; the
        // new default is include=[] (all), exclude=["rejected"].
        if (version < 10 && s?.filters) {
          if (Array.isArray(s.filters.approvalStatuses)) {
            const old = s.filters.approvalStatuses as ApprovalStatus[];
            const wasDefault =
              old.length === DEFAULT_APPROVAL_STATUSES.length &&
              DEFAULT_APPROVAL_STATUSES.every((x) => old.includes(x));
            if (wasDefault || old.length === 0) {
              s.filters.includeApprovalStatuses = [];
              s.filters.excludeApprovalStatuses = ["rejected"];
            } else {
              s.filters.includeApprovalStatuses = old;
              s.filters.excludeApprovalStatuses = [];
            }
            delete s.filters.approvalStatuses;
          } else if (!Array.isArray(s.filters.includeApprovalStatuses)) {
            s.filters.includeApprovalStatuses = [];
            s.filters.excludeApprovalStatuses = ["rejected"];
          }
        }
        return s;
      },
      // Only the user-visible slice is persisted. Setter identities, the
      // hydration flag, and any transient derived state stay out of storage.
      // selectedIds is intentionally excluded — it lives in its own key with
      // a compact varint/bitset encoding (see ./selected-ids-storage).
      partialize: (s) => ({
        filters: s.filters,
        activeTab: s.activeTab,
        mapView: s.mapView,
        mapStyle: s.mapStyle,
        tableSortCol: s.tableSortCol,
        tableAsc: s.tableAsc,
        tablePage: s.tablePage,
        categoriesTopN: s.categoriesTopN,
        columnExplorerCol: s.columnExplorerCol,
        columnExplorerTopN: s.columnExplorerTopN,
        approvalMode: s.approvalMode,
        approvalQueue: s.approvalQueue,
        approvalIndex: s.approvalIndex,
        approvedIds: s.approvedIds,
        rejectedIds: s.rejectedIds,
        skippedIds: s.skippedIds,
        downloadedIds: s.downloadedIds,
        sentToSheetsIds: s.sentToSheetsIds,
        showAllSelected: s.showAllSelected,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        // Backfill any filter keys missing from older persisted state so
        // components can rely on every field being defined.
        state.filters = {
          ...DEFAULT_FILTERS,
          ...state.filters,
          enabled: {
            ...DEFAULT_ENABLED,
            ...(state.filters?.enabled ?? {}),
          },
        };
        if (!Array.isArray(state.filters.includeApprovalStatuses)) {
          state.filters.includeApprovalStatuses = [];
        }
        if (!Array.isArray(state.filters.excludeApprovalStatuses)) {
          state.filters.excludeApprovalStatuses = ["rejected"];
        }
        if (typeof window !== "undefined") {
          const fromCompact = loadSelectedIds();
          if (fromCompact.length) {
            state.selectedIds = fromCompact;
          } else if (state.selectedIds.length) {
            // Migrating from v4: pre-existing IDs lived in the main blob.
            saveSelectedIds(state.selectedIds);
          }
        }
        state.setHasHydrated(true);
      },
    },
  ),
);

if (typeof window !== "undefined") {
  let prev = useAppStore.getState().selectedIds;
  useAppStore.subscribe((s) => {
    if (s.selectedIds !== prev) {
      prev = s.selectedIds;
      saveSelectedIds(s.selectedIds);
    }
  });
}
