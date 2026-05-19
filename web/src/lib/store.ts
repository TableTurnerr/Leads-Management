"use client";

import { create } from "zustand";
import { DEFAULT_FILTERS, type Filters, type Restaurant } from "./types";

type AppState = {
  filters: Filters;
  setFilter: <K extends keyof Filters>(key: K, value: Filters[K]) => void;
  resetFilters: () => void;

  selection: Restaurant[];
  setSelection: (rows: Restaurant[]) => void;
  clearSelection: () => void;
};

export const useAppStore = create<AppState>((set) => ({
  filters: DEFAULT_FILTERS,
  setFilter: (key, value) =>
    set((s) => ({ filters: { ...s.filters, [key]: value } })),
  resetFilters: () => set({ filters: DEFAULT_FILTERS }),

  selection: [],
  setSelection: (rows) => set({ selection: rows }),
  clearSelection: () => set({ selection: [] }),
}));
