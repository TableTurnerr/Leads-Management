"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { useAppStore } from "@/lib/store";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DEFAULT_FILTERS,
  type FilterEnabled,
  type Filters,
  type RatingNullPolicy,
} from "@/lib/types";
import {
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  X,
  Settings2,
} from "lucide-react";
import { cn } from "@/lib/utils";

const swrFetcher = (url: string) => fetch(url).then((r) => r.json());

type Facets = {
  provinces: string[];
  priceBuckets: string[];
  topCategories: string[];
};

const PRICE_OPTIONS = ["$", "$$", "$$$", "$$$$", "Unknown"];

// At most two sections stay expanded at a time so the sidebar stays
// scannable — opening a third bumps the oldest. Order in the queue is
// insertion order; the first element is the next one to drop.
type SectionKey =
  | "search"
  | "location"
  | "categories"
  | "score"
  | "reviews"
  | "price"
  | "data"
  | "chain";

const MAX_OPEN_SECTIONS = 2;
const DEFAULT_OPEN_ORDER: SectionKey[] = ["search", "location"];

export function FiltersSidebar() {
  // `applied` is the store-backed filter set every tab reads via SWR keys.
  // `filters` below is a local draft — edits stage here until Apply pushes
  // them to the store, so no Supabase round-trips happen on each keystroke.
  const applied = useAppStore((s) => s.filters);
  const setStoreFilters = useAppStore((s) => s.setFilter);
  const setStoreEnabled = useAppStore((s) => s.setEnabled);
  const resetStoreFilters = useAppStore((s) => s.resetFilters);

  const [filters, setDraft] = useState<Filters>(applied);
  const setFilter = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));
  const setEnabled = <K extends keyof FilterEnabled>(key: K, value: boolean) =>
    setDraft((d) => ({ ...d, enabled: { ...d.enabled, [key]: value } }));

  // Pre-serialise applied once per render so the dirty check stays O(draft).
  const appliedJson = useMemo(() => JSON.stringify(applied), [applied]);
  const dirty = useMemo(
    () => JSON.stringify(filters) !== appliedJson,
    [filters, appliedJson],
  );

  function handleApply() {
    if (!dirty) return;
    // Replicate the draft into the store. setFilter is per-key so we walk
    // the keys; the enabled map is one key so it lands atomically.
    (Object.keys(filters) as (keyof Filters)[]).forEach((k) => {
      if (k === "enabled") return;
      setStoreFilters(k, filters[k]);
    });
    (Object.keys(filters.enabled) as (keyof FilterEnabled)[]).forEach((k) => {
      setStoreEnabled(k, filters.enabled[k]);
    });
  }

  function handleReset() {
    resetStoreFilters();
    setDraft(DEFAULT_FILTERS);
  }

  function handleDiscard() {
    // Revert the draft back to whatever was last applied.
    setDraft(applied);
  }

  const [openOrder, setOpenOrder] = useState<SectionKey[]>(DEFAULT_OPEN_ORDER);
  const isOpen = (k: SectionKey) => openOrder.includes(k);
  const toggleSection = (k: SectionKey) =>
    setOpenOrder((order) => {
      if (order.includes(k)) return order.filter((x) => x !== k);
      // Push to end. If we'd exceed the quota, drop the oldest.
      const next = [...order, k];
      return next.length > MAX_OPEN_SECTIONS
        ? next.slice(next.length - MAX_OPEN_SECTIONS)
        : next;
    });

  const appliedCount = useMemo(() => countApplied(applied), [applied]);
  const draftCount = useMemo(() => countApplied(filters), [filters]);
  const ignoredCount = useMemo(
    () =>
      Object.values(filters.enabled).filter((v) => v === false).length,
    [filters.enabled],
  );

  const { data: facets } = useSWR<Facets>("/api/facets", swrFetcher, {
    revalidateOnFocus: false,
    revalidateIfStale: false,
    dedupingInterval: 60_000,
  });
  // Cities depend on the *first* selected province; multi-province cities
  // would be a tail-end use case and would force a heavier RPC.
  const provinceForCities = filters.provinces[0] ?? null;
  const { data: cityData } = useSWR<{ cities: string[] }>(
    provinceForCities
      ? `/api/facets?province=${encodeURIComponent(provinceForCities)}`
      : null,
    swrFetcher,
    { revalidateOnFocus: false, dedupingInterval: 60_000 },
  );

  return (
    <aside className="w-80 shrink-0 border-r border-border bg-card/40 flex flex-col">
      <div className="px-4 h-14 border-b border-border flex items-center justify-between sticky top-0 bg-card/60 backdrop-blur z-10">
        <div className="flex items-center gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-foreground/80">
            Filters
          </h2>
          {draftCount > 0 && (
            <Badge
              variant="secondary"
              className="h-5 px-1.5 text-[10px] tabular-nums"
              title={
                dirty
                  ? `${draftCount} pending (Apply to query)`
                  : `${draftCount} applied`
              }
            >
              {draftCount}
            </Badge>
          )}
          {ignoredCount > 0 && (
            <Badge
              variant="outline"
              className="h-5 px-1.5 text-[10px] tabular-nums text-muted-foreground"
              title={`${ignoredCount} filter group(s) currently ignored`}
            >
              {ignoredCount} off
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          <ConditionsManager
            enabled={filters.enabled}
            setEnabled={setEnabled}
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReset}
            disabled={
              appliedCount === 0 && draftCount === 0 && ignoredCount === 0
            }
            className="h-7 text-xs"
          >
            Reset
          </Button>
        </div>
      </div>

      <div className="overflow-y-auto flex-1">
        <Section
          title="Search"
          isOpen={isOpen("search")}
          onToggle={() => toggleSection("search")}
          enabled={filters.enabled.search}
          onEnabledChange={(v) => setEnabled("search", v)}
          active={!!filters.search.trim()}
        >
          <Input
            placeholder="e.g. McDonald's"
            value={filters.search}
            onChange={(e) => setFilter("search", e.target.value)}
            disabled={!filters.enabled.search}
          />
        </Section>

        <Section
          title="Location"
          isOpen={isOpen("location")}
          onToggle={() => toggleSection("location")}
          enabled={filters.enabled.provinces || filters.enabled.city}
          onEnabledChange={(v) => {
            setEnabled("provinces", v);
            setEnabled("city", v);
          }}
          active={filters.provinces.length > 0 || !!filters.city}
        >
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs">State / Province</Label>
                {filters.provinces.length > 0 && (
                  <button
                    onClick={() => {
                      setFilter("provinces", []);
                      setFilter("city", null);
                    }}
                    className="text-[10px] text-muted-foreground hover:text-foreground"
                  >
                    Clear ({filters.provinces.length})
                  </button>
                )}
              </div>
              <CheckboxList
                values={facets?.provinces ?? []}
                selected={filters.provinces}
                onToggle={(v) => {
                  const next = filters.provinces.includes(v)
                    ? filters.provinces.filter((x) => x !== v)
                    : [...filters.provinces, v];
                  setFilter("provinces", next);
                  if (filters.city && !next.includes(provinceForCities ?? "")) {
                    setFilter("city", null);
                  }
                }}
                disabled={!filters.enabled.provinces}
                searchPlaceholder="Filter states…"
                maxHeight={220}
              />
            </div>

            <div className="grid gap-1.5">
              <Label className="text-xs">City</Label>
              <SearchableSelect
                value={filters.city}
                onChange={(v) => setFilter("city", v)}
                options={cityData?.cities ?? []}
                placeholder={provinceForCities ? "All" : "Pick a state first"}
                searchPlaceholder="Search cities…"
                clearLabel="All"
                disabled={!filters.enabled.city || !provinceForCities}
              />
            </div>
          </div>
        </Section>

        <Section
          title="Categories"
          isOpen={isOpen("categories")}
          onToggle={() => toggleSection("categories")}
          enabled={
            filters.enabled.categories || filters.enabled.excludeCategories
          }
          onEnabledChange={(v) => {
            setEnabled("categories", v);
            setEnabled("excludeCategories", v);
          }}
          active={
            filters.categories.length > 0 ||
            filters.excludeCategories.length > 0
          }
        >
          <div className="grid gap-3">
            <CategoryPicker
              label="Include any of"
              accent="success"
              all={facets?.topCategories ?? []}
              selected={filters.categories}
              other={filters.excludeCategories}
              disabled={!filters.enabled.categories}
              onChange={(next) => setFilter("categories", next)}
            />
            <CategoryPicker
              label="Exclude any of"
              accent="danger"
              all={facets?.topCategories ?? []}
              selected={filters.excludeCategories}
              other={filters.categories}
              disabled={!filters.enabled.excludeCategories}
              onChange={(next) => setFilter("excludeCategories", next)}
            />
          </div>
        </Section>

        <Section
          title="Score"
          isOpen={isOpen("score")}
          onToggle={() => toggleSection("score")}
          enabled={filters.enabled.score}
          onEnabledChange={(v) => setEnabled("score", v)}
          active={
            filters.scoreMin !== DEFAULT_FILTERS.scoreMin ||
            filters.scoreMax !== DEFAULT_FILTERS.scoreMax ||
            filters.ratingNullPolicy !== DEFAULT_FILTERS.ratingNullPolicy
          }
        >
          <div className="grid gap-3">
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Range</Label>
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
                disabled={!filters.enabled.score}
              />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Restaurants with no rating</Label>
              <NullPolicyToggle
                value={filters.ratingNullPolicy}
                onChange={(v) => setFilter("ratingNullPolicy", v)}
                disabled={!filters.enabled.score}
              />
            </div>
          </div>
        </Section>

        <Section
          title="Reviews"
          isOpen={isOpen("reviews")}
          onToggle={() => toggleSection("reviews")}
          enabled={filters.enabled.reviews}
          onEnabledChange={(v) => setEnabled("reviews", v)}
          active={filters.minReviews > 0 || filters.maxReviews != null}
        >
          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-1.5">
              <Label className="text-xs">Min</Label>
              <Input
                type="number"
                min={0}
                step={10}
                value={filters.minReviews}
                onChange={(e) =>
                  setFilter(
                    "minReviews",
                    Math.max(0, Number(e.target.value) || 0),
                  )
                }
                disabled={!filters.enabled.reviews}
              />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Max</Label>
              <Input
                type="number"
                min={0}
                step={100}
                placeholder="∞"
                value={filters.maxReviews ?? ""}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === "") return setFilter("maxReviews", null);
                  const n = Number(raw);
                  setFilter("maxReviews", Number.isFinite(n) ? n : null);
                }}
                disabled={!filters.enabled.reviews}
              />
            </div>
          </div>
        </Section>

        <Section
          title="Price"
          isOpen={isOpen("price")}
          onToggle={() => toggleSection("price")}
          enabled={filters.enabled.priceBuckets}
          onEnabledChange={(v) => setEnabled("priceBuckets", v)}
          active={filters.priceBuckets.length > 0}
        >
          <div className="flex flex-wrap gap-1.5">
            {PRICE_OPTIONS.map((p) => {
              const checked = filters.priceBuckets.includes(p);
              return (
                <button
                  key={p}
                  onClick={() => {
                    const next = checked
                      ? filters.priceBuckets.filter((x) => x !== p)
                      : [...filters.priceBuckets, p];
                    setFilter("priceBuckets", next);
                  }}
                  disabled={!filters.enabled.priceBuckets}
                  className={cn(
                    "px-2.5 py-1 rounded-md border text-xs font-medium transition-colors",
                    "disabled:opacity-50 disabled:cursor-not-allowed",
                    checked
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border bg-card/30 hover:bg-card/60",
                  )}
                >
                  {p}
                </button>
              );
            })}
          </div>
        </Section>

        <Section
          title="Data quality"
          isOpen={isOpen("data")}
          onToggle={() => toggleSection("data")}
          enabled={
            filters.enabled.hasPhone ||
            filters.enabled.hasWebsite ||
            filters.enabled.hasAddress ||
            filters.enabled.hasCoordinates
          }
          onEnabledChange={(v) => {
            setEnabled("hasPhone", v);
            setEnabled("hasWebsite", v);
            setEnabled("hasAddress", v);
            setEnabled("hasCoordinates", v);
          }}
          active={
            filters.hasPhone != null ||
            filters.hasWebsite != null ||
            filters.hasAddress != null ||
            filters.hasCoordinates != null
          }
        >
          <div className="grid gap-2">
            <TriState
              label="Has phone"
              value={filters.hasPhone}
              onChange={(v) => setFilter("hasPhone", v)}
              disabled={!filters.enabled.hasPhone}
            />
            <TriState
              label="Has website"
              value={filters.hasWebsite}
              onChange={(v) => setFilter("hasWebsite", v)}
              disabled={!filters.enabled.hasWebsite}
            />
            <TriState
              label="Has address"
              value={filters.hasAddress}
              onChange={(v) => setFilter("hasAddress", v)}
              disabled={!filters.enabled.hasAddress}
            />
            <TriState
              label="Has coordinates"
              value={filters.hasCoordinates}
              onChange={(v) => setFilter("hasCoordinates", v)}
              disabled={!filters.enabled.hasCoordinates}
            />
          </div>
        </Section>

        <Section
          title="Chain"
          isOpen={isOpen("chain")}
          onToggle={() => toggleSection("chain")}
          enabled={filters.enabled.isChain}
          onEnabledChange={(v) => setEnabled("isChain", v)}
          active={filters.isChainOnly != null}
          last
        >
          <TriState
            label="Fast-food chain"
            value={filters.isChainOnly}
            onChange={(v) => setFilter("isChainOnly", v)}
            disabled={!filters.enabled.isChain}
          />
        </Section>
      </div>

      {/* Apply / Discard footer. Stays visible so the user can always see
          whether the panel matches what's actually being queried. */}
      <div className="border-t border-border bg-card/60 backdrop-blur px-3 py-2.5 flex items-center gap-2 sticky bottom-0">
        <div className="flex-1 text-[11px] leading-tight">
          {dirty ? (
            <span className="text-foreground/90">
              {draftCount === appliedCount
                ? "Changes pending"
                : `${draftCount} pending · ${appliedCount} applied`}
            </span>
          ) : (
            <span className="text-muted-foreground">
              Up to date · {appliedCount} applied
            </span>
          )}
        </div>
        {dirty && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDiscard}
            className="h-7 text-xs"
          >
            Discard
          </Button>
        )}
        <Button
          size="sm"
          onClick={handleApply}
          disabled={!dirty}
          className="h-7 text-xs gap-1"
        >
          Apply
          {dirty && (
            <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground/80" />
          )}
        </Button>
      </div>
    </aside>
  );
}

