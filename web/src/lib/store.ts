"use client";

import { create } from "zustand";
import {
  persist,
  createJSONStorage,
  type StateStorage,
} from "zustand/middleware";
import { DEFAULT_FILTERS, type FilterEnabled, type Filters } from "./types";
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

  hasHydrated: boolean;
  setHasHydrated: (v: boolean) => void;
};

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
      clearSelection: () => set({ selectedIds: [] }),

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

      hasHydrated: false,
      setHasHydrated: (v) => set({ hasHydrated: v }),
    }),
    {
      name: "tt-app-state-v1",
      version: 5,
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
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
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
