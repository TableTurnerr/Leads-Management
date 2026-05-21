"use client";

import { useEffect, useState } from "react";
import useSWR, { mutate as globalMutate } from "swr";
import { toast } from "sonner";
import {
  Bookmark,
  BookmarkPlus,
  Globe2,
  Lock,
  Trash2,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  DEFAULT_ENABLED,
  DEFAULT_FILTERS,
  type FilterEnabled,
  type Filters,
} from "@/lib/types";

type SavedFilter = {
  id: string;
  name: string;
  scope: "private" | "team";
  filters: Filters;
  user_id: string;
  created_at: string;
};

type ListResponse = {
  items?: SavedFilter[];
  currentUserId?: string;
  error?: string;
};

const SAVED_FILTERS_KEY = "/api/saved-filters";

const fetcher = async (url: string): Promise<ListResponse> => {
  const res = await fetch(url);
  const json = (await res.json().catch(() => ({}))) as ListResponse;
  if (!res.ok) throw new Error(json.error ?? `Request failed: ${res.status}`);
  return json;
};

export function SavedFiltersMenu({
  currentFilters,
  onLoad,
}: {
  currentFilters: Filters;
  onLoad: (filters: Filters) => void;
}) {
  const [saveOpen, setSaveOpen] = useState(false);
  const [loadOpen, setLoadOpen] = useState(false);

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setSaveOpen(true)}
        className="h-7 text-xs gap-1 px-2 flex-1 justify-center border border-border/60"
        title="Save current filters"
      >
        <BookmarkPlus className="h-3.5 w-3.5" />
        Save Filter
      </Button>

      <Button
        variant="ghost"
        size="sm"
        onClick={() => setLoadOpen(true)}
        className="h-7 text-xs gap-1 px-2 flex-1 justify-center border border-border/60"
        title="Load a saved filter"
      >
        <Bookmark className="h-3.5 w-3.5" />
        Load Filter
      </Button>

      <SaveFilterDialog
        open={saveOpen}
        onOpenChange={setSaveOpen}
        currentFilters={currentFilters}
      />

      <LoadFilterDialog
        open={loadOpen}
        onOpenChange={setLoadOpen}
        onLoad={(f) => {
          onLoad(f);
          setLoadOpen(false);
        }}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Save filter dialog — save as new OR replace an existing owned filter
// ---------------------------------------------------------------------------

