"use client";

import useSWR from "swr";
import { useAppStore } from "@/lib/store";
import { postQuery } from "@/lib/fetcher";
import { PlotlyChart } from "@/components/plotly-chart";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { MetricCard } from "@/components/metric-card";
import { Skeleton } from "@/components/ui/skeleton";
import type { Layout } from "plotly.js";

const COLUMNS = [
  "name", "address", "city", "province", "postal_code", "category",
  "rating", "ratings", "price_range", "price_bucket",
  "website", "phone", "country", "is_chain", "location_name",
];

const BASE_LAYOUT: Partial<Layout> = {
  paper_bgcolor: "rgba(0,0,0,0)",
  plot_bgcolor: "rgba(0,0,0,0)",
  font: { color: "#cdd6f4" },
  xaxis: { gridcolor: "#313244" },
  yaxis: { gridcolor: "#313244" },
};

type ColumnData = {
  total: number;
  nonNull: number;
  unique: number;
  top: { value: string; count: number }[];
};

export function ColumnExplorerTab() {
  const filters = useAppStore((s) => s.filters);
  const col = useAppStore((s) => s.columnExplorerCol);
  const topN = useAppStore((s) => s.columnExplorerTopN);
  const setCol = useAppStore((s) => s.setColumnExplorerCol);
  const setTopN = useAppStore((s) => s.setColumnExplorerTopN);

  const { data, isLoading } = useSWR<ColumnData>(
    ["column", filters, col, topN],
    () => postQuery({ type: "column", filters, col, topN }),
    { revalidateOnFocus: false, keepPreviousData: true },
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
        <div className="grid gap-2">
          <Label className="text-xs">Column</Label>
          <Select value={col} onValueChange={(v) => v && setCol(v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {COLUMNS.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Show top N</Label>
            <span className="text-xs text-muted-foreground tabular-nums">{topN}</span>
          </div>
          <Slider
            min={5}
            max={50}
            step={1}
            value={[topN]}
            onValueChange={(v) => setTopN(Array.isArray(v) ? v[0] : v)}
          />
        </div>
      </div>

      {isLoading && !data ? (
        <ColumnSkeleton />
      ) : data ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricCard value={data.total.toLocaleString()} label="Sampled" />
            <MetricCard value={data.nonNull.toLocaleString()} label="Non-null" />
            <MetricCard
              value={(data.total - data.nonNull).toLocaleString()}
              label="Missing"
            />
            <MetricCard value={data.unique.toLocaleString()} label="Unique values" />
          </div>

          <div className="rounded-lg border border-border bg-card/40 p-4">
            <h3 className="text-sm font-semibold mb-3">Top {topN} values</h3>
            <PlotlyChart
              data={[
                {
                  type: "bar",
                  orientation: "h",
                  y: data.top.map((r) => r.value),
                  x: data.top.map((r) => r.count),
                  marker: {
                    color: data.top.map((r) => r.count),
                    colorscale: "Purples",
                  },
                },
              ]}
              layout={{
                ...BASE_LAYOUT,
                height: Math.max(300, topN * 24),
                margin: { l: 160, r: 10, t: 10, b: 30 },
                yaxis: { ...BASE_LAYOUT.yaxis, autorange: "reversed" },
                showlegend: false,
              }}
              useResizeHandler
              style={{ width: "100%", height: `${Math.max(300, topN * 24)}px` }}
              config={{ displayModeBar: false }}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}

function ColumnSkeleton() {
  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3" aria-hidden>
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[76px] rounded-xl" />
        ))}
      </div>
      <div className="rounded-lg border border-border bg-card/40 p-4" aria-hidden>
        <Skeleton className="h-4 w-32 mb-3" />
        <Skeleton className="w-full" style={{ height: 480 }} />
      </div>
    </>
  );
}
