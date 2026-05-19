"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { useAppStore } from "@/lib/store";
import { postQuery } from "@/lib/fetcher";
import { PlotlyChart } from "@/components/plotly-chart";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { MapPointArrays, Restaurant } from "@/lib/types";
import type {
  Layout,
  PlotMouseEvent,
  PlotSelectionEvent,
  Data as PlotData,
} from "plotly.js";

type PopoverState = {
  x: number;
  y: number;
  loading: boolean;
  restaurant: Restaurant | null;
};

export function MapTab() {
  const filters = useAppStore((s) => s.filters);
  const selectedIds = useAppStore((s) => s.selectedIds);
  const setSelectedIds = useAppStore((s) => s.setSelectedIds);
  const clearSelection = useAppStore((s) => s.clearSelection);

  const { data, isLoading } = useSWR<MapPointArrays>(
    ["map", filters],
    () => postQuery<MapPointArrays>({ type: "map", filters }),
    { revalidateOnFocus: false, keepPreviousData: true, dedupingInterval: 5000 },
  );

  const points = useMemo<MapPointArrays>(
    () =>
      data ?? {
        id: [],
        lat: [],
        lon: [],
        rating: [],
        count: 0,
      },
    [data],
  );

  const trace = useMemo<PlotData>(() => {
    return {
      type: "scattermapbox",
      mode: "markers",
      lat: points.lat,
      lon: points.lon,
      customdata: points.id,
      hovertemplate: "Rating: %{marker.color}<br>Click for details<extra></extra>",
      marker: {
        size: 5,
        color: points.rating.map((r) => (r == null ? 0 : r)),
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

  const [popover, setPopover] = useState<PopoverState | null>(null);

  function onSelected(ev: Readonly<PlotSelectionEvent> | undefined) {
    if (!ev?.points) return;
    const ids = ev.points
      .map((p) => points.id[p.pointIndex as number])
      .filter((v): v is number => typeof v === "number");
    setSelectedIds(ids);
  }

  async function onClick(ev: Readonly<PlotMouseEvent>) {
    const p = ev.points?.[0];
    if (!p) return;
    const idx = p.pointIndex as number;
    const id = points.id[idx];
    if (typeof id !== "number") return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rect = (ev.event as any)?.target?.getBoundingClientRect?.();
    const container = plotDivRef.current;
    const containerRect = container?.getBoundingClientRect();
    const rawX = rect && containerRect ? rect.left - containerRect.left + 12 : 20;
    const rawY = rect && containerRect ? rect.top - containerRect.top + 12 : 20;
    const maxX = (container?.clientWidth ?? 0) - 280;
    const maxY = (container?.clientHeight ?? 0) - 200;
    const x = Math.max(8, Math.min(rawX, maxX));
    const y = Math.max(8, Math.min(rawY, maxY));

    setPopover({ x, y, loading: true, restaurant: null });
    try {
      const res = await postQuery<{ rows: Restaurant[] }>({
        type: "by_ids",
        ids: [id],
      });
      setPopover({ x, y, loading: false, restaurant: res.rows[0] ?? null });
    } catch {
      setPopover(null);
    }
  }

  function addPopoverToSelection() {
    if (!popover?.restaurant) return;
    const id = popover.restaurant.id;
    if (!selectedIds.includes(id)) {
      setSelectedIds([...selectedIds, id]);
    }
    setPopover(null);
  }

  const statusText = isLoading && !data
    ? "Loading map…"
    : `${points.count.toLocaleString()} points · ${selectedIds.length} selected`;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {statusText}
          <span className="hidden md:inline">
            {" · "}box/lasso to select. Hold space to pan.
          </span>
        </p>
        <div className="flex items-center gap-2">
          {selectedIds.length > 0 && (
            <Button variant="outline" size="sm" onClick={clearSelection}>
              Clear selection
            </Button>
          )}
        </div>
      </div>

      {isLoading && !data ? (
        <Skeleton className="h-[600px] w-full rounded-lg" />
      ) : (
        <div
          ref={plotDivRef}
          className="relative rounded-lg overflow-hidden border border-border"
        >
          <PlotlyChart
            data={[trace]}
            layout={
              {
                mapbox: {
                  style: "carto-darkmatter",
                  zoom: 3,
                  center: { lat: 39, lon: -98 },
                },
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
            onClick={onClick}
          />
          {popover && (
            <div
              className="absolute z-20 w-64 rounded-md border border-border bg-card/95 backdrop-blur p-3 shadow-lg text-sm"
              style={{ left: popover.x, top: popover.y }}
            >
              <div className="flex items-start justify-between gap-2">
                <h4 className="font-semibold leading-tight">
                  {popover.loading
                    ? "Loading…"
                    : popover.restaurant?.name ?? "Not found"}
                </h4>
                <button
                  onClick={() => setPopover(null)}
                  className="text-muted-foreground hover:text-foreground text-xs leading-none mt-0.5"
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>
              {popover.restaurant && (
                <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {popover.restaurant.city && (
                    <div>{popover.restaurant.city}</div>
                  )}
                  <div>
                    Rating:{" "}
                    <span className="text-foreground">
                      {popover.restaurant.rating ?? "—"}
                    </span>
                    {popover.restaurant.ratings != null && (
                      <span> ({popover.restaurant.ratings.toLocaleString()} reviews)</span>
                    )}
                  </div>
                  {popover.restaurant.price_bucket && (
                    <div>Price: {popover.restaurant.price_bucket}</div>
                  )}
                  {popover.restaurant.website && (
                    <div className="truncate">
                      <a
                        href={popover.restaurant.website}
                        target="_blank"
                        rel="noreferrer"
                        className="underline underline-offset-2"
                      >
                        {popover.restaurant.website}
                      </a>
                    </div>
                  )}
                </div>
              )}
              {popover.restaurant && (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-3 w-full"
                  onClick={addPopoverToSelection}
                >
                  Add to selection
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
