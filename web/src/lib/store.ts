"use client";

import { create } from "zustand";
import { DEFAULT_FILTERS, type Filters } from "./types";

type AppState = {
  filters: Filters;
  setFilter: <K extends keyof Filters>(key: K, value: Filters[K]) => void;
  resetFilters: () => void;

  selectedIds: number[];
  setSelectedIds: (ids: number[]) => void;
  clearSelection: () => void;
};

export const useAppStore = create<AppState>((set) => ({
  filters: DEFAULT_FILTERS,
  setFilter: (key, value) =>
    set((s) => ({ filters: { ...s.filters, [key]: value } })),
  resetFilters: () => set({ filters: DEFAULT_FILTERS }),

  selectedIds: [],
  setSelectedIds: (ids) => set({ selectedIds: ids }),
  clearSelection: () => set({ selectedIds: [] }),
}));
