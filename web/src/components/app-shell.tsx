"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FiltersSidebar } from "./filters-sidebar";
import { TopBar } from "./top-bar";
import { OverviewTab } from "./tabs/overview-tab";
import { MapTab } from "./tabs/map-tab";
import { CategoriesTab } from "./tabs/categories-tab";
import { ColumnExplorerTab } from "./tabs/column-explorer-tab";
import { DataTableTab } from "./tabs/data-table-tab";
import { SelectedTab } from "./tabs/selected-tab";
import { useAppStore } from "@/lib/store";

export function AppShell({ userEmail }: { userEmail: string }) {
  const selectionCount = useAppStore((s) => s.selection.length);
  const selectedLabel = selectionCount
    ? `Selected (${selectionCount})`
    : "Selected";

  return (
    <div className="flex min-h-screen">
      <FiltersSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar userEmail={userEmail} />
        <main className="flex-1 p-6 overflow-x-hidden">
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="mb-4">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="map">Map</TabsTrigger>
              <TabsTrigger value="categories">Categories</TabsTrigger>
              <TabsTrigger value="column">Column Explorer</TabsTrigger>
              <TabsTrigger value="table">Data Table</TabsTrigger>
              <TabsTrigger value="selected">{selectedLabel}</TabsTrigger>
            </TabsList>
            <TabsContent value="overview"><OverviewTab /></TabsContent>
            <TabsContent value="map"><MapTab /></TabsContent>
            <TabsContent value="categories"><CategoriesTab /></TabsContent>
            <TabsContent value="column"><ColumnExplorerTab /></TabsContent>
            <TabsContent value="table"><DataTableTab /></TabsContent>
            <TabsContent value="selected"><SelectedTab /></TabsContent>
          </Tabs>
        </main>
      </div>
    </div>
  );
}
