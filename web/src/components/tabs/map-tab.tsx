"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { useAppStore } from "@/lib/store";
import { postQuery } from "@/lib/fetcher";
import { PlotlyChart } from "@/components/plotly-chart";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Restaurant } from "@/lib/types";
import type { Layout, PlotMouseEvent, PlotSelectionEvent, Data as PlotData } from "plotly.js";

type MapPoint = Pick<
  Restaurant,
  | "id"
  | "name"
  | "city"
  | "latitude"
  | "longitude"
  | "rating"
  | "ratings"
  | "price_bucket"
  | "country"
  | "province"
>;

const LIMIT_OPTIONS = [1000, 3000, 5000, 10000];

export function MapTab() {
  const filters = useAppStore((s) => s.filters);
  const selection = useAppStore((s) => s.selection);
  const setSelection = useAppStore((s) => s.setSelection);
  const clearSelection = useAppStore((s) => s.clearSelection);
  const [limit, setLimit] = useState(3000);

  const { data, isLoading } = useSWR<{ points: MapPoint[] }>(
    ["map", filters, limit],
    () => postQuery<{ points: MapPoint[] }>({ type: "map", filters, limit }),
    { revalidateOnFocus: false, keepPreviousData: true, dedupingInterval: 5000 },
  );

  const points = data?.points ?? [];

  // Pre-extract the parallel arrays Plotly wants. useMemo so we don't rebuild
  // these on every keystroke or selection change.
  const trace = useMemo<PlotData>(() => {
    const lat: number[] = [];
    const lon: number[] = [];
    const text: string[] = [];
    const customdata: (string | number)[][] = [];
    const color: number[] = [];
    for (const p of points) {
      lat.push(p.latitude as number);
      lon.push(p.longitude as number);
      text.push(p.name);
      customdata.push([
        p.city ?? "",
        p.rating ?? 0,
        p.ratings ?? 0,
        p.price_bucket ?? "",
      ]);
      color.push(p.rating ?? 0);
    }
    return {
      type: "scattermapbox",
      mode: "markers",
      lat,
      lon,
      text,
      customdata,
      hovertemplate:
        "<b>%{text}</b><br>%{customdata[0]}<br>Rating: %{customdata[1]} (%{customdata[2]} reviews)<br>%{customdata[3]}<extra></extra>",
      marker: {
        size: 5,
        color,
        colorscale: "Plasma",
        opacity: 0.65,
        showscale: true,
      },
    } as unknown as PlotData;
  }, [points]);

  const plotDivRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    let prev: string | null = null;
    const onDown = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat) return;
      const tag = (document.activeElement?.tagName ?? "").toUpperCase();
      if (["INPUT", "TEXTAREA", "SELECT"].includes(tag)) return;
      const plot = plotDivRef.current?.querySelector(".js-plotly-plot") as
        | (HTMLElement & { _fullLayout?: { dragmode: string } })
        | null;
      if (!plot) return;
      const current = plot._fullLayout?.dragmode;
      if (current === "pan") return;
      prev = current ?? null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).Plotly?.relayout(plot, { dragmode: "pan" });
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      if (!prev) return;
      const plot = plotDivRef.current?.querySelector(".js-plotly-plot") as
        | HTMLElement
        | null;
      if (!plot) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).Plotly?.relayout(plot, { dragmode: prev });
      prev = null;
    };
    document.addEventListener("keydown", onDown, true);
    document.addEventListener("keyup", onUp, true);
    return () => {
      document.removeEventListener("keydown", onDown, true);
      document.removeEventListener("keyup", onUp, true);
    };
  }, []);

  function onSelected(ev: Readonly<PlotSelectionEvent> | undefined) {
    if (!ev?.points) return;
    const idx = new Set(ev.points.map((p) => p.pointIndex));
    const rows = points.filter((_, i) => idx.has(i));
    setSelection(rows as unknown as Restaurant[]);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {isLoading
            ? "Loading map…"
            : `${points.length.toLocaleString()} points · ${selection.length} selected`}
          <span className="hidden md:inline">
            {" · "}box/lasso to select. Hold space to pan.
          </span>
        </p>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Points</span>
          <Select value={String(limit)} onValueChange={(v) => v && setLimit(Number(v))}>
            <SelectTrigger className="w-24 h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LIMIT_OPTIONS.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n.toLocaleString()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selection.length > 0 && (
            <Button variant="outline" size="sm" onClick={clearSelection}>
              Clear selection
            </Button>
          )}
        </div>
      </div>
      <div ref={plotDivRef} className="rounded-lg overflow-hidden border border-border">
        <PlotlyChart
          data={[trace]}
          layout={
            {
              mapbox: { style: "carto-darkmatter", zoom: 3, center: { lat: 39, lon: -98 } },
              height: 600,
              margin: { l: 0, r: 0, t: 0, b: 0 },
              paper_bgcolor: "rgba(0,0,0,0)",
              dragmode: "pan",
              font: { color: "#cdd6f4" },
            } as Partial<Layout>
          }
          useResizeHandler
          style={{ width: "100%", height: "600px" }}
          config={{
            scrollZoom: true,
            displayModeBar: true,
            modeBarButtonsToAdd: ["select2d", "lasso2d"],
            modeBarButtonsToRemove: ["toggleHover"],
          }}
          onSelected={onSelected}
          onDeselect={(() => clearSelection()) as () => void}
          onClick={undefined as unknown as (e: PlotMouseEvent) => void}
        />
      </div>
    </div>
  );
}
