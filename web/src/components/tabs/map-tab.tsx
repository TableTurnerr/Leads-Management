"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { MAP_STYLE_OPTIONS, useAppStore, type MapStyle } from "@/lib/store";
import { postQuery } from "@/lib/fetcher";
import { PlotlyChart } from "@/components/plotly-chart";
import { Button } from "@/components/ui/button";
import type { MapPointArrays, Restaurant } from "@/lib/types";
import { useApprovalFlags } from "@/lib/use-approval-flags";
import type {
  Layout,
  PlotMouseEvent,
  PlotRelayoutEvent,
  PlotSelectionEvent,
  Data as PlotData,
} from "plotly.js";

function ScanOverlay({
  plotDivRef,
  center,
}: {
  plotDivRef: React.RefObject<HTMLDivElement | null>;
  center: { lat: number; lon: number };
}) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    let raf = 0;
    const measure = () => {
      const root = plotDivRef.current;
      if (!root) return;
      const node = root.querySelector(".js-plotly-plot") as
        | (HTMLElement & {
            _fullLayout?: {
              map?: { _subplot?: { map?: { project?: (lnglat: [number, number]) => { x: number; y: number } } } };
            };
          })
        | null;
      const subplotMap = node?._fullLayout?.map?._subplot?.map;
      const project = subplotMap?.project?.bind(subplotMap);
      if (!project) {
        const rect = root.getBoundingClientRect();
        setPos({ x: rect.width / 2, y: rect.height / 2 });
        return;
      }
      const p = project([center.lon, center.lat]);
      setPos({ x: p.x, y: p.y });
    };
    raf = window.requestAnimationFrame(measure);
    const id = window.setInterval(measure, 250);
    return () => {
      window.cancelAnimationFrame(raf);
      window.clearInterval(id);
    };
  }, [plotDivRef, center.lat, center.lon]);

  if (!pos) return null;
  return (
    <div
      className="pointer-events-none absolute inset-0 z-20 overflow-hidden"
      aria-live="polite"
      aria-busy="true"
    >
      <div
        className="absolute"
        style={{
          left: pos.x,
          top: pos.y,
          transform: "translate(-50%, -50%)",
          width: 24,
          height: 24,
        }}
      >
        <span className="absolute inset-0 rounded-full border-2 border-primary/60 animate-ping" />
        <span
          className="absolute -inset-4 rounded-full border border-primary/45 animate-ping"
          style={{ animationDelay: "250ms", animationDuration: "1.8s" }}
        />
        <span
          className="absolute -inset-10 rounded-full border border-primary/30 animate-ping"
          style={{ animationDelay: "500ms", animationDuration: "2.4s" }}
        />
        <span
          className="absolute -inset-20 rounded-full border border-primary/15 animate-ping"
          style={{ animationDelay: "750ms", animationDuration: "3s" }}
        />
        <span className="absolute inset-[35%] rounded-full bg-primary shadow-[0_0_18px_rgba(99,102,241,0.95)]" />
      </div>
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-background/80 backdrop-blur px-3 py-1 text-xs text-muted-foreground border border-border">
        Scanning for leads…
      </div>
    </div>
  );
}

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
  const setMapView = useAppStore((s) => s.setMapView);
  const mapStyle = useAppStore((s) => s.mapStyle);
  const setMapStyle = useAppStore((s) => s.setMapStyle);
  // Snapshot the persisted view at mount. Lazy useState (not a subscription
  // and not a ref) keeps the value stable for the lifetime of this component
  // so the memoized layout below doesn't depend on a moving target.
  const [initialMapView] = useState(() => useAppStore.getState().mapView);
  // Live zoom — drives marker sizing in satellite mode so points scale with
  // the camera instead of staying a fixed pixel size as the user zooms out.
  const [liveZoom, setLiveZoom] = useState(() => initialMapView.zoom);

  const approvalFlags = useApprovalFlags();
  const { data, isLoading } = useSWR<MapPointArrays>(
    ["map", filters, approvalFlags],
    () => postQuery<MapPointArrays>({ type: "map", filters, approvalFlags }),
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

  // Layout is built once. Mounting with the popover open / filter changes /
  // SWR refetches would otherwise hand Plotly a "new" layout object with the
  // default zoom & center every render, snapping the camera back. `uirevision`
  // is the second line of defence: if anything does push a layout through,
  // Plotly preserves the user's pan/zoom because the revision string didn't
  // change.
  const layout = useMemo<Partial<Layout>>(() => {
    // Satellite/3D aren't Plotly built-ins (they would need a Mapbox token),
    // so we overlay Esri World Imagery as a raster layer on the white-bg base.
    const isSatellite = mapStyle === "satellite";
    // Switching styles forces Plotly to rebuild the map subplot, so uirevision
    // can't preserve the camera. Read the latest persisted view at that moment
    // so the new style mounts where the user last was, not at the initial view.
    const currentView = useAppStore.getState().mapView;
    const map: Record<string, unknown> = {
      style: isSatellite ? "white-bg" : mapStyle,
      zoom: currentView.zoom,
      center: currentView.center,
    };
    if (isSatellite) {
      map.layers = [
        {
          sourcetype: "raster",
          source: [
            "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
          ],
          below: "traces",
        },
      ];
    }
    return {
      map,
      height: 600,
      margin: { l: 0, r: 0, t: 0, b: 0 },
      paper_bgcolor: "rgba(0,0,0,0)",
      dragmode: "pan",
      font: { color: "#cdd6f4" },
      uirevision: "map-stable",
      // High-contrast selection outline that reads well on dark, light, and
      // satellite basemaps. Cyan + dashed stroke + translucent fill.
      newselection: {
        line: { color: "#22d3ee", width: 2.5, dash: "dash" },
        mode: "immediate",
      },
      activeselection: {
        fillcolor: "rgba(34, 211, 238, 0.18)",
        opacity: 1,
      },
    } as unknown as Partial<Layout>;
  }, [mapStyle]);

  function onRelayout(e?: Readonly<PlotRelayoutEvent>) {
    if (!e) return;
    // Plotly emits scattermap pan/zoom as dotted-path keys at the root
    // of the event object: "map.center" and "map.zoom". Other keys
    // (dragmode toggles, autosize) come through here too, so we only react
    // when the camera actually moved.
    const ev = e as unknown as Record<string, unknown>;
    const center = ev["map.center"] as
      | { lat: number; lon: number }
      | undefined;
    const zoom = ev["map.zoom"] as number | undefined;
    if (center == null && zoom == null) return;
    const current = useAppStore.getState().mapView;
    setMapView({
      zoom: zoom ?? current.zoom,
      center: center ?? current.center,
    });
    if (zoom != null) setLiveZoom(zoom);
  }

  const isSatelliteView = mapStyle === "satellite";
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  // Box/lasso selections land here as a *pending* set, displayed as blue pins
  // until the user confirms. Pending pins that overlap an already-selected
  // (green) pin are skipped so the green stays authoritative.
  const [pendingIds, setPendingIds] = useState<number[]>([]);
  const pendingIdSet = useMemo(() => {
    const s = new Set<number>();
    for (const id of pendingIds) if (!selectedIdSet.has(id)) s.add(id);
    return s;
  }, [pendingIds, selectedIdSet]);
  // In satellite mode points are fixed pixel-size by default, which looks
  // wrong as the user zooms out (huge dots covering whole cities). Scale them
  // with the camera: roughly linear above zoom 10, clamped so points stay
  // visible at world view and don't balloon at street level.
  const zoomScale = useMemo(() => {
    if (!isSatelliteView) return 1;
    return Math.max(0.25, Math.min(1.5, (liveZoom - 4) / 10));
  }, [liveZoom, isSatelliteView]);
  const traces = useMemo<PlotData[]>(() => {
    const hasPoints = points.count > 0;
    if (!hasPoints) {
      // Empty trace keeps the map subplot initialised so the basemap renders
      // immediately. Once data arrives this is replaced with the real trace.
      return [
        { type: "scattermap", mode: "markers", lat: [], lon: [] } as unknown as PlotData,
      ];
    }
    const mainOpacity = isSatelliteView ? 0.95 : 0.65;
    const main = {
      type: "scattermap",
      mode: "markers",
      lat: points.lat,
      lon: points.lon,
      customdata: points.id,
      hovertemplate: "Rating: %{marker.color}<br>Click for details<extra></extra>",
      marker: {
        size: isSatelliteView ? Math.max(2, Math.round(8 * zoomScale)) : 5,
        color: points.rating.map((r) => (r == null ? 0 : r)),
        colorscale: "Plasma",
        opacity: mainOpacity,
        showscale: true,
      },
      // Disable plotly's default "fade everything not in the box" behavior so
      // unselected pins stay fully visible during/after a box-select.
      selected: { marker: { opacity: mainOpacity } },
      unselected: { marker: { opacity: mainOpacity } },
    } as unknown as PlotData;

    // Selected pins (green) and pending pins (blue) each get their own
    // overlay trace, drawn above the main trace with a contrast halo.
    const selLat: number[] = [];
    const selLon: number[] = [];
    const selIds: number[] = [];
    const penLat: number[] = [];
    const penLon: number[] = [];
    const penIds: number[] = [];
    for (let i = 0; i < points.id.length; i++) {
      const id = points.id[i];
      if (selectedIdSet.has(id)) {
        selLat.push(points.lat[i]);
        selLon.push(points.lon[i]);
        selIds.push(id);
      } else if (pendingIdSet.has(id)) {
        penLat.push(points.lat[i]);
        penLon.push(points.lon[i]);
        penIds.push(id);
      }
    }

    const buildOverlay = (
      lats: number[],
      lons: number[],
      ids: number[],
      color: string,
      label: string,
    ): PlotData[] =>
      lats.length === 0
        ? []
        : [
            {
              type: "scattermap",
              mode: "markers",
              lat: lats,
              lon: lons,
              hoverinfo: "skip",
              marker: {
                size: isSatelliteView ? Math.max(6, Math.round(18 * zoomScale)) : 14,
                color: "#ffffff",
                opacity: 0.95,
              },
              showlegend: false,
              selected: { marker: { opacity: 0.95 } },
              unselected: { marker: { opacity: 0.95 } },
            } as unknown as PlotData,
            {
              type: "scattermap",
              mode: "markers",
              lat: lats,
              lon: lons,
              customdata: ids,
              hovertemplate: `${label}<br>Click for details<extra></extra>`,
              marker: {
                size: isSatelliteView ? Math.max(4, Math.round(12 * zoomScale)) : 9,
                color,
                opacity: 1,
              },
              name: label,
              showlegend: false,
              selected: { marker: { opacity: 1 } },
              unselected: { marker: { opacity: 1 } },
            } as unknown as PlotData,
          ];

    // Pending (blue) drawn first so confirmed (green) overlays it where both apply.
    const pendingTraces = buildOverlay(penLat, penLon, penIds, "#3b82f6", "Pending");
    const selectedTraces = buildOverlay(selLat, selLon, selIds, "#22c55e", "Selected");

    // Scattermap markers don't support a stroke. Against satellite imagery
    // the small dots blend into the terrain, so we draw a white halo trace
    // underneath to act as a contrast outline.
    if (!isSatelliteView) return [main, ...pendingTraces, ...selectedTraces];
    const halo = {
      type: "scattermap",
      mode: "markers",
      lat: points.lat,
      lon: points.lon,
      hoverinfo: "skip",
      marker: {
        size: Math.max(4, Math.round(12 * zoomScale)),
        color: "#ffffff",
        opacity: 0.85,
      },
      showlegend: false,
      selected: { marker: { opacity: 0.85 } },
      unselected: { marker: { opacity: 0.85 } },
    } as unknown as PlotData;
    return [halo, main, ...pendingTraces, ...selectedTraces];
  }, [points, isSatelliteView, selectedIdSet, pendingIdSet, zoomScale]);

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
    if (!ev?.points || ev.points.length === 0) {
      setPendingIds([]);
      return;
    }
    const set = new Set<number>();
    for (const p of ev.points) {
      const cd = (p as unknown as { customdata?: unknown }).customdata;
      const id =
        typeof cd === "number"
          ? cd
          : Array.isArray(cd)
            ? (cd[0] as number)
            : points.id[p.pointIndex as number];
      if (typeof id === "number") set.add(id);
    }
    setPendingIds(Array.from(set));
  }

  function confirmPending(mode: "add" | "replace") {
    if (pendingIds.length === 0) return;
    if (mode === "replace") {
      setSelectedIds(pendingIds);
    } else {
      const merged = Array.from(new Set([...selectedIds, ...pendingIds]));
      setSelectedIds(merged);
    }
    setPendingIds([]);
    clearPlotSelection();
  }

  function cancelPending() {
    setPendingIds([]);
    clearPlotSelection();
  }

  function clearPlotSelection() {
    const plot = plotDivRef.current?.querySelector(".js-plotly-plot") as
      | HTMLElement
      | null;
    if (!plot) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Plotly = (window as any).Plotly;
    if (!Plotly) return;
    try {
      Plotly.relayout(plot, { selections: [] });
    } catch {
      /* older plotly builds — ignore */
    }
  }

  async function onClick(ev: Readonly<PlotMouseEvent>) {
    const p = ev.points?.[0];
    if (!p) return;
    // Each trace carries its own `customdata` array indexed by pointIndex.
    // The selected-overlay trace and the main trace have different lengths,
    // so we must read from the trace that was actually clicked rather than
    // indexing into `points.id`.
    const cd = (p as unknown as { customdata?: unknown }).customdata;
    const idx = p.pointIndex as number;
    const id =
      typeof cd === "number"
        ? cd
        : Array.isArray(cd)
          ? (cd[0] as number)
          : points.id[idx];
    if (typeof id !== "number") return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rect = (ev.event as any)?.target?.getBoundingClientRect?.();
    const container = plotDivRef.current;
    const containerRect = container?.getBoundingClientRect();
    const rawX = rect && containerRect ? rect.left - containerRect.left + 12 : 20;
    const rawY = rect && containerRect ? rect.top - containerRect.top + 12 : 20;
    const maxX = (container?.clientWidth ?? 0) - 340;
    const maxY = (container?.clientHeight ?? 0) - 320;
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
  }

  function focusOnPopover() {
    const r = popover?.restaurant;
    if (!r || r.latitude == null || r.longitude == null) return;
    const plot = plotDivRef.current?.querySelector(".js-plotly-plot") as
      | HTMLElement
      | null;
    if (!plot) return;
    const center = { lat: r.latitude, lon: r.longitude };
    const zoom = 16;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).Plotly?.relayout(plot, {
      "map.center": center,
      "map.zoom": zoom,
    });
    setMapView({ zoom, center });
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
            {" · "}box/lasso to select, then confirm below. Hold space to pan.
          </span>
        </p>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md border border-border overflow-hidden">
            {MAP_STYLE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setMapStyle(opt.value as MapStyle)}
                className={
                  "px-2.5 py-1 text-xs transition-colors " +
                  (mapStyle === opt.value
                    ? "bg-primary text-primary-foreground"
                    : "bg-background text-muted-foreground hover:text-foreground hover:bg-muted")
                }
                aria-pressed={mapStyle === opt.value}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {selectedIds.length > 0 && (
            <Button variant="outline" size="sm" onClick={clearSelection}>
              Clear selection
            </Button>
          )}
        </div>
      </div>

      <div
        ref={plotDivRef}
        className="relative rounded-lg overflow-hidden border border-border"
      >
        <PlotlyChart
          data={traces}
          layout={layout}
          useResizeHandler
          style={{ width: "100%", height: "600px" }}
          config={{
            scrollZoom: true,
            displayModeBar: true,
            modeBarButtonsToAdd: ["select2d", "lasso2d"],
            modeBarButtonsToRemove: ["toggleHover"],
          }}
          onSelected={onSelected}
          onDeselect={(() => setPendingIds([])) as () => void}
          onClick={onClick}
          onRelayout={onRelayout}
        />
        {isLoading && (
          <ScanOverlay
            plotDivRef={plotDivRef}
            center={initialMapView.center}
          />
        )}
        {mapStyle === "satellite" && (
            <div className="absolute bottom-1 right-1 z-10 rounded bg-black/55 px-1.5 py-0.5 text-[10px] leading-none text-white/90">
              Tiles © Esri — World Imagery
            </div>
          )}
          {popover && (
            <div
              className="absolute z-20 w-80 max-h-[80%] overflow-y-auto rounded-md border border-border bg-card/95 backdrop-blur p-3 shadow-lg text-sm"
              style={{ left: popover.x, top: popover.y }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h4 className="font-semibold leading-tight truncate">
                    {popover.loading
                      ? "Loading…"
                      : popover.restaurant?.name ?? "Not found"}
                  </h4>
                  {popover.restaurant?.is_chain && (
                    <span className="mt-1 inline-block rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                      Chain
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setPopover(null)}
                  className="text-muted-foreground hover:text-foreground text-xs leading-none mt-0.5"
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>
              {popover.restaurant && (() => {
                const r = popover.restaurant;
                const locality = [r.city, r.province, r.postal_code]
                  .filter(Boolean)
                  .join(", ");
                const cats = (r.cat_list && r.cat_list.length > 0)
                  ? r.cat_list
                  : (r.category ? [r.category] : []);
                return (
                  <div className="mt-2 space-y-1.5 text-xs text-muted-foreground">
                    {r.address && (
                      <div className="text-foreground">{r.address}</div>
                    )}
                    {locality && <div>{locality}</div>}
                    <div>
                      Rating:{" "}
                      <span className="text-foreground">
                        {r.rating ?? "—"}
                      </span>
                      {r.ratings != null && (
                        <span> ({r.ratings.toLocaleString()} reviews)</span>
                      )}
                    </div>
                    {(r.price_bucket || r.price_range) && (
                      <div>
                        Price:{" "}
                        <span className="text-foreground">
                          {r.price_bucket ?? r.price_range}
                        </span>
                        {r.price_bucket && r.price_range && r.price_range !== r.price_bucket && (
                          <span> · {r.price_range}</span>
                        )}
                      </div>
                    )}
                    {r.phone && (
                      <div>
                        Phone:{" "}
                        <a
                          href={`tel:${r.phone}`}
                          className="text-foreground underline underline-offset-2"
                        >
                          {r.phone}
                        </a>
                      </div>
                    )}
                    {r.website && (
                      <div className="truncate">
                        <a
                          href={r.website}
                          target="_blank"
                          rel="noreferrer"
                          className="underline underline-offset-2"
                        >
                          {r.website}
                        </a>
                      </div>
                    )}
                    {r.link && (
                      <div className="truncate">
                        <a
                          href={r.link}
                          target="_blank"
                          rel="noreferrer"
                          className="underline underline-offset-2"
                        >
                          View on Google Maps
                        </a>
                      </div>
                    )}
                    {cats.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {cats.slice(0, 8).map((c) => (
                          <span
                            key={c}
                            className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-foreground"
                          >
                            {c}
                          </span>
                        ))}
                        {cats.length > 8 && (
                          <span className="text-[10px]">+{cats.length - 8}</span>
                        )}
                      </div>
                    )}
                    {(r.latitude != null && r.longitude != null) && (
                      <div className="pt-1 font-mono text-[10px]">
                        {r.latitude.toFixed(5)}, {r.longitude.toFixed(5)}
                      </div>
                    )}
                    {r.dataset && (
                      <div className="text-[10px]">Dataset: {r.dataset}</div>
                    )}
                  </div>
                );
              })()}
              {popover.restaurant && (
                <div className="mt-3 space-y-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full"
                    onClick={addPopoverToSelection}
                    disabled={selectedIds.includes(popover.restaurant.id)}
                  >
                    {selectedIds.includes(popover.restaurant.id)
                      ? "Added to Selections"
                      : "Add to selection"}
                  </Button>
                  {popover.restaurant.latitude != null &&
                    popover.restaurant.longitude != null && (
                      <button
                        type="button"
                        onClick={focusOnPopover}
                        className="block w-full text-center text-xs text-primary underline underline-offset-2 hover:opacity-80"
                      >
                        Focus
                      </button>
                    )}
                </div>
              )}
            </div>
          )}
      </div>

      {pendingIds.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/40 bg-primary/5 px-4 py-3">
          <div className="text-sm">
            <span className="font-medium text-foreground">
              {pendingIds.length.toLocaleString()} {pendingIds.length === 1 ? "lead" : "leads"}
            </span>
            <span className="text-muted-foreground"> in pending selection</span>
            {selectedIds.length > 0 && (
              <span className="text-muted-foreground">
                {" · "}
                {(() => {
                  const existing = new Set(selectedIds);
                  const newCount = pendingIds.filter((id) => !existing.has(id)).length;
                  return `${newCount.toLocaleString()} new, ${(pendingIds.length - newCount).toLocaleString()} already selected`;
                })()}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={cancelPending}>
              Cancel
            </Button>
            {selectedIds.length > 0 && (
              <Button variant="outline" size="sm" onClick={() => confirmPending("replace")}>
                Replace selection
              </Button>
            )}
            <Button size="sm" onClick={() => confirmPending("add")}>
              {selectedIds.length > 0 ? "Add to selection" : "Confirm selection"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
