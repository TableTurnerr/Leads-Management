"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Trash2, Plus, Search } from "lucide-react";

export type ChainRow = { name: string; matches: number };

type AddResult  = { name: string; added: boolean; matches: number };
type RemoveResult = { removed: boolean; unmarked: number };

export function ChainsManager({
  initial,
  loadError,
}: {
  initial: ChainRow[];
  loadError: string | null;
}) {
  const [rows, setRows] = useState<ChainRow[]>(initial);
  const [query, setQuery] = useState("");
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!query.trim()) return rows;
    const needle = query.trim().toLowerCase();
    return rows.filter((r) => r.name.toLowerCase().includes(needle));
  }, [rows, query]);

  const totalMatches = useMemo(
    () => rows.reduce((sum, r) => sum + r.matches, 0),
    [rows],
  );

  async function refreshList() {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("chains_list");
    if (error) {
      toast.error(`Could not refresh: ${error.message}`);
      return;
    }
    setRows((data ?? []) as ChainRow[]);
  }

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setAdding(true);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("chains_add", { p_name: name });
    setAdding(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    const result = data as AddResult;
    if (result.added) {
      toast.success(
        result.matches > 0
          ? `Added "${result.name}" and marked ${result.matches} lead${result.matches === 1 ? "" : "s"} as chain.`
          : `Added "${result.name}". No matching leads in the database yet.`,
      );
    } else {
      toast.info(
        `"${result.name}" was already in the list (${result.matches} matching lead${result.matches === 1 ? "" : "s"}).`,
      );
    }
    setNewName("");
    void refreshList();
  }

  async function onRemove(name: string) {
    if (!confirm(`Remove "${name}" from the chain list? Leads previously matched only by this entry will reappear in the main view.`)) {
      return;
    }
    setRemoving(name);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("chains_remove", { p_name: name });
    setRemoving(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    const result = data as RemoveResult;
    if (!result.removed) {
      toast.info(`"${name}" was not in the list.`);
    } else if (result.unmarked > 0) {
      toast.success(
        `Removed "${name}". ${result.unmarked} lead${result.unmarked === 1 ? "" : "s"} reverted to non-chain.`,
      );
    } else {
      toast.success(`Removed "${name}".`);
    }
    void refreshList();
  }

  return (
    <div className="space-y-4">
      {loadError && (
        <Card className="border-destructive/40">
          <CardContent className="py-3 text-sm text-destructive">
            Could not load chains: {loadError}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="border-b pb-4">
          <CardTitle className="text-base">Add a chain</CardTitle>
          <CardDescription>
            Variations are matched automatically. Entering &ldquo;McDonald&rsquo;s&rdquo;
            also flags &ldquo;McDonalds @ Old Atlanta&rdquo;. Add the shortest brand
            form for the widest match.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          <form className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end" onSubmit={onAdd}>
            <div className="grid gap-1.5">
              <Label htmlFor="chain-name">Chain name</Label>
              <Input
                id="chain-name"
                placeholder="e.g. McDonald's"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                disabled={adding}
                autoComplete="off"
              />
            </div>
            <Button type="submit" disabled={adding || !newName.trim()}>
              <Plus className="h-4 w-4" />
              {adding ? "Adding…" : "Add chain"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b pb-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">
                Current list{" "}
                <span className="text-muted-foreground font-normal">
                  ({rows.length})
                </span>
              </CardTitle>
              <CardDescription>
                {totalMatches.toLocaleString()} lead
                {totalMatches === 1 ? "" : "s"} currently marked as a chain.
              </CardDescription>
            </div>
            <div className="relative w-56">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Filter…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-7 h-8 text-xs"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {rows.length === 0 ? "No chains yet." : "No matches for that filter."}
            </p>
          ) : (
            <ul className="divide-y divide-border/60">
              {filtered.map((c) => (
                <li
                  key={c.name}
                  className="flex items-center gap-3 py-2"
                >
                  <span className="flex-1 truncate text-sm">{c.name}</span>
                  <Badge
                    variant="secondary"
                    className="tabular-nums"
                    title={`${c.matches} lead${c.matches === 1 ? "" : "s"} match this name`}
                  >
                    {c.matches}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => onRemove(c.name)}
                    disabled={removing === c.name}
                    aria-label={`Remove ${c.name}`}
                    title="Remove"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
