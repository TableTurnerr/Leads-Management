"use client";

import { useState, Suspense, lazy } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
  const selectionCount = useAppStore((s) => s.selectedIds.length);
  const [tab, setTab] = useState<TabKey>("overview");

  return (
    <div className="flex min-h-screen">
      <FiltersSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar userEmail={userEmail} />
        <main className="flex-1 p-6 overflow-x-hidden">
          <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)} className="w-full">
            <TabsList className="mb-5 h-9 p-1 bg-muted/60 ring-1 ring-foreground/5">
              <TabsTrigger value="overview" className="px-3 data-active:font-semibold">Overview</TabsTrigger>
              <TabsTrigger value="map" className="px-3 data-active:font-semibold">Map</TabsTrigger>
              <TabsTrigger value="categories" className="px-3 data-active:font-semibold">Categories</TabsTrigger>
              <TabsTrigger value="column" className="px-3 data-active:font-semibold">Column Explorer</TabsTrigger>
              <TabsTrigger value="table" className="px-3 data-active:font-semibold">Data Table</TabsTrigger>
              <TabsTrigger value="selected" className="px-3 data-active:font-semibold">
                Selected
                {selectionCount > 0 && (
                  <Badge
                    variant="secondary"
                    className="ml-1 h-4 min-w-4 px-1 text-[10px] tabular-nums"
                  >
                    {selectionCount}
                  </Badge>
                )}
              </TabsTrigger>
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
    <div className="space-y-4" aria-hidden>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
      <Skeleton className="h-[400px] w-full" />
    </div>
  );
}
