"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { useAppStore } from "@/lib/store";
import { postQuery } from "@/lib/fetcher";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MetricCard } from "@/components/metric-card";
import { PlotlyChart } from "@/components/plotly-chart";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Download, Send, ClipboardCheck, FilterX } from "lucide-react";
import type { Layout, Data as PlotlyData } from "plotly.js";
import type { Restaurant } from "@/lib/types";
import { APPROVAL_STATUS_LABELS } from "@/lib/types";
import {
  getApprovalStatuses,
  approvalStatusToneClass,
  rowMatchesApprovalStatuses,
} from "@/lib/approval-status";
import { logLeadAction } from "@/lib/log-action";
import { cn } from "@/lib/utils";
import Link from "next/link";

const BASE_LAYOUT: Partial<Layout> = {
  paper_bgcolor: "rgba(0,0,0,0)",
  plot_bgcolor: "rgba(0,0,0,0)",
  font: { color: "#cdd6f4" },
  xaxis: { gridcolor: "#313244" },
  yaxis: { gridcolor: "#313244" },
};

const SHOW_COLS: { key: keyof Restaurant; label: string }[] = [
  { key: "name", label: "Name" },
  { key: "address", label: "Address" },
  { key: "city", label: "City" },
  { key: "province", label: "State" },
  { key: "category", label: "Category" },
  { key: "rating", label: "Rating" },
  { key: "ratings", label: "Reviews" },
  { key: "price_bucket", label: "Price" },
  { key: "website", label: "Website" },
  { key: "phone", label: "Phone" },
];