// --- subcomponents -----------------------------------------------------------

function Section({
  title,
  isOpen,
  onToggle,
  enabled,
  onEnabledChange,
  active,
  last,
  children,
}: {
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  enabled: boolean;
  onEnabledChange: (v: boolean) => void;
  active: boolean;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn(!last && "border-b border-border/60")}>
      <div className="flex items-center px-4 h-9">
        <button
          onClick={onToggle}
          className="flex-1 flex items-center gap-1.5 text-left group"
        >
          {isOpen ? (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          )}
          <span
            className={cn(
              "text-xs font-semibold uppercase tracking-wider",
              enabled ? "text-foreground/90" : "text-muted-foreground/60",
            )}
          >
            {title}
          </span>
          {active && enabled && (
            <span className="ml-1 h-1.5 w-1.5 rounded-full bg-primary" />
          )}
        </button>
        <button
          onClick={() => onEnabledChange(!enabled)}
          aria-label={enabled ? `Ignore ${title}` : `Enable ${title}`}
          title={
            enabled
              ? `Click to ignore ${title.toLowerCase()} (keeps values)`
              : `Click to apply ${title.toLowerCase()}`
          }
          className={cn(
            "h-6 w-6 grid place-content-center rounded-md text-muted-foreground hover:text-foreground transition-colors",
            !enabled && "text-muted-foreground/50",
          )}
        >
          {enabled ? (
            <Eye className="h-3.5 w-3.5" />
          ) : (
            <EyeOff className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
      {isOpen && (
        <div
          className={cn(
            "px-4 pb-4 pt-1",
            !enabled && "opacity-50 pointer-events-none",
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}

function TriState({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: boolean | null;
  onChange: (v: boolean | null) => void;
  disabled?: boolean;
}) {
  const opts: { v: boolean | null; lbl: string }[] = [
    { v: null,  lbl: "Any" },
    { v: true,  lbl: "Yes" },
    { v: false, lbl: "No"  },
  ];
  return (
    <div className="flex items-center justify-between">
      <Label className="text-xs">{label}</Label>
      <div className="flex rounded-md border border-border overflow-hidden">
        {opts.map((o) => (
          <button
            key={String(o.v)}
            onClick={() => onChange(o.v)}
            disabled={disabled}
            className={cn(
              "px-2 py-1 text-[11px] transition-colors",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              value === o.v
                ? "bg-primary text-primary-foreground"
                : "bg-card/30 hover:bg-card/60 text-foreground/80",
            )}
          >
            {o.lbl}
          </button>
        ))}
      </div>
    </div>
  );
}

function NullPolicyToggle({
  value,
  onChange,
  disabled,
}: {
  value: RatingNullPolicy;
  onChange: (v: RatingNullPolicy) => void;
  disabled?: boolean;
}) {
  const opts: { v: RatingNullPolicy; lbl: string; hint: string }[] = [
    { v: "include", lbl: "Include", hint: "Keep null-rated rows regardless of range" },
    { v: "exclude", lbl: "Exclude", hint: "Drop rows with no rating" },
    { v: "only",    lbl: "Only",    hint: "Show only rows with no rating" },
  ];
  return (
    <div className="flex rounded-md border border-border overflow-hidden">
      {opts.map((o) => (
        <button
          key={o.v}
          onClick={() => onChange(o.v)}
          disabled={disabled}
          title={o.hint}
          className={cn(
            "flex-1 px-2 py-1 text-[11px] transition-colors",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            value === o.v
              ? "bg-primary text-primary-foreground"
              : "bg-card/30 hover:bg-card/60 text-foreground/80",
          )}
        >
          {o.lbl}
        </button>
      ))}
    </div>
  );
}

function CheckboxList({
  values,
  selected,
  onToggle,
  disabled,
  searchPlaceholder,
  maxHeight = 200,
}: {
  values: string[];
  selected: string[];
  onToggle: (v: string) => void;
  disabled?: boolean;
  searchPlaceholder?: string;
  maxHeight?: number;
}) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    if (!q.trim()) return values;
    const needle = q.toLowerCase();
    return values.filter((v) => v.toLowerCase().includes(needle));
  }, [values, q]);
  return (
    <div className="rounded-md border border-border bg-card/30">
      <Input
        placeholder={searchPlaceholder}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        disabled={disabled}
        className="h-7 text-xs border-0 border-b border-border rounded-none focus-visible:ring-0"
      />
      <div
        className="overflow-y-auto py-1"
        style={{ maxHeight }}
      >
        {filtered.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">
            No matches.
          </p>
        )}
        {filtered.map((v) => {
          const checked = selected.includes(v);
          return (
            <button
              key={v}
              onClick={() => onToggle(v)}
              disabled={disabled}
              className={cn(
                "w-full flex items-center gap-2 px-2 py-1 text-xs text-left hover:bg-card/60 transition-colors",
                "disabled:cursor-not-allowed",
              )}
            >
              <Checkbox
                checked={checked}
                disabled={disabled}
                tabIndex={-1}
                className="pointer-events-none"
              />
              <span className="truncate">{v}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CategoryPicker({
  label,
  accent,
  all,
  selected,
  other,
  disabled,
  onChange,
}: {
  label: string;
  accent: "success" | "danger";
  all: string[];
  selected: string[];
  other: string[];
  disabled?: boolean;
  onChange: (next: string[]) => void;
}) {
  const available = useMemo(
    () => all.filter((c) => !selected.includes(c) && !other.includes(c)),
    [all, selected, other],
  );
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs">{label}</Label>
      <SearchableSelect
        value={null}
        onChange={(v) => {
          if (v == null) return;
          onChange([...selected, v]);
        }}
        options={available}
        placeholder={
          available.length === 0 ? "No more options" : "Add a category…"
        }
        searchPlaceholder="Search categories…"
        disabled={disabled || available.length === 0}
      />
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((c) => (
            <Badge
              key={c}
              variant="secondary"
              className={cn(
                "gap-1 pr-1",
                accent === "danger" &&
                  "bg-destructive/10 text-destructive-foreground/90 border-destructive/20",
              )}
            >
              {c}
              <button
                onClick={() => onChange(selected.filter((x) => x !== c))}
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
  );
}

function ConditionsManager({
  enabled,
  setEnabled,
}: {
  enabled: FilterEnabled;
  setEnabled: <K extends keyof FilterEnabled>(key: K, value: boolean) => void;
}) {
  const groups: { key: keyof FilterEnabled; label: string }[] = [
    { key: "search",            label: "Search"            },
    { key: "provinces",         label: "State/Province"    },
    { key: "city",              label: "City"              },
    { key: "categories",        label: "Include categories" },
    { key: "excludeCategories", label: "Exclude categories" },
    { key: "score",             label: "Score"             },
    { key: "reviews",           label: "Reviews"           },
    { key: "priceBuckets",      label: "Price"             },
    { key: "isChain",           label: "Chain"             },
    { key: "hasPhone",          label: "Has phone"         },
    { key: "hasWebsite",        label: "Has website"       },
    { key: "hasAddress",        label: "Has address"       },
    { key: "hasCoordinates",    label: "Has coordinates"   },
  ];
  const ignoredCount = groups.filter((g) => !enabled[g.key]).length;
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1"
            title="Manage which conditions are applied"
          >
            <Settings2 className="h-3.5 w-3.5" />
            {ignoredCount > 0 && (
              <span className="tabular-nums">{ignoredCount}</span>
            )}
          </Button>
        }
      />
      <PopoverContent align="end" className="w-64 p-2.5">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold">Active conditions</p>
          <div className="flex gap-1">
            <button
              className="text-[10px] text-muted-foreground hover:text-foreground"
              onClick={() =>
                groups.forEach((g) => setEnabled(g.key, true))
              }
            >
              All
            </button>
            <span className="text-[10px] text-muted-foreground">·</span>
            <button
              className="text-[10px] text-muted-foreground hover:text-foreground"
              onClick={() =>
                groups.forEach((g) => setEnabled(g.key, false))
              }
            >
              None
            </button>
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground mb-2">
          Disabling a condition keeps its values but ignores them when querying.
        </p>
        <div className="grid gap-1 max-h-[60vh] overflow-y-auto">
          {groups.map((g) => (
            <label
              key={g.key}
              className="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-card/60 cursor-pointer"
            >
              <Checkbox
                checked={enabled[g.key]}
                onCheckedChange={(c) => setEnabled(g.key, c === true)}
              />
              <span className="text-xs">{g.label}</span>
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// Counts only filter groups that are *both* enabled AND have a non-default
// value. The "ignored" badge tracks the disabled set separately.
function countApplied(f: Filters): number {
  let n = 0;
  const e = f.enabled;
  if (e.search            && f.search.trim())                    n++;
  if (e.provinces         && f.provinces.length)                 n++;
  if (e.city              && f.city)                             n++;
  if (e.categories        && f.categories.length)                n++;
  if (e.excludeCategories && f.excludeCategories.length)         n++;
  if (e.score && (
      f.scoreMin !== DEFAULT_FILTERS.scoreMin ||
      f.scoreMax !== DEFAULT_FILTERS.scoreMax ||
      f.ratingNullPolicy !== DEFAULT_FILTERS.ratingNullPolicy
  )) n++;
  if (e.reviews && (f.minReviews > 0 || f.maxReviews != null))   n++;
  if (e.priceBuckets      && f.priceBuckets.length)              n++;
  if (e.isChain           && f.isChainOnly != null)              n++;
  if (e.hasPhone          && f.hasPhone != null)                 n++;
  if (e.hasWebsite        && f.hasWebsite != null)               n++;
  if (e.hasAddress        && f.hasAddress != null)               n++;
  if (e.hasCoordinates    && f.hasCoordinates != null)           n++;
  return n;
}

