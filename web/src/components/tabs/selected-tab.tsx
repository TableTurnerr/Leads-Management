"use client";

import { useState } from "react";
import { useAppStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { MetricCard } from "@/components/metric-card";
import { PlotlyChart } from "@/components/plotly-chart";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Download, Send } from "lucide-react";
import type { Layout, Data as PlotlyData } from "plotly.js";
import type { Restaurant } from "@/lib/types";
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
  const selection = useAppStore((s) => s.selection);
  const clearSelection = useAppStore((s) => s.clearSelection);
  const [sending, setSending] = useState(false);

  if (!selection.length) {
    return (
      <div className="rounded-lg border border-dashed border-border p-10 text-center text-muted-foreground">
        <p>No restaurants selected.</p>
        <p className="text-sm mt-1">
          Open the Map tab, click the box-select or lasso tool on the
          mapbox toolbar, and drag over the map.
        </p>
      </div>
    );
  }

  const ratings = selection.map((s) => s.rating).filter((v): v is number => v != null);
  const avg = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null;
  const totalReviews = selection.reduce((sum, s) => sum + (s.ratings ?? 0), 0);
  const cities = new Set(selection.map((s) => s.city).filter(Boolean)).size;

  const priceCounts = new Map<string, number>();
  for (const r of selection) {
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
          rows: selection.map((r) => ({
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
      toast.success(`Sent ${selection.length} restaurants to Sheets.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      toast.error(message);
    } finally {
      setSending(false);
    }
  }

  function downloadCsv() {
    const header = SHOW_COLS.map((c) => c.label).join(",");
    const body = selection
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
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">
          {selection.length} restaurants selected
        </h2>
        <div className="flex gap-2">
          <Button onClick={sendToSheets} disabled={sending}>
            <Send className="h-4 w-4 mr-1" />
            {sending ? "Sending…" : "Send to Sheets"}
          </Button>
          <Button variant="outline" onClick={downloadCsv}>
            <Download className="h-4 w-4 mr-1" />
            Download CSV
          </Button>
          <Button variant="ghost" onClick={clearSelection}>
            Clear selection
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground -mt-3">
        Make sure your Apps Script webhook URL is set in{" "}
        <Link href="/settings" className="underline underline-offset-2">
          Settings
        </Link>
        .
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard value={selection.length.toLocaleString()} label="Restaurants" />
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
              {SHOW_COLS.map((c) => (
                <TableHead key={c.key}>{c.label}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {selection.map((r) => (
              <TableRow key={r.id}>
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