export function SelectedTab() {
  const selectedIds = useAppStore((s) => s.selectedIds);
  const clearSelection = useAppStore((s) => s.clearSelection);
  const startApproval = useAppStore((s) => s.startApproval);
  const approvalStatuses = useAppStore((s) => s.filters.approvalStatuses);
  const approvalStatusesEnabled = useAppStore((s) => s.filters.enabled.approvalStatuses);
  const approvedIds = useAppStore((s) => s.approvedIds);
  const rejectedIds = useAppStore((s) => s.rejectedIds);
  const skippedIds = useAppStore((s) => s.skippedIds);
  const downloadedIds = useAppStore((s) => s.downloadedIds);
  const sentToSheetsIds = useAppStore((s) => s.sentToSheetsIds);
  const markDownloaded = useAppStore((s) => s.markDownloaded);
  const markSentToSheets = useAppStore((s) => s.markSentToSheets);
  const showAllSelected = useAppStore((s) => s.showAllSelected);
  const setShowAllSelected = useAppStore((s) => s.setShowAllSelected);
  const [sending, setSending] = useState(false);

  const flags = useMemo(
    () => ({ approvedIds, rejectedIds, skippedIds, downloadedIds, sentToSheetsIds }),
    [approvedIds, rejectedIds, skippedIds, downloadedIds, sentToSheetsIds],
  );

  const idsKey = useMemo(
    () => (selectedIds.length ? [...selectedIds].sort((a, b) => a - b).join(",") : null),
    [selectedIds],
  );

  const { data, isLoading } = useSWR<{ rows: Restaurant[] }>(
    idsKey ? ["by_ids", idsKey] : null,
    () => postQuery<{ rows: Restaurant[] }>({ type: "by_ids", ids: selectedIds }),
    { revalidateOnFocus: false, keepPreviousData: true },
  );

  const allRows = useMemo(() => data?.rows ?? [], [data]);
  const filteredRows = useMemo(() => {
    if (!approvalStatusesEnabled || approvalStatuses.length === 0) return allRows;
    return allRows.filter((r) => rowMatchesApprovalStatuses(r.id, approvalStatuses, flags));
  }, [allRows, approvalStatuses, approvalStatusesEnabled, flags]);
  const rows = showAllSelected ? allRows : filteredRows;
  const hiddenByFilters = allRows.length > 0 && filteredRows.length === 0 && !showAllSelected;

  // Snapshot the active selection to the audit log once it settles. We key on
  // idsKey so re-renders that don't change the selection don't re-log, and we
  // debounce so dragging-a-lasso doesn't fire a row per intermediate state.
  const lastLoggedSelection = useRef<string | null>(null);
  useEffect(() => {
    if (!idsKey || idsKey === lastLoggedSelection.current) return;
    const handle = window.setTimeout(() => {
      lastLoggedSelection.current = idsKey;
      void logLeadAction({
        action: "selection_snapshot",
        source: "selected_tab",
        restaurantIds: selectedIds,
      });
    }, 1500);
    return () => window.clearTimeout(handle);
  }, [idsKey, selectedIds]);

  if (!selectedIds.length) {
    return (
      <div className="rounded-lg border border-dashed border-border p-10 text-center text-muted-foreground">
        <p>No restaurants selected.</p>
        <p className="text-sm mt-1">
          Open the Map tab, click the box-select or lasso tool on the
          map toolbar, and drag over the map.
        </p>
      </div>
    );
  }

  if (!isLoading && hiddenByFilters) {
    return (
      <div className="rounded-lg border border-dashed border-border p-10 text-center text-muted-foreground space-y-4">
        <FilterX className="mx-auto h-8 w-8 opacity-40" />
        <div>
          <p className="font-medium text-foreground">
            {selectedIds.length} selection{selectedIds.length !== 1 ? "s" : ""} hidden by filters
          </p>
          <p className="text-sm mt-1">
            Your active approval-status filter is excluding all selected leads from this view.
          </p>
        </div>
        <div className="flex justify-center gap-3">
          <Button onClick={() => setShowAllSelected(true)}>
            <FilterX className="h-4 w-4 mr-1" />
            Show all {selectedIds.length} leads
          </Button>
          <Button variant="outline" onClick={clearSelection}>
            Clear selection
          </Button>
        </div>
      </div>
    );
  }

  if (isLoading && !data) {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Skeleton className="h-7 w-64" />
          <div className="flex gap-2">
            <Skeleton className="h-9 w-36" />
            <Skeleton className="h-9 w-36" />
            <Skeleton className="h-9 w-32" />
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  const ratings = rows.map((s) => s.rating).filter((v): v is number => v != null);
  const avg = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null;
  const totalReviews = rows.reduce((sum, s) => sum + (s.ratings ?? 0), 0);
  const cities = new Set(rows.map((s) => s.city).filter(Boolean)).size;

  const priceCounts = new Map<string, number>();
  for (const r of rows) {
    const p = r.price_bucket ?? "Unknown";
    if (p === "Unknown") continue;
    priceCounts.set(p, (priceCounts.get(p) ?? 0) + 1);
  }
  const priceData = Array.from(priceCounts.entries());

  async function sendToSheets() {
    setSending(true);
    try {
      const res = await fetch("/api/send-to-sheets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          rows: rows.map((r) => ({
            id: r.id,
            name: r.name,
            address: r.address,
            city: r.city,
            province: r.province,
            country: r.country,
            category: r.category,
            rating: r.rating,
            ratings: r.ratings,
            price_bucket: r.price_bucket,
            website: r.website,
            phone: r.phone,
            latitude: r.latitude,
            longitude: r.longitude,
          })),
        }),
      });
      const out = await res.json();
      if (!res.ok) throw new Error(out?.error ?? `Sheets webhook failed (${res.status})`);
      markSentToSheets(rows.map((r) => r.id));
      toast.success(`Sent ${rows.length} restaurants to Sheets.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      toast.error(message);
    } finally {
      setSending(false);
    }
  }

  function downloadCsv() {
    const header = SHOW_COLS.map((c) => c.label).join(",");
    const body = rows
      .map((r) =>
        SHOW_COLS.map((c) => {
          const v = r[c.key];
          if (v == null) return "";
          const s = String(v).replace(/"/g, '""');
          return /[,"\n]/.test(s) ? `"${s}"` : s;
        }).join(","),
      )
      .join("\n");
    const blob = new Blob([`${header}\n${body}`], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "selected_restaurants.csv";
    a.click();
    URL.revokeObjectURL(url);
    markDownloaded(rows.map((r) => r.id));
    void logLeadAction({
      action: "csv_download",
      source: "selected_tab",
      restaurantIds: rows.map((r) => r.id),
      rowCount: rows.length,
      metadata: { filename: "selected_restaurants.csv" },
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">
          {selectedIds.length} restaurants selected
        </h2>
        <div className="flex gap-2">
          <Button
            onClick={() => startApproval(selectedIds)}
            disabled={!selectedIds.length}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <ClipboardCheck className="h-4 w-4 mr-1" />
            Approval Mode
          </Button>
          <span title="Work in Progress" className="cursor-not-allowed">
            <Button disabled>
              <Send className="h-4 w-4 mr-1" />
              Send to Sheets
            </Button>
          </span>
          <Button variant="outline" onClick={downloadCsv} disabled={!rows.length}>
            <Download className="h-4 w-4 mr-1" />
            Download CSV
          </Button>
          <Button variant="ghost" onClick={clearSelection}>
            Clear selection
          </Button>
        </div>
      </div>
      {showAllSelected && (
        <div className="flex items-center gap-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-300">
          <FilterX className="h-4 w-4 shrink-0" />
          <span className="flex-1">
            Showing all selections — approval-status filter is bypassed.
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-amber-300 hover:text-amber-100 hover:bg-amber-500/20"
            onClick={() => setShowAllSelected(false)}
          >
            Restore filter
          </Button>
        </div>
      )}
      <p className="text-xs text-muted-foreground -mt-3">
        Make sure your Apps Script webhook URL is set in{" "}
        <Link href="/settings" className="underline underline-offset-2">
          Settings
        </Link>
        .
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard value={rows.length.toLocaleString()} label="Restaurants" />
        <MetricCard value={avg != null ? avg.toFixed(2) : "—"} label="Avg Rating" />
        <MetricCard value={cities.toLocaleString()} label="Cities" />
        <MetricCard value={totalReviews.toLocaleString()} label="Total Reviews" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-lg border border-border bg-card/40 p-4">
          <h3 className="text-sm font-semibold mb-3">Score Distribution</h3>
          <PlotlyChart
            data={[
              {
                type: "histogram",
                x: ratings,
                xbins: { size: (5 - 0) / 20 },
                marker: { color: "#cba6f7" },
              } as unknown as PlotlyData,
            ]}
            layout={{
              ...BASE_LAYOUT,
              height: 220,
              margin: { l: 40, r: 10, t: 10, b: 30 },
              showlegend: false,
            }}
            useResizeHandler
            style={{ width: "100%", height: "220px" }}
            config={{ displayModeBar: false }}
          />
        </div>
        <div className="rounded-lg border border-border bg-card/40 p-4">
          <h3 className="text-sm font-semibold mb-3">Price Range</h3>
          {priceData.length > 0 ? (
            <PlotlyChart
              data={[
                {
                  type: "pie",
                  hole: 0.5,
                  labels: priceData.map(([k]) => k),
                  values: priceData.map(([, v]) => v),
                  marker: {
                    colors: ["#cba6f7", "#b4befe", "#89b4fa", "#74c7ec"],
                  },
                },
              ]}
              layout={{
                ...BASE_LAYOUT,
                height: 220,
                margin: { l: 10, r: 10, t: 10, b: 10 },
              }}
              useResizeHandler
              style={{ width: "100%", height: "220px" }}
              config={{ displayModeBar: false }}
            />
          ) : (
            <p className="text-sm text-muted-foreground">No price data.</p>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-border overflow-auto max-h-[400px]">
        <Table>
          <TableHeader className="sticky top-0 bg-card z-10">
            <TableRow>
              <TableHead>Status</TableHead>
              {SHOW_COLS.map((c) => (
                <TableHead key={c.key}>{c.label}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell>
                  <ApprovalStatusBadges id={r.id} flags={flags} />
                </TableCell>
                {SHOW_COLS.map((c) => {
                  const v = r[c.key];
                  if (c.key === "website" && v) {
                    return (
                      <TableCell key={c.key} className="max-w-[200px] truncate">
                        <a
                          href={String(v)}
                          target="_blank"
                          rel="noreferrer"
                          className="underline underline-offset-2"
                        >
                          {String(v)}
                        </a>
                      </TableCell>
                    );
                  }
                  return <TableCell key={c.key}>{v == null ? "—" : String(v)}</TableCell>;
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function ApprovalStatusBadges({
  id,
  flags,
}: {
  id: number;
  flags: Parameters<typeof getApprovalStatuses>[1];
}) {
  const statuses = getApprovalStatuses(id, flags);
  return (
    <div className="flex flex-wrap gap-1">
      {statuses.map((s) => (
        <Badge
          key={s}
          className={cn(
            "text-[10px] px-1.5 py-0.5 font-medium",
            approvalStatusToneClass(s),
          )}
        >
          {APPROVAL_STATUS_LABELS[s]}
        </Badge>
      ))}
    </div>
  );
}