function SaveFilterDialog({
  open,
  onOpenChange,
  currentFilters,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  currentFilters: Filters;
}) {
  const [name, setName] = useState("");
  const [scope, setScope] = useState<"private" | "team">("private");
  const [replaceTarget, setReplaceTarget] = useState<SavedFilter | null>(null);
  const [saving, setSaving] = useState(false);

  const { data } = useSWR<ListResponse>(SAVED_FILTERS_KEY, fetcher, {
    revalidateOnFocus: false,
  });
  const items = data?.items ?? [];
  const currentUserId = data?.currentUserId;
  const myItems = items.filter((x) => x.user_id === currentUserId);

  // Radix only fires onOpenChange on internal close interactions, so a parent
  // that flips `open` back to true via setState won't trigger a reset. Watch
  // the prop directly so each fresh open starts with a clean slate.
  useEffect(() => {
    if (open) {
      setName("");
      setScope("private");
      setReplaceTarget(null);
    }
  }, [open]);

  function handleOpenChange(v: boolean) {
    onOpenChange(v);
  }

  function selectReplace(item: SavedFilter) {
    if (replaceTarget?.id === item.id) {
      setReplaceTarget(null);
    } else {
      setReplaceTarget(item);
      setName(item.name);
      setScope(item.scope);
    }
  }

  async function handleSave() {
    if (replaceTarget) {
      await handleUpdate(replaceTarget);
    } else {
      await handleSaveNew();
    }
  }

  async function handleSaveNew() {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Give the filter a name.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(SAVED_FILTERS_KEY, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: trimmed, scope, filters: currentFilters }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(json.error ?? `Save failed (${res.status})`);
        return;
      }
      toast.success(
        scope === "team" ? `Saved "${trimmed}" for the team.` : `Saved "${trimmed}".`,
      );
      await globalMutate(SAVED_FILTERS_KEY);
      onOpenChange(false);
    } catch (err) {
      toast.error(`Save failed: ${err instanceof Error ? err.message : "unknown error"}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(target: SavedFilter) {
    setSaving(true);
    try {
      const res = await fetch(`${SAVED_FILTERS_KEY}/${target.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ filters: currentFilters }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(json.error ?? `Update failed (${res.status})`);
        return;
      }
      toast.success(`Updated "${target.name}".`);
      await globalMutate(SAVED_FILTERS_KEY);
      onOpenChange(false);
    } catch (err) {
      toast.error(`Update failed: ${err instanceof Error ? err.message : "unknown error"}`);
    } finally {
      setSaving(false);
    }
  }

  const canSave = replaceTarget ? true : !!name.trim();

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Save filter</DialogTitle>
          <DialogDescription>
            Store the current filter set so you (or your team) can re-apply it
            later.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-1">
          {/* Save as new */}
          <div className={cn("grid gap-3", replaceTarget && "opacity-40 pointer-events-none")}>
            <div className="grid gap-1.5">
              <Label htmlFor="saved-filter-name" className="text-xs">
                Name
              </Label>
              <Input
                id="saved-filter-name"
                autoFocus={!replaceTarget}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. NYC pizza ≥ 4.0"
                maxLength={120}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !saving && !replaceTarget) {
                    e.preventDefault();
                    void handleSave();
                  }
                }}
              />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Visibility</Label>
              <div className="grid grid-cols-2 gap-2">
                <ScopeOption
                  active={scope === "private"}
                  onClick={() => setScope("private")}
                  icon={<Lock className="h-3.5 w-3.5" />}
                  title="Private"
                  hint="Only you can see it"
                />
                <ScopeOption
                  active={scope === "team"}
                  onClick={() => setScope("team")}
                  icon={<Globe2 className="h-3.5 w-3.5" />}
                  title="For team"
                  hint="Visible to everyone"
                />
              </div>
            </div>
          </div>

          {/* Replace existing */}
          {myItems.length > 0 && (
            <div className="grid gap-1.5">
              <div className="flex items-center gap-2">
                <div className="h-px flex-1 bg-border/60" />
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  or replace existing
                </span>
                <div className="h-px flex-1 bg-border/60" />
              </div>
              <div className="max-h-44 overflow-y-auto rounded-md border border-border/60 divide-y divide-border/40">
                {myItems.map((item) => {
                  const selected = replaceTarget?.id === item.id;
                  const chips = summarizeFilters(normalizeFilters(item.filters));
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => selectReplace(item)}
                      className={cn(
                        "w-full text-left px-3 py-2 transition-colors",
                        selected
                          ? "bg-primary/10 border-l-2 border-l-primary"
                          : "hover:bg-card/60",
                      )}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <RefreshCw
                          className={cn(
                            "h-3 w-3 shrink-0 transition-colors",
                            selected ? "text-primary" : "text-muted-foreground",
                          )}
                        />
                        <span className="text-xs font-medium truncate min-w-0">{item.name}</span>
                        <ScopePill scope={item.scope} />
                      </div>
                      {chips.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1 pl-5">
                          {chips.map((c, i) => (
                            <span
                              key={`${c.kind}-${i}-${c.label}`}
                              className={cn(
                                "text-[10px] rounded px-1.5 py-0.5 border",
                                chipToneClass(c.kind),
                              )}
                            >
                              {c.label}
                            </span>
                          ))}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
              {replaceTarget && (
                <p className="text-[11px] text-muted-foreground">
                  Current filters will overwrite{" "}
                  <span className="font-medium text-foreground">{replaceTarget.name}</span>.{" "}
                  <button
                    type="button"
                    className="underline hover:text-foreground"
                    onClick={() => setReplaceTarget(null)}
                  >
                    Cancel
                  </button>
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !canSave}>
            {saving && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
            {replaceTarget ? "Update" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Load filter dialog — shows all saved filters with filter summaries
// ---------------------------------------------------------------------------

function LoadFilterDialog({
  open,
  onOpenChange,
  onLoad,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onLoad: (filters: Filters) => void;
}) {
  const { data, error, isLoading } = useSWR<ListResponse>(
    open ? SAVED_FILTERS_KEY : null,
    fetcher,
    { revalidateOnFocus: false },
  );

  const items = data?.items ?? [];
  const currentUserId = data?.currentUserId;
  const privateItems = items.filter((x) => x.scope === "private");
  const teamItems = items.filter((x) => x.scope === "team");

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete saved filter "${name}"?`)) return;
    const res = await fetch(`${SAVED_FILTERS_KEY}/${id}`, { method: "DELETE" });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      toast.error(json.error ?? `Delete failed (${res.status})`);
      return;
    }
    toast.success(`Deleted "${name}".`);
    await globalMutate(SAVED_FILTERS_KEY);
  }

  const [query, setQuery] = useState("");

  useEffect(() => {
    if (open) setQuery("");
  }, [open]);

  const q = query.trim().toLowerCase();
  const matches = (it: SavedFilter) =>
    !q || it.name.toLowerCase().includes(q);
  const filteredPrivate = privateItems.filter(matches);
  const filteredTeam = teamItems.filter(matches);
  const filteredCount = filteredPrivate.length + filteredTeam.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Load filter</DialogTitle>
          <DialogDescription>
            Select a saved filter set to apply.
          </DialogDescription>
        </DialogHeader>

        {!isLoading && !error && items.length > 0 && (
          <div className="relative">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${items.length} saved filter${items.length === 1 ? "" : "s"}…`}
              className="h-8 text-xs"
              autoFocus
            />
          </div>
        )}

        <div className="min-h-[6rem]">
          {isLoading && (
            <div className="flex items-center gap-2 p-4 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading…
            </div>
          )}
          {error && (
            <div className="p-4 text-xs text-destructive">
              {error instanceof Error ? error.message : "Failed to load."}
            </div>
          )}
          {!isLoading && !error && items.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-1 py-8 text-center">
              <Bookmark className="h-6 w-6 text-muted-foreground/40" />
              <p className="text-xs text-muted-foreground">No saved filters yet.</p>
              <p className="text-[11px] text-muted-foreground/70">
                Apply some filters, then click Save.
              </p>
            </div>
          )}
          {!isLoading && !error && items.length > 0 && filteredCount === 0 && (
            <div className="py-6 text-center text-xs text-muted-foreground">
              No filters match {`"${query}"`}.
            </div>
          )}
          {!isLoading && !error && filteredCount > 0 && (
            <div className="max-h-[60vh] overflow-y-auto space-y-4 pr-1">
              {filteredPrivate.length > 0 && (
                <FilterSection title="Private" count={filteredPrivate.length}>
                  {filteredPrivate.map((it) => (
                    <FilterRow
                      key={it.id}
                      item={it}
                      ownedByMe={it.user_id === currentUserId}
                      onPick={() => onLoad(normalizeFilters(it.filters))}
                      onDelete={() => handleDelete(it.id, it.name)}
                    />
                  ))}
                </FilterSection>
              )}
              {filteredTeam.length > 0 && (
                <FilterSection title="Team" count={filteredTeam.length}>
                  {filteredTeam.map((it) => (
                    <FilterRow
                      key={it.id}
                      item={it}
                      ownedByMe={it.user_id === currentUserId}
                      onPick={() => onLoad(normalizeFilters(it.filters))}
                      onDelete={() => handleDelete(it.id, it.name)}
                    />
                  ))}
                </FilterSection>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FilterSection({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 px-1 pb-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </span>
        <span className="text-[10px] text-muted-foreground/60">
          {count}
        </span>
      </div>
      <div className="rounded-lg border border-border/60 overflow-hidden divide-y divide-border/40 bg-card/20">
        {children}
      </div>
    </div>
  );
}

function FilterRow({
  item,
  ownedByMe,
  onPick,
  onDelete,
}: {
  item: SavedFilter;
  ownedByMe: boolean;
  onPick: () => void;
  onDelete: () => void;
}) {
  const chips = summarizeFilters(normalizeFilters(item.filters));

  return (
    <div className="group relative flex items-stretch hover:bg-card/60 transition-colors">
      <button
        onClick={onPick}
        className="flex-1 min-w-0 text-left px-3 py-2.5 pr-10"
        title="Load this filter set"
      >
        <div className="flex items-center gap-2 mb-1.5 min-w-0">
          <span className="text-xs font-medium truncate min-w-0">{item.name}</span>
          <ScopePill scope={item.scope} />
        </div>
        {chips.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {chips.map((c, i) => (
              <span
                key={`${c.kind}-${i}-${c.label}`}
                className={cn(
                  "text-[10px] rounded px-1.5 py-0.5 border",
                  chipToneClass(c.kind),
                )}
              >
                {c.label}
              </span>
            ))}
          </div>
        ) : (
          <span className="text-[10px] text-muted-foreground/60 italic">
            No active filters
          </span>
        )}
      </button>
      {ownedByMe && (
        <button
          onClick={onDelete}
          aria-label={`Delete ${item.name}`}
          title="Delete"
          className="absolute right-2 top-2 text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 p-1.5 rounded transition-colors opacity-60 group-hover:opacity-100"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

function ScopeOption({
  active,
  onClick,
  icon,
  title,
  hint,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md border px-3 py-2 text-left transition-colors",
        active
          ? "border-primary bg-primary/10"
          : "border-border bg-card/30 hover:bg-card/60",
      )}
    >
      <div className="flex items-center gap-1.5 text-xs font-medium">
        {icon}
        {title}
      </div>
      <p className="text-[10px] text-muted-foreground mt-0.5">{hint}</p>
    </button>
  );
}

function ScopePill({ scope }: { scope: "private" | "team" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-[9px] font-medium rounded px-1 py-0.5 shrink-0",
        scope === "team"
          ? "bg-blue-500/10 text-blue-400"
          : "bg-muted/60 text-muted-foreground",
      )}
    >
      {scope === "team" ? (
        <Globe2 className="h-2.5 w-2.5" />
      ) : (
        <Lock className="h-2.5 w-2.5" />
      )}
      {scope === "team" ? "Team" : "Private"}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Filter summary helpers
// ---------------------------------------------------------------------------

type ChipKind =
  | "search"
  | "location"
  | "category"
  | "exclude"
  | "score"
  | "reviews"
  | "price"
  | "data";

type Chip = { kind: ChipKind; label: string };

function chipToneClass(kind: ChipKind): string {
  switch (kind) {
    case "search":
      return "bg-amber-500/10 text-amber-300 border-amber-500/20";
    case "location":
      return "bg-sky-500/10 text-sky-300 border-sky-500/20";
    case "category":
      return "bg-emerald-500/10 text-emerald-300 border-emerald-500/20";
    case "exclude":
      return "bg-rose-500/10 text-rose-300 border-rose-500/20";
    case "score":
      return "bg-yellow-500/10 text-yellow-300 border-yellow-500/20";
    case "reviews":
      return "bg-violet-500/10 text-violet-300 border-violet-500/20";
    case "price":
      return "bg-lime-500/10 text-lime-300 border-lime-500/20";
    case "data":
    default:
      return "bg-muted/60 text-muted-foreground border-border/60";
  }
}

function summarizeFilters(f: Filters): Chip[] {
  const chips: Chip[] = [];
  const en = f.enabled;

  if (en.search && f.search.trim()) {
    chips.push({ kind: "search", label: `"${f.search.trim()}"` });
  }
  if (en.provinces && f.provinces.length) {
    for (const p of f.provinces) chips.push({ kind: "location", label: p });
  }
  if (en.city && f.city) {
    chips.push({ kind: "location", label: f.city });
  }
  if (en.categories && f.categories.length) {
    for (const c of f.categories) chips.push({ kind: "category", label: c });
  }
  if (en.excludeCategories && f.excludeCategories.length) {
    for (const c of f.excludeCategories) chips.push({ kind: "exclude", label: `excl. ${c}` });
  }
  if (en.score && (f.scoreMin !== DEFAULT_FILTERS.scoreMin || f.scoreMax !== DEFAULT_FILTERS.scoreMax)) {
    chips.push({ kind: "score", label: `${f.scoreMin}–${f.scoreMax}★` });
  }
  if (en.reviews && (f.minReviews > 0 || f.maxReviews !== null)) {
    chips.push({
      kind: "reviews",
      label:
        f.maxReviews !== null
          ? `${f.minReviews}–${f.maxReviews} reviews`
          : `≥${f.minReviews} reviews`,
    });
  }
  if (en.priceBuckets && f.priceBuckets.length) {
    chips.push({ kind: "price", label: f.priceBuckets.join(" ") });
  }
  if (en.isChain && f.isChainOnly === true) chips.push({ kind: "data", label: "Chains only" });
  if (en.isChain && f.isChainOnly === false) chips.push({ kind: "data", label: "Independents" });
  if (en.hasPhone && f.hasPhone === true) chips.push({ kind: "data", label: "Has phone" });
  if (en.hasPhone && f.hasPhone === false) chips.push({ kind: "data", label: "No phone" });
  if (en.hasWebsite && f.hasWebsite === true) chips.push({ kind: "data", label: "Has website" });
  if (en.hasWebsite && f.hasWebsite === false) chips.push({ kind: "data", label: "No website" });
  if (en.hasAddress && f.hasAddress === false) chips.push({ kind: "data", label: "No address" });
  if (en.hasCoordinates && f.hasCoordinates === false) chips.push({ kind: "data", label: "No coords" });

  return chips;
}

function normalizeFilters(raw: unknown): Filters {
  const r = (raw ?? {}) as Partial<Filters> & {
    enabled?: Partial<FilterEnabled>;
  };
  return {
    ...DEFAULT_FILTERS,
    ...r,
    enabled: { ...DEFAULT_ENABLED, ...(r.enabled ?? {}) },
  };
}
