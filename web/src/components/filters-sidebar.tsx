"use client";

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

  const { data: facets } = useSWR<Facets>("/api/facets", swrFetcher);
  const { data: cityData } = useSWR<{ cities: string[] }>(
    filters.province ? `/api/facets?province=${encodeURIComponent(filters.province)}` : null,
    swrFetcher,
  );

  return (
    <aside className="w-72 shrink-0 border-r border-border bg-card/40 flex flex-col">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide">Filters</h2>
        <Button variant="ghost" size="sm" onClick={resetFilters} className="h-7 text-xs">
          Reset
        </Button>
      </div>

      <div className="p-4 space-y-5 overflow-y-auto flex-1">
        <div className="grid gap-2">
          <Label className="text-xs">Search by name</Label>
          <Input
            placeholder="e.g. McDonald's"
            value={filters.search}
            onChange={(e) => setFilter("search", e.target.value)}
          />
        </div>

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

        <div className="flex items-center gap-2 pt-2">
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
