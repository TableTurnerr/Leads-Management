"use client";

import { useState } from "react";
import useSWR, { mutate as globalMutate } from "swr";
import { toast } from "sonner";
import {
  Bookmark,
  BookmarkPlus,
  Globe2,
  Lock,
  Trash2,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
  const [listOpen, setListOpen] = useState(false);

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setSaveOpen(true)}
        className="h-7 text-xs gap-1 px-2"
        title="Save current filters"
      >
        <BookmarkPlus className="h-3.5 w-3.5" />
        Save
      </Button>

      <Popover open={listOpen} onOpenChange={setListOpen}>
        <PopoverTrigger
          render={
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1 px-2"
              title="Load a saved filter"
            >
              <Bookmark className="h-3.5 w-3.5" />
              Load
            </Button>
          }
        />
        <PopoverContent align="end" className="w-72 p-0">
          <SavedFiltersList
            onPick={(f) => {
              onLoad(f);
              setListOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>

      <SaveFilterDialog
        open={saveOpen}
        onOpenChange={setSaveOpen}
        currentFilters={currentFilters}
      />
    </>
  );
}

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
  const [saving, setSaving] = useState(false);

  // Reset the local form whenever the dialog re-opens so users don't see
  // stale text from a previous attempt.
  function handleOpenChange(v: boolean) {
    if (v) {
      setName("");
      setScope("private");
    }
    onOpenChange(v);
  }

  async function handleSave() {
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
        body: JSON.stringify({
          name: trimmed,
          scope,
          filters: currentFilters,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!res.ok) {
        toast.error(json.error ?? `Save failed (${res.status})`);
        return;
      }
      toast.success(
        scope === "team"
          ? `Saved "${trimmed}" for the team.`
          : `Saved "${trimmed}".`,
      );
      await globalMutate(SAVED_FILTERS_KEY);
      onOpenChange(false);
    } catch (err) {
      toast.error(
        `Save failed: ${err instanceof Error ? err.message : "unknown error"}`,
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Save filter</DialogTitle>
          <DialogDescription>
            Store the current filter set so you (or your team) can re-apply it
            later.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-1">
          <div className="grid gap-1.5">
            <Label htmlFor="saved-filter-name" className="text-xs">
              Name
            </Label>
            <Input
              id="saved-filter-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. NYC pizza ≥ 4.0"
              maxLength={120}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !saving) {
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

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !name.trim()}>
            {saving && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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

function SavedFiltersList({ onPick }: { onPick: (f: Filters) => void }) {
  const { data, error, isLoading } = useSWR<ListResponse>(
    SAVED_FILTERS_KEY,
    fetcher,
    { revalidateOnFocus: false },
  );

  const items = data?.items ?? [];
  const currentUserId = data?.currentUserId;
  const privateItems = items.filter((x) => x.scope === "private");
  const teamItems = items.filter((x) => x.scope === "team");

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete saved filter "${name}"?`)) return;
    const res = await fetch(`${SAVED_FILTERS_KEY}/${id}`, {
      method: "DELETE",
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      toast.error(json.error ?? `Delete failed (${res.status})`);
      return;
    }
    toast.success(`Deleted "${name}".`);
    await globalMutate(SAVED_FILTERS_KEY);
  }

  if (isLoading) {
    return (
      <div className="p-4 text-xs text-muted-foreground flex items-center gap-2">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Loading…
      </div>
    );
  }
  if (error) {
    return (
      <div className="p-4 text-xs text-destructive">
        {error instanceof Error ? error.message : "Failed to load."}
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <div className="p-4 text-xs text-muted-foreground">
        No saved filters yet. Apply some filters, then click Save.
      </div>
    );
  }

  return (
    <div className="max-h-[60vh] overflow-y-auto">
      {privateItems.length > 0 && (
        <Section title="Private">
          {privateItems.map((it) => (
            <Row
              key={it.id}
              item={it}
              ownedByMe={it.user_id === currentUserId}
              onPick={() => onPick(normalizeFilters(it.filters))}
              onDelete={() => handleDelete(it.id, it.name)}
            />
          ))}
        </Section>
      )}
      {teamItems.length > 0 && (
        <Section title="Team">
          {teamItems.map((it) => (
            <Row
              key={it.id}
              item={it}
              ownedByMe={it.user_id === currentUserId}
              onPick={() => onPick(normalizeFilters(it.filters))}
              onDelete={() => handleDelete(it.id, it.name)}
            />
          ))}
        </Section>
      )}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-border/60 last:border-0">
      <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </p>
      <div className="pb-1">{children}</div>
    </div>
  );
}

function Row({
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
  return (
    <div className="group flex items-center gap-1 px-1.5 hover:bg-card/60">
      <button
        onClick={onPick}
        className="flex-1 min-w-0 text-left px-1.5 py-1.5 text-xs"
        title="Load this filter set"
      >
        <span className="truncate block">{item.name}</span>
      </button>
      {ownedByMe && (
        <button
          onClick={onDelete}
          aria-label={`Delete ${item.name}`}
          title="Delete"
          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive p-1 rounded transition-opacity"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

// Saved filter blobs were written from arbitrary historical Filters shapes.
// Fill in any keys that have appeared since so loading never produces an
// undefined that the rest of the app expects to read.
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
