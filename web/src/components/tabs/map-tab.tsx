"use client";

import { useEffect, useRef } from "react";
import useSWR from "swr";
import { useAppStore } from "@/lib/store";
import { postQuery } from "@/lib/fetcher";
import { PlotlyChart } from "@/components/plotly-chart";
import { Button } from "@/components/ui/button";
import type { Restaurant } from "@/lib/types";
import type { Layout, PlotMouseEvent, PlotSelectionEvent } from "plotly.js";

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

export function MapTab() {
  const filters = useAppStore((s) => s.filters);
  const selection = useAppStore((s) => s.selection);
  const setSelection = useAppStore((s) => s.setSelection);
  const clearSelection = useAppStore((s) => s.clearSelection);

  const { data, isLoading } = useSWR<{ points: MapPoint[] }>(
    ["map", filters],
    () => postQuery<{ points: MapPoint[] }>({ type: "map", filters }),
    { revalidateOnFocus: false, keepPreviousData: true },
  );

  const points = data?.points ?? [];

  // spacebar-to-pan
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
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {isLoading
            ? "Loading map…"
            : `${points.length.toLocaleString()} points · ${selection.length} selected`}
          {" · "}
          <span className="hidden sm:inline">
            Use the box-select or lasso tool in the toolbar (top right of the
            map) to select restaurants. Hold space to pan.
          </span>
        </p>
        {selection.length > 0 && (
          <Button variant="outline" size="sm" onClick={clearSelection}>
            Clear selection
          </Button>
        )}
      </div>
      <div ref={plotDivRef} className="rounded-lg overflow-hidden border border-border">
        <PlotlyChart
          data={[
            {
              type: "scattermapbox",
              mode: "markers",
              lat: points.map((p) => p.latitude!),
              lon: points.map((p) => p.longitude!),
              text: points.map((p) => p.name),
              customdata: points.map((p) => [
                p.city ?? "",
                p.rating ?? "",
                p.ratings ?? "",
                p.price_bucket ?? "",
              ]),
              hovertemplate:
                "<b>%{text}</b><br>%{customdata[0]}<br>Rating: %{customdata[1]} (%{customdata[2]} reviews)<br>%{customdata[3]}<extra></extra>",
              marker: {
                size: 6,
                color: points.map((p) => p.rating ?? 0),
                colorscale: "Plasma",
                opacity: 0.6,
                showscale: true,
              },
            },
          ]}
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
