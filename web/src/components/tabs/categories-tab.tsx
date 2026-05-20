"use client";

import useSWR from "swr";
import { useAppStore } from "@/lib/store";
import { postQuery } from "@/lib/fetcher";
import { useApprovalFlags } from "@/lib/use-approval-flags";
import { PlotlyChart } from "@/components/plotly-chart";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import type { Layout } from "plotly.js";

const BASE_LAYOUT: Partial<Layout> = {
  paper_bgcolor: "rgba(0,0,0,0)",
  plot_bgcolor: "rgba(0,0,0,0)",
  font: { color: "#cdd6f4" },
  xaxis: { gridcolor: "#313244" },
  yaxis: { gridcolor: "#313244" },
};

export function CategoriesTab() {
  const filters = useAppStore((s) => s.filters);
  const topN = useAppStore((s) => s.categoriesTopN);
  const setTopN = useAppStore((s) => s.setCategoriesTopN);
  const approvalFlags = useApprovalFlags();

  const { data: top, isLoading: topLoading } = useSWR<{
    rows: { category: string; count: number }[];
  }>(
    ["top_categories", filters, topN, approvalFlags],
    () => postQuery({ type: "top_categories", filters, topN, approvalFlags }),
    { revalidateOnFocus: false, keepPreviousData: true },
  );

  const { data: scoreStats, isLoading: statsLoading } = useSWR<{
    rows: { category: string; count: number; avg_rating: number }[];
  }>(
    ["category_stats"],
    () => postQuery({ type: "category_stats", topN: 30, minCount: 50 }),
    { revalidateOnFocus: false },
  );

  const counts = top?.rows ?? [];
  const scored = (scoreStats?.rows ?? []).slice().sort((a, b) => b.avg_rating - a.avg_rating);

  if ((topLoading && !top) || (statsLoading && !scoreStats)) {
    return <CategoriesSkeleton />;
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-2 max-w-md">
        <div className="flex items-center justify-between">
          <Label className="text-xs">Show top N categories</Label>
          <span className="text-xs text-muted-foreground tabular-nums">{topN}</span>
        </div>
        <Slider
          min={10}
          max={60}
          step={1}
          value={[topN]}
          onValueChange={(v) => setTopN(Array.isArray(v) ? v[0] : v)}
        />
      </div>

      <ChartCard title={`Top ${topN} Categories`}>
        <PlotlyChart
          data={[
            {
              type: "bar",
              orientation: "h",
              y: counts.map((c) => c.category),
              x: counts.map((c) => c.count),
              marker: {
                color: counts.map((c) => c.count),
                colorscale: "Purples",
              },
            },
          ]}
          layout={{
            ...BASE_LAYOUT,
            height: Math.max(400, topN * 22),
            margin: { l: 180, r: 10, t: 10, b: 30 },
            yaxis: { ...BASE_LAYOUT.yaxis, autorange: "reversed" },
            showlegend: false,
          }}
          useResizeHandler
          style={{ width: "100%", height: `${Math.max(400, topN * 22)}px` }}
          config={{ displayModeBar: false }}
        />
      </ChartCard>

      <ChartCard title="Average Score by Category (min 50 restaurants)">
        <PlotlyChart
          data={[
            {
              type: "bar",
              orientation: "h",
              y: scored.map((c) => c.category),
              x: scored.map((c) => c.avg_rating),
              marker: {
                color: scored.map((c) => c.avg_rating),
                colorscale: "RdYlGn",
                cmin: 3.5,
                cmax: 5.0,
              },
              customdata: scored.map((c) => c.count),
              hovertemplate:
                "<b>%{y}</b><br>Avg: %{x:.2f}<br>%{customdata} restaurants<extra></extra>",
            },
          ]}
          layout={{
            ...BASE_LAYOUT,
            height: 600,
            margin: { l: 180, r: 10, t: 10, b: 30 },
            yaxis: { ...BASE_LAYOUT.yaxis, autorange: "reversed" },
            xaxis: { ...BASE_LAYOUT.xaxis, range: [3.5, 5.0] },
            showlegend: false,
          }}
          useResizeHandler
          style={{ width: "100%", height: "600px" }}
          config={{ displayModeBar: false }}
        />
      </ChartCard>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card/40 p-4">
      <h3 className="text-sm font-semibold mb-3">{title}</h3>
      {children}
    </div>
  );
}

function CategoriesSkeleton() {
  return (
    <div className="space-y-6" aria-hidden>
      <div className="grid gap-2 max-w-md">
        <div className="flex items-center justify-between">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-3 w-6" />
        </div>
        <Skeleton className="h-4 w-full" />
      </div>
      <div className="rounded-lg border border-border bg-card/40 p-4">
        <Skeleton className="h-4 w-40 mb-3" />
        <Skeleton className="w-full" style={{ height: 600 }} />
      </div>
      <div className="rounded-lg border border-border bg-card/40 p-4">
        <Skeleton className="h-4 w-72 mb-3" />
        <Skeleton className="w-full" style={{ height: 600 }} />
      </div>
    </div>
  );
}
