"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { useAppStore } from "@/lib/store";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { DEFAULT_FILTERS } from "@/lib/types";
import { X } from "lucide-react";

const swrFetcher = (url: string) => fetch(url).then((r) => r.json());

type Facets = {
  provinces: string[];
  priceBuckets: string[];
  topCategories: string[];
};

const PRICE_OPTIONS = ["$", "$$", "$$$", "$$$$", "Unknown"];

export function FiltersSidebar() {
  const filters = useAppStore((s) => s.filters);
  const setFilter = useAppStore((s) => s.setFilter);
  const resetFilters = useAppStore((s) => s.resetFilters);

  // Local input state for search so we can debounce before broadcasting to
  // the store (each store update kicks off every tab's SWR refetch).
  const [searchInput, setSearchInput] = useState(filters.search);
  useEffect(() => {
    if (searchInput === filters.search) return;
    const t = setTimeout(() => setFilter("search", searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput, filters.search, setFilter]);

  // Reset clears both the store and the input together so we never have to
  // sync the input from inside an effect.
  function handleReset() {
    setSearchInput("");
    resetFilters();
  }

  const appliedCount = useMemo(() => {
    let n = 0;
    if (filters.search.trim()) n++;
    if (filters.province) n++;
    if (filters.city) n++;
    if (filters.categories.length) n++;
    if (filters.scoreMin !== DEFAULT_FILTERS.scoreMin) n++;
    if (filters.scoreMax !== DEFAULT_FILTERS.scoreMax) n++;
    if (filters.minReviews !== DEFAULT_FILTERS.minReviews) n++;
    if (filters.priceBucket) n++;
    if (filters.isChainOnly) n++;
    return n;
  }, [filters]);

  // Facets are immutable for the lifetime of the data, so dedupe forever.
  const { data: facets } = useSWR<Facets>("/api/facets", swrFetcher, {
    revalidateOnFocus: false,
    revalidateIfStale: false,
    dedupingInterval: 60_000,
  });
  const { data: cityData } = useSWR<{ cities: string[] }>(
    filters.province ? `/api/facets?province=${encodeURIComponent(filters.province)}` : null,
    swrFetcher,
    { revalidateOnFocus: false, dedupingInterval: 60_000 },
  );

  return (
    <aside className="w-72 shrink-0 border-r border-border bg-card/40 flex flex-col">
      <div className="px-4 h-14 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-foreground/80">
            Filters
          </h2>
          {appliedCount > 0 && (
            <Badge variant="secondary" className="h-5 px-1.5 text-[10px] tabular-nums">
              {appliedCount}
            </Badge>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleReset}
          disabled={appliedCount === 0}
          className="h-7 text-xs"
        >
          Reset
        </Button>
      </div>

      <div className="p-4 space-y-4 overflow-y-auto flex-1">
        <div className="grid gap-2">
          <Label className="text-xs">Search by name</Label>
          <Input
            placeholder="e.g. McDonald's"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>

        <Separator className="my-1" />

        <div className="grid gap-2">
          <Label className="text-xs">State / Province</Label>
          <Select
            value={filters.province ?? "__all__"}
            onValueChange={(v) => {
              setFilter("province", v === "__all__" ? null : v);
              setFilter("city", null);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All</SelectItem>
              {(facets?.provinces ?? []).map((p) => (
                <SelectItem key={p} value={p}>{p}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-2">
          <Label className="text-xs">City</Label>
          <Select
            value={filters.city ?? "__all__"}
            onValueChange={(v) => setFilter("city", v === "__all__" ? null : v)}
            disabled={!filters.province}
          >
            <SelectTrigger>
              <SelectValue placeholder={filters.province ? "All" : "Pick a state first"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All</SelectItem>
              {(cityData?.cities ?? []).map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Separator className="my-1" />

        <div className="grid gap-2">
          <Label className="text-xs">Category</Label>
          <Select
            value=""
            onValueChange={(v) => {
              if (!v || filters.categories.includes(v)) return;
              setFilter("categories", [...filters.categories, v]);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Add a category…" />
            </SelectTrigger>
            <SelectContent>
              {(facets?.topCategories ?? [])
                .filter((c) => !filters.categories.includes(c))
                .map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
            </SelectContent>
          </Select>
          {filters.categories.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {filters.categories.map((c) => (
                <Badge key={c} variant="secondary" className="gap-1 pr-1">
                  {c}
                  <button
                    onClick={() =>
                      setFilter(
                        "categories",
                        filters.categories.filter((x) => x !== c),
                      )
                    }
                    aria-label={`Remove ${c}`}
                    className="hover:text-foreground/80"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </div>

        <Separator className="my-1" />

        <div className="grid gap-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Score range</Label>
            <span className="text-xs text-muted-foreground tabular-nums">
              {filters.scoreMin.toFixed(1)} – {filters.scoreMax.toFixed(1)}
            </span>
          </div>
          <Slider
            min={0}
            max={5}
            step={0.1}
            value={[filters.scoreMin, filters.scoreMax]}
            onValueChange={(v) => {
              const arr = Array.isArray(v) ? v : [v, v];
              setFilter("scoreMin", arr[0]);
              setFilter("scoreMax", arr[1] ?? arr[0]);
            }}
          />
        </div>

        <div className="grid gap-2">
          <Label className="text-xs">Min review count</Label>
          <Input
            type="number"
            min={0}
            step={10}
            value={filters.minReviews}
            onChange={(e) =>
              setFilter("minReviews", Math.max(0, Number(e.target.value) || 0))
            }
          />
        </div>

        <Separator className="my-1" />

        <div className="grid gap-2">
          <Label className="text-xs">Price range</Label>
          <Select
            value={filters.priceBucket ?? "__all__"}
            onValueChange={(v) => setFilter("priceBucket", v === "__all__" ? null : v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All</SelectItem>
              {PRICE_OPTIONS.map((p) => (
                <SelectItem key={p} value={p}>{p}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2 pt-1">
          <Checkbox
            id="chain-only"
            checked={filters.isChainOnly === true}
            onCheckedChange={(c) =>
              setFilter("isChainOnly", c === true ? true : null)
            }
          />
          <Label htmlFor="chain-only" className="text-xs cursor-pointer">
            Fast-food chains only
          </Label>
        </div>
      </div>
    </aside>
  );
}
