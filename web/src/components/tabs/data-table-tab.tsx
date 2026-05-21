"use client";

import { useState, useMemo } from "react";
import useSWR from "swr";
import { useAppStore, type TableSortCol } from "@/lib/store";
import { postQuery } from "@/lib/fetcher";
import { useApprovalFlags } from "@/lib/use-approval-flags";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Download, Eye, FileSpreadsheet } from "lucide-react";
import type { Restaurant } from "@/lib/types";
import { APPROVAL_STATUS_LABELS } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import {
  getApprovalStatuses,
  approvalStatusToneClass,
  rowMatchesApprovalStatuses,
  type ApprovalStatusFlags,
} from "@/lib/approval-status";
import { cn } from "@/lib/utils";
import { logLeadAction } from "@/lib/log-action";

const PAGE_SIZE = 200;
const SHOW_COLS = [
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
] as const;

export function DataTableTab() {
  const filters = useAppStore((s) => s.filters);
  const sortCol = useAppStore((s) => s.tableSortCol);
  const asc = useAppStore((s) => s.tableAsc);
  const page = useAppStore((s) => s.tablePage);
  const setSortCol = useAppStore((s) => s.setTableSortCol);
  const setAsc = useAppStore((s) => s.setTableAsc);
  const setPage = useAppStore((s) => s.setTablePage);
  const includeApprovalStatuses = useAppStore((s) => s.filters.includeApprovalStatuses);
  const excludeApprovalStatuses = useAppStore((s) => s.filters.excludeApprovalStatuses);
  const approvalStatusesEnabled = useAppStore((s) => s.filters.enabled.approvalStatuses);
  const approvedIds = useAppStore((s) => s.approvedIds);
  const rejectedIds = useAppStore((s) => s.rejectedIds);
  const skippedIds = useAppStore((s) => s.skippedIds);
  const downloadedIds = useAppStore((s) => s.downloadedIds);
  const sentToSheetsIds = useAppStore((s) => s.sentToSheetsIds);
  const flags: ApprovalStatusFlags = useMemo(
    () => ({ approvedIds, rejectedIds, skippedIds, downloadedIds, sentToSheetsIds }),
    [approvedIds, rejectedIds, skippedIds, downloadedIds, sentToSheetsIds],
  );

  const approvalFlags = useApprovalFlags();
  const { data, isLoading } = useSWR<{ rows: Restaurant[]; total: number }>(
    ["list", filters, sortCol, asc, page, approvalFlags],
    () =>
      postQuery({
        type: "list",
        filters,
        sortCol,
        asc,
        page,
        pageSize: PAGE_SIZE,
        approvalFlags,
      }),
    { revalidateOnFocus: false, keepPreviousData: true },
  );

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const allRows = useMemo(() => data?.rows ?? [], [data]);
  // Lead-status filter is client-only (state lives in the browser), so it
  // narrows the visible page after the server query. Page totals still
  // reflect the unfiltered server result.
  const rows = useMemo(() => {
    if (!approvalStatusesEnabled) return allRows;
    if (includeApprovalStatuses.length === 0 && excludeApprovalStatuses.length === 0) return allRows;
    return allRows.filter((r) =>
      rowMatchesApprovalStatuses(r.id, includeApprovalStatuses, excludeApprovalStatuses, flags),
    );
  }, [allRows, includeApprovalStatuses, excludeApprovalStatuses, approvalStatusesEnabled, flags]);
  const initialLoading = isLoading && !data;

  if (initialLoading) {
    return <DataTableSkeleton />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-2">
          <Label className="text-xs">Sort by</Label>
          <Select value={sortCol} onValueChange={(v) => setSortCol(v as TableSortCol)}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="rating">Rating</SelectItem>
              <SelectItem value="ratings">Reviews</SelectItem>
              <SelectItem value="name">Name</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2 mb-2">
          <Checkbox
            id="asc"
            checked={asc}
            onCheckedChange={(c) => setAsc(c === true)}
          />
          <Label htmlFor="asc" className="text-xs cursor-pointer">Ascending</Label>
        </div>
        <div className="flex-1" />
        <ExportMenu rows={rows} total={total} />
      </div>

      <p className="text-sm text-muted-foreground">
        {isLoading ? "Loading…" : `${total.toLocaleString()} rows match`}
      </p>

      <div className="rounded-lg border border-border overflow-auto max-h-[600px]">
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
                  const v = r[c.key as keyof Restaurant];
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
                  return (
                    <TableCell key={c.key}>
                      {v == null ? "—" : String(v)}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
            {!rows.length && !isLoading && (
              <TableRow>
                <TableCell colSpan={SHOW_COLS.length + 1} className="text-center text-muted-foreground py-6">
                  No matches.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          Page {page} of {totalPages.toLocaleString()}
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage(Math.max(1, page - 1))}
          >
            <ChevronLeft className="h-4 w-4" /> Prev
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage(Math.min(totalPages, page + 1))}
          >
            Next <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// Three export paths share the same Supabase filters but differ in volume:
//   1. The current visible page — instant, built from `rows` already in
//      memory. Keeps the original "download what you see" affordance.
//   2. Preview — fetches the first N (≤1000) matching rows server-side and
//      renders them in a dialog before the user commits. Useful before a
//      large export to sanity-check the filter is doing what they want.
//   3. Full download — streams the entire matching set from
//      /api/export-csv, which keyset-paginates the underlying RPC.
function ExportMenu({
  rows,
  total,
}: {
  rows: Restaurant[];
  total: number;
}) {
  const filters = useAppStore((s) => s.filters);
  const markDownloaded = useAppStore((s) => s.markDownloaded);
  const approvalFlags = useApprovalFlags();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewSize, setPreviewSize] = useState(200);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewText, setPreviewText] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  function downloadVisiblePage() {
    if (!rows.length) return;
    const header = SHOW_COLS.map((c) => c.label).join(",");
    const body = rows
      .map((r) =>
        SHOW_COLS.map((c) => {
          const v = r[c.key as keyof Restaurant];
          if (v == null) return "";
          const s = String(v).replace(/"/g, '""');
          return /[,"\n]/.test(s) ? `"${s}"` : s;
        }).join(","),
      )
      .join("\n");
    const blob = new Blob([`${header}\n${body}`], { type: "text/csv" });
    triggerDownload(blob, "restaurants_page.csv");
    markDownloaded(rows.map((r) => r.id));
    void logLeadAction({
      action: "csv_download",
      source: "table_visible_page",
      restaurantIds: rows.map((r) => r.id),
      rowCount: rows.length,
      filters,
      metadata: { filename: "restaurants_page.csv" },
    });
  }

  async function openPreview() {
    setPreviewOpen(true);
    setPreviewLoading(true);
    setPreviewText(null);
    try {
      const res = await fetch("/api/export-csv", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ filters, mode: "preview", previewSize, approvalFlags }),
      });
      if (!res.ok) throw new Error(`Preview failed (${res.status})`);
      const text = await res.text();
      setPreviewText(text);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Preview failed";
      toast.error(msg);
      setPreviewText(null);
    } finally {
      setPreviewLoading(false);
    }
  }

  async function downloadFull() {
    setDownloading(true);
    try {
      const res = await fetch("/api/export-csv", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ filters, mode: "full", approvalFlags }),
      });
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      // Browsers buffer the full response into a Blob; for 100k rows this
      // is ~30MB which is fine. If we ever need true streaming-to-disk
      // we'd need the File System Access API.
      const blob = await res.blob();
      const name =
        res.headers
          .get("content-disposition")
          ?.match(/filename="?([^"]+)"?/)?.[1] ?? "restaurants.csv";
      triggerDownload(blob, name);
      // The export RPC writes `id` as the first column, so we can recover
      // every downloaded row's ID without a second round trip.
      const csvText = await blob.text();
      const ids = extractIdsFromCsv(csvText);
      if (ids.length) markDownloaded(ids);
      toast.success("Download started.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Export failed";
      toast.error(msg);
    } finally {
      setDownloading(false);
    }
  }

  function downloadPreviewBlob() {
    if (!previewText) return;
    const blob = new Blob([previewText], { type: "text/csv" });
    triggerDownload(blob, `restaurants_preview_${previewSize}.csv`);
    const ids = extractIdsFromCsv(previewText);
    if (ids.length) markDownloaded(ids);
  }

  return (
    <>
      <Popover>
        <PopoverTrigger
          render={
            <Button variant="outline" size="sm" className="gap-1.5">
              <Download className="h-4 w-4" />
              Export
            </Button>
          }
        />
        <PopoverContent align="end" className="w-72 p-2">
          <button
            onClick={downloadVisiblePage}
            disabled={!rows.length}
            className="w-full text-left rounded-md px-2.5 py-2 hover:bg-card/60 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="flex items-center gap-2 text-sm font-medium">
              <FileSpreadsheet className="h-4 w-4" />
              Current page
              <span className="ml-auto text-[10px] tabular-nums text-muted-foreground">
                {rows.length}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Just the {rows.length} rows you can see.
            </p>
          </button>

          <button
            onClick={openPreview}
            disabled={total === 0}
            className="w-full text-left rounded-md px-2.5 py-2 hover:bg-card/60 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="flex items-center gap-2 text-sm font-medium">
              <Eye className="h-4 w-4" />
              Preview
              <span className="ml-auto text-[10px] tabular-nums text-muted-foreground">
                {previewSize}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Sanity-check the top {previewSize} before exporting.
            </p>
          </button>

          <div className="px-2.5 py-1">
            <Label className="text-[10px] text-muted-foreground">
              Preview size
            </Label>
            <Select
              value={String(previewSize)}
              onValueChange={(v) => setPreviewSize(Number(v))}
            >
              <SelectTrigger className="h-7 text-xs mt-0.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[50, 100, 200, 500, 1000].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n} rows
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <button
            onClick={downloadFull}
            disabled={total === 0 || downloading}
            className="w-full text-left rounded-md px-2.5 py-2 hover:bg-card/60 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="flex items-center gap-2 text-sm font-medium">
              <Download className="h-4 w-4" />
              {downloading ? "Downloading…" : "Download all matching"}
              <span className="ml-auto text-[10px] tabular-nums text-muted-foreground">
                {total.toLocaleString()}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Streams every row matching your filters.
            </p>
          </button>
        </PopoverContent>
      </Popover>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-4xl sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>CSV preview — top {previewSize}</DialogTitle>
            <DialogDescription>
              First {previewSize} rows of {total.toLocaleString()} matching
              your current filters. Download to get all rows.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border border-border bg-card/30 max-h-[60vh] overflow-auto">
            {previewLoading ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 10 }).map((_, i) => (
                  <Skeleton key={i} className="h-4 w-full" />
                ))}
              </div>
            ) : previewText ? (
              <PreviewTable text={previewText} />
            ) : (
              <p className="p-6 text-center text-sm text-muted-foreground">
                Preview unavailable.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={downloadPreviewBlob}
              disabled={!previewText}
            >
              Save preview
            </Button>
            <Button onClick={downloadFull} disabled={downloading}>
              {downloading
                ? "Downloading…"
                : `Download all ${total.toLocaleString()}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Renders the first ~100 CSV lines as a table so the user can eyeball
// column values. Anything beyond that just bloats the dialog without
// changing the verdict.
function PreviewTable({ text }: { text: string }) {
  const { headers, rows } = useMemo(() => parseCsvHead(text, 100), [text]);
  if (!headers.length) {
    return <p className="p-4 text-sm text-muted-foreground">Empty result.</p>;
  }
  return (
    <Table>
      <TableHeader className="sticky top-0 bg-card z-10">
        <TableRow>
          {headers.map((h) => (
            <TableHead key={h}>{h}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r, i) => (
          <TableRow key={i}>
            {r.map((c, j) => (
              <TableCell key={j} className="text-xs max-w-[240px] truncate">
                {c}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// Minimal CSV parser — handles double-quoted fields including embedded ""
// and commas. We control the encoder so we don't need to worry about
// exotic edge cases the browser might encounter.
function parseCsvHead(text: string, maxRows: number) {
  const headers: string[] = [];
  const rows: string[][] = [];
  let pos = 0;
  let line = 0;
  let cur: string[] = [];
  let cell = "";
  let inQ = false;
  while (pos < text.length && line <= maxRows) {
    const ch = text[pos];
    if (inQ) {
      if (ch === '"') {
        if (text[pos + 1] === '"') {
          cell += '"';
          pos += 2;
          continue;
        }
        inQ = false;
        pos++;
        continue;
      }
      cell += ch;
      pos++;
      continue;
    }
    if (ch === '"') {
      inQ = true;
      pos++;
      continue;
    }
    if (ch === ",") {
      cur.push(cell);
      cell = "";
      pos++;
      continue;
    }
    if (ch === "\n" || ch === "\r") {
      cur.push(cell);
      if (line === 0) headers.push(...cur);
      else rows.push(cur);
      cur = [];
      cell = "";
      line++;
      // Skip \r\n pair
      if (ch === "\r" && text[pos + 1] === "\n") pos++;
      pos++;
      continue;
    }
    cell += ch;
    pos++;
  }
  // Final cell on the last (possibly unterminated) line
  if (cell.length > 0 || cur.length > 0) {
    cur.push(cell);
    if (line === 0) headers.push(...cur);
    else rows.push(cur);
  }
  return { headers, rows };
}

function ApprovalStatusBadges({
  id,
  flags,
}: {
  id: number;
  flags: ApprovalStatusFlags;
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

// Pulls the leading integer off every non-header line of the CSV. The export
// route always emits `id` as the first column and IDs never need quoting,
// so a per-line regex is enough and avoids parsing the rest of the row.
function extractIdsFromCsv(text: string): number[] {
  const out: number[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const m = /^(\d+),/.exec(line);
    if (m) out.push(Number(m[1]));
  }
  return out;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke after a tick so Chrome on slow disks still gets the bytes.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function DataTableSkeleton() {
  return (
    <div className="space-y-4" aria-hidden>
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-2">
          <Skeleton className="h-3 w-12" />
          <Skeleton className="h-8 w-40" />
        </div>
        <Skeleton className="h-4 w-24 mb-2" />
        <div className="flex-1" />
        <Skeleton className="h-8 w-44" />
      </div>
      <Skeleton className="h-4 w-32" />
      <div className="rounded-lg border border-border overflow-hidden">
        <div className="flex gap-4 px-4 py-2.5 bg-card border-b border-border">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-3 flex-1 min-w-16" />
          ))}
        </div>
        <div className="divide-y divide-border">
          {Array.from({ length: 12 }).map((_, r) => (
            <div key={r} className="flex gap-4 px-4 py-3">
              {Array.from({ length: 8 }).map((_, c) => (
                <Skeleton key={c} className="h-3.5 flex-1 min-w-16" />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-28" />
        <div className="flex gap-2">
          <Skeleton className="h-7 w-20" />
          <Skeleton className="h-7 w-20" />
        </div>
      </div>
    </div>
  );
}
