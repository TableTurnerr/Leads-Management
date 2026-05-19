"use client";

import { useState, Suspense, lazy } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FiltersSidebar } from "./filters-sidebar";
import { TopBar } from "./top-bar";
import { useAppStore } from "@/lib/store";

// Each tab is its own chunk. We render only the active one so Plotly,
// SWR fetches, and Plotly-bound React state for the other five tabs stay
// out of memory until the user opens them.
const OverviewTab       = lazy(() => import("./tabs/overview-tab").then(m => ({ default: m.OverviewTab })));
const MapTab            = lazy(() => import("./tabs/map-tab").then(m => ({ default: m.MapTab })));
const CategoriesTab     = lazy(() => import("./tabs/categories-tab").then(m => ({ default: m.CategoriesTab })));
const ColumnExplorerTab = lazy(() => import("./tabs/column-explorer-tab").then(m => ({ default: m.ColumnExplorerTab })));
const DataTableTab      = lazy(() => import("./tabs/data-table-tab").then(m => ({ default: m.DataTableTab })));
const SelectedTab       = lazy(() => import("./tabs/selected-tab").then(m => ({ default: m.SelectedTab })));

type TabKey = "overview" | "map" | "categories" | "column" | "table" | "selected";

export function AppShell({ userEmail }: { userEmail: string }) {
  const selectionCount = useAppStore((s) => s.selection.length);
  const selectedLabel = selectionCount ? `Selected (${selectionCount})` : "Selected";
  const [tab, setTab] = useState<TabKey>("overview");

  return (
    <div className="flex min-h-screen">
      <FiltersSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar userEmail={userEmail} />
        <main className="flex-1 p-6 overflow-x-hidden">
          <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)} className="w-full">
            <TabsList className="mb-4">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="map">Map</TabsTrigger>
              <TabsTrigger value="categories">Categories</TabsTrigger>
              <TabsTrigger value="column">Column Explorer</TabsTrigger>
              <TabsTrigger value="table">Data Table</TabsTrigger>
              <TabsTrigger value="selected">{selectedLabel}</TabsTrigger>
            </TabsList>
          </Tabs>
          <Suspense fallback={<TabLoading />}>
            {tab === "overview"   && <OverviewTab />}
            {tab === "map"        && <MapTab />}
            {tab === "categories" && <CategoriesTab />}
            {tab === "column"     && <ColumnExplorerTab />}
            {tab === "table"      && <DataTableTab />}
            {tab === "selected"   && <SelectedTab />}
          </Suspense>
        </main>
      </div>
    </div>
  );
}

function TabLoading() {
  return (
    <div className="text-sm text-muted-foreground py-8">Loading view…</div>
  );
}
