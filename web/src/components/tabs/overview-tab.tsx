"use client";

import useSWR from "swr";
import { useAppStore } from "@/lib/store";
import { postQuery } from "@/lib/fetcher";
import { useApprovalFlags } from "@/lib/use-approval-flags";
import { PlotlyChart } from "@/components/plotly-chart";
import { MetricCard } from "@/components/metric-card";
import { Skeleton } from "@/components/ui/skeleton";
import type { OverviewStats } from "@/lib/queries";
import type { Layout } from "plotly.js";

const PLOT_BG = {
  paper_bgcolor: "rgba(0,0,0,0)",
  plot_bgcolor: "rgba(0,0,0,0)",
  font: { color: "#cdd6f4" },
  xaxis: { gridcolor: "#313244" },
  yaxis: { gridcolor: "#313244" },
} as Partial<Layout>;

export function OverviewTab() {
  const filters = useAppStore((s) => s.filters);
  const approvalFlags = useApprovalFlags();
  const { data } = useSWR<OverviewStats>(
    ["overview", filters, approvalFlags],
    () =>
      postQuery<OverviewStats>({ type: "overview", filters, approvalFlags }),
    { revalidateOnFocus: false, keepPreviousData: true },
  );

  // Skeleton only when there's genuinely no data yet. With the persisted
  // SWR cache, refresh-with-cache resolves synchronously, so gating on
  // `isLoading` here would flash a skeleton even when we have data.
  if (!data) return <OverviewSkeleton />;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <MetricCard value={data.total.toLocaleString()} label="Restaurants" />
        <MetricCard value={data.provinces.toLocaleString()} label="States" />
        <MetricCard value={data.cities.toLocaleString()} label="Cities" />
        <MetricCard
          value={data.avgRating != null ? data.avgRating.toFixed(2) : "—"}
          label="Avg Score"
        />
        <MetricCard
          value={data.totalReviews ? data.totalReviews.toLocaleString() : "—"}
          label="Total Reviews"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Score Distribution">
          <PlotlyChart
            data={[
              {
                type: "bar",
                x: data.scoreBuckets.map((b) => b.bucket),
                y: data.scoreBuckets.map((b) => b.count),
                marker: { color: "#cba6f7" },
              },
            ]}
            layout={{
              ...PLOT_BG,
              height: 280,
              margin: { l: 40, r: 10, t: 10, b: 30 },
              showlegend: false,
            }}
            useResizeHandler
            style={{ width: "100%", height: "280px" }}
            config={{ displayModeBar: false }}
          />
        </ChartCard>
        <ChartCard title="Review Count Distribution">
          <PlotlyChart
            data={[
              {
                type: "bar",
                x: data.reviewBuckets.map((b) => b.bucket),
                y: data.reviewBuckets.map((b) => b.count),
                marker: { color: "#89dceb" },
              },
            ]}
            layout={{
              ...PLOT_BG,
              height: 280,
              margin: { l: 40, r: 10, t: 10, b: 30 },
              showlegend: false,
              xaxis: { ...PLOT_BG.xaxis, type: "log" },
              yaxis: { ...PLOT_BG.yaxis, type: "log" },
            }}
            useResizeHandler
            style={{ width: "100%", height: "280px" }}
            config={{ displayModeBar: false }}
          />
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Top Cities">
          <PlotlyChart
            data={[
              {
                type: "bar",
                orientation: "h",
                y: data.topCities.map((c) => c.city),
                x: data.topCities.map((c) => c.count),
                marker: {
                  color: data.topCities.map((c) => c.count),
                  colorscale: "Purples",
                },
              },
            ]}
            layout={{
              ...PLOT_BG,
              height: 360,
              margin: { l: 120, r: 10, t: 10, b: 30 },
              yaxis: { ...PLOT_BG.yaxis, autorange: "reversed" },
              showlegend: false,
            }}
            useResizeHandler
            style={{ width: "100%", height: "360px" }}
            config={{ displayModeBar: false }}
          />
        </ChartCard>
        <ChartCard title="Price Range Breakdown">
          <PlotlyChart
            data={[
              {
                type: "pie",
                hole: 0.5,
                labels: data.priceBreakdown.map((p) => p.price),
                values: data.priceBreakdown.map((p) => p.count),
                marker: { colors: ["#cba6f7", "#b4befe", "#89b4fa", "#74c7ec", "#89dceb"] },
              },
            ]}
            layout={{
              ...PLOT_BG,
              height: 360,
              margin: { l: 10, r: 10, t: 10, b: 10 },
            }}
            useResizeHandler
            style={{ width: "100%", height: "360px" }}
            config={{ displayModeBar: false }}
          />
        </ChartCard>
      </div>

      <ChartCard title="Top States / Provinces">
        <PlotlyChart
          data={[
            {
              type: "bar",
              x: data.topProvinces.map((p) => p.province),
              y: data.topProvinces.map((p) => p.count),
              marker: {
                color: data.topProvinces.map((p) => p.count),
                colorscale: "Teal",
              },
            },
          ]}
          layout={{
            ...PLOT_BG,
            height: 300,
            margin: { l: 40, r: 10, t: 10, b: 60 },
            showlegend: false,
          }}
          useResizeHandler
          style={{ width: "100%", height: "300px" }}
          config={{ displayModeBar: false }}
        />
      </ChartCard>
    </div>
  );
}

function ChartCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-card/40 p-4">
      <h3 className="text-sm font-semibold mb-3">{title}</h3>
      {children}
    </div>
  );
}

function ChartSkeleton({ height }: { height: number }) {
  return (
    <div className="rounded-lg border border-border bg-card/40 p-4">
      <Skeleton className="h-4 w-40 mb-3" />
      <Skeleton className="w-full" style={{ height }} />
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <div className="space-y-6" aria-hidden>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-[76px] rounded-xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartSkeleton height={280} />
        <ChartSkeleton height={280} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartSkeleton height={360} />
        <ChartSkeleton height={360} />
      </div>
      <ChartSkeleton height={300} />
    </div>
  );
}
