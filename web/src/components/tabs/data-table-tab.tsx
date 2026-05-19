"use client";

import { useState, useMemo } from "react";
import useSWR from "swr";
import { useAppStore } from "@/lib/store";
import { postQuery } from "@/lib/fetcher";
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
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import type { Restaurant } from "@/lib/types";

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
  const [sortCol, setSortCol] = useState<"rating" | "ratings" | "name">("rating");
  const [asc, setAsc] = useState(false);
  const [page, setPage] = useState(1);

  const { data, isLoading } = useSWR<{ rows: Restaurant[]; total: number }>(
    ["list", filters, sortCol, asc, page],
    () =>
      postQuery({
        type: "list",
        filters,
        sortCol,
        asc,
        page,
        pageSize: PAGE_SIZE,
      }),
    { revalidateOnFocus: false, keepPreviousData: true },
  );

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rows = useMemo(() => data?.rows ?? [], [data]);

  const csvHref = useMemo(() => {
    if (!rows.length) return null;
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
    return URL.createObjectURL(blob);
  }, [rows]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-2">
          <Label className="text-xs">Sort by</Label>
          <Select value={sortCol} onValueChange={(v) => setSortCol(v as typeof sortCol)}>
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
        {csvHref && (
          <a href={csvHref} download="filtered_restaurants.csv">
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-1" />
              Download page as CSV
            </Button>
          </a>
        )}
      </div>

      <p className="text-sm text-muted-foreground">
        {isLoading ? "Loading…" : `${total.toLocaleString()} rows`}
      </p>

      <div className="rounded-lg border border-border overflow-auto max-h-[600px]">
        <Table>
          <TableHeader className="sticky top-0 bg-card z-10">
            <TableRow>
              {SHOW_COLS.map((c) => (
                <TableHead key={c.key}>{c.label}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
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
                <TableCell colSpan={SHOW_COLS.length} className="text-center text-muted-foreground py-6">
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
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            <ChevronLeft className="h-4 w-4" /> Prev
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Next <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
