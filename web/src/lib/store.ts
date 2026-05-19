"use client";

import { create } from "zustand";
import {
  persist,
  createJSONStorage,
  type StateStorage,
} from "zustand/middleware";
import { DEFAULT_FILTERS, type FilterEnabled, type Filters } from "./types";

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
      version: 2,
      storage: createJSONStorage(safeStorage),
      // v1 → v2: chain filter now defaults to excluding fast-food chains.
      // Only nudge users who never set it; preserve explicit choices.
      migrate: (persisted, version) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const s = persisted as any;
        if (version < 2 && s?.filters && s.filters.isChainOnly == null) {
          s.filters.isChainOnly = false;
        }
        return s;
      },
      // Only the user-visible slice is persisted. Setter identities, the
      // hydration flag, and any transient derived state stay out of storage.
      partialize: (s) => ({
        filters: s.filters,
        selectedIds: s.selectedIds,
        activeTab: s.activeTab,
        mapView: s.mapView,
        tableSortCol: s.tableSortCol,
        tableAsc: s.tableAsc,
        tablePage: s.tablePage,
        categoriesTopN: s.categoriesTopN,
        columnExplorerCol: s.columnExplorerCol,
        columnExplorerTopN: s.columnExplorerTopN,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);
