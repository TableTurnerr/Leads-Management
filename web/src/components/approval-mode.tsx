"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { useAppStore } from "@/lib/store";
import { postQuery } from "@/lib/fetcher";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChevronLeft,
  ChevronRight,
  Check,
  X,
  SkipForward,
  ExternalLink,
  LogOut,
  Star,
  MapPin,
  Phone,
  Globe,
  CornerUpRight,
  Settings,
  AlertTriangle,
} from "lucide-react";
import type { Restaurant } from "@/lib/types";
import { logLeadAction } from "@/lib/log-action";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  formatShortcut,
  reservedComboWarning,
  shortcutFromEvent,
  shortcutMatchesEvent,
  useApprovalShortcuts,
  type ApprovalAction,
  type Shortcut,
} from "@/lib/use-approval-shortcuts";

function searchQuery(r: Restaurant): string {
  return [r.name, r.address, r.city].filter(Boolean).join(" ").trim();
}

function buildSearchUrl(r: Restaurant): string {
  // igu=1 disables some Google features so the page is more likely to render
  // inside the iframe; falls back to the user's "Open in new tab" button
  // when Google blocks the frame entirely.
  return `https://www.google.com/search?igu=1&q=${encodeURIComponent(searchQuery(r))}`;
}

function buildSearchUrlExternal(r: Restaurant): string {
  return `https://www.google.com/search?q=${encodeURIComponent(searchQuery(r))}`;
}

export function ApprovalMode() {
  const queue = useAppStore((s) => s.approvalQueue);
  const index = useAppStore((s) => s.approvalIndex);
  const setIndex = useAppStore((s) => s.setApprovalIndex);
  const approvedIds = useAppStore((s) => s.approvedIds);
  const rejectedIds = useAppStore((s) => s.rejectedIds);
  const skippedIds = useAppStore((s) => s.skippedIds);
  const downloadedIds = useAppStore((s) => s.downloadedIds);
  const sentToSheetsIds = useAppStore((s) => s.sentToSheetsIds);
  const markApproved = useAppStore((s) => s.markApproved);
  const markRejected = useAppStore((s) => s.markRejected);
  const markSkipped = useAppStore((s) => s.markSkipped);
  const exitApproval = useAppStore((s) => s.exitApproval);
  const { shortcuts, setShortcut } = useApprovalShortcuts();

  const idsKey = useMemo(
    () => (queue.length ? [...queue].sort((a, b) => a - b).join(",") : null),
    [queue],
  );

  const { data, isLoading } = useSWR<{ rows: Restaurant[] }>(
    idsKey ? ["by_ids_approval", idsKey] : null,
    () => postQuery<{ rows: Restaurant[] }>({ type: "by_ids", ids: queue }),
    { revalidateOnFocus: false, keepPreviousData: true },
  );

  const byId = useMemo(() => {
    const map = new Map<number, Restaurant>();
    for (const r of data?.rows ?? []) map.set(r.id, r);
    return map;
  }, [data]);

  // Log the session opening once we know the queue.
  const loggedStart = useRef(false);
  useEffect(() => {
    if (loggedStart.current || !queue.length) return;
    loggedStart.current = true;
    void logLeadAction({
      action: "approval_start",
      source: "approval_mode",
      restaurantIds: queue,
      rowCount: queue.length,
    });
  }, [queue]);

  const total = queue.length;
  const safeIndex = Math.min(Math.max(index, 0), Math.max(total - 1, 0));
  const currentId = queue[safeIndex];
  const current = currentId != null ? byId.get(currentId) : undefined;

  function goPrev() {
    setIndex(Math.max(safeIndex - 1, 0));
  }
  function goNext() {
    setIndex(Math.min(safeIndex + 1, total - 1));
  }

  function handleApprove() {
    if (!current) return;
    markApproved(current.id);
    void logLeadAction({
      action: "lead_approved",
      source: "approval_mode",
      restaurantIds: [current.id],
      metadata: { name: current.name, city: current.city },
    });
    if (safeIndex < total - 1) goNext();
  }

  function handleReject() {
    if (!current) return;
    markRejected(current.id);
    void logLeadAction({
      action: "lead_rejected",
      source: "approval_mode",
      restaurantIds: [current.id],
      metadata: { name: current.name, city: current.city },
    });
    if (safeIndex < total - 1) goNext();
  }

  function handleSkip() {
    if (!current) return;
    markSkipped(current.id);
    void logLeadAction({
      action: "lead_skipped",
      source: "approval_mode",
      restaurantIds: [current.id],
    });
    if (safeIndex < total - 1) goNext();
  }

  function handleOpenSite() {
    if (current?.website) window.open(current.website, "_blank", "noreferrer");
  }

  function handleOpenSearch() {
    if (current) window.open(buildSearchUrlExternal(current), "_blank", "noreferrer");
  }

  function handleExit() {
    void logLeadAction({
      action: "approval_end",
      source: "approval_mode",
      restaurantIds: approvedIds,
      rowCount: approvedIds.length,
      metadata: {
        approved: approvedIds.length,
        rejected: rejectedIds.length,
        skipped: skippedIds.length,
        total,
      },
    });
    exitApproval();
  }

  // Keyboard shortcuts are fully user-defined; nothing is bound by default.
  useEffect(() => {
    const handlers: Record<ApprovalAction, () => void> = {
      approve: handleApprove,
      reject: handleReject,
      skip: handleSkip,
      next: goNext,
      prev: goPrev,
      exit: handleExit,
      openSite: handleOpenSite,
      openSearch: handleOpenSearch,
    };
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLElement) {
        const tag = e.target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || e.target.isContentEditable)
          return;
      }
      for (const [action, sc] of Object.entries(shortcuts)) {
        if (sc && shortcutMatchesEvent(sc, e)) {
          e.preventDefault();
          handlers[action as ApprovalAction]();
          return;
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, safeIndex, total, shortcuts]);

  if (!total) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-muted-foreground">No leads queued for approval.</p>
          <Button onClick={handleExit}>Back</Button>
        </div>
      </div>
    );
  }

  if (isLoading && !data) {
    return (
      <div className="flex h-screen flex-col">
        <Skeleton className="h-16 w-full" />
        <div className="grid flex-1 grid-cols-2 gap-2 p-2">
          <Skeleton className="h-full w-full" />
          <Skeleton className="h-full w-full" />
        </div>
      </div>
    );
  }

  const status = current
    ? approvedIds.includes(current.id)
      ? "approved"
      : rejectedIds.includes(current.id)
        ? "rejected"
        : skippedIds.includes(current.id)
          ? "skipped"
          : null
    : null;

  const website = current?.website ?? null;
  const searchUrl = current ? buildSearchUrl(current) : "";
  const searchExternal = current ? buildSearchUrlExternal(current) : "";

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Header: lead info + controls + progress */}
      <header className="border-b border-border bg-card/60 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-lg font-semibold">
                {current?.name ?? "—"}
              </h1>
              {status === "approved" && (
                <Badge className="bg-emerald-600 hover:bg-emerald-600">Approved</Badge>
              )}
              {status === "rejected" && (
                <Badge variant="destructive">Rejected</Badge>
              )}
              {status === "skipped" && (
                <Badge variant="secondary">Skipped</Badge>
              )}
              {current && downloadedIds.includes(current.id) && (
                <Badge className="bg-sky-600 hover:bg-sky-600 text-white">
                  Downloaded
                </Badge>
              )}
              {current && sentToSheetsIds.includes(current.id) && (
                <Badge className="bg-violet-600 hover:bg-violet-600 text-white">
                  Sent to Sheets
                </Badge>
              )}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              {current?.address && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {current.address}
                  {current.city ? `, ${current.city}` : ""}
                  {current.province ? `, ${current.province}` : ""}
                </span>
              )}
              {current?.rating != null && (
                <span className="flex items-center gap-1">
                  <Star className="h-3 w-3" />
                  {current.rating.toFixed(1)}
                  {current.ratings != null && ` (${current.ratings.toLocaleString()})`}
                </span>
              )}
              {current?.category && <span>{current.category}</span>}
              {current?.price_bucket && <span>{current.price_bucket}</span>}
              {current?.phone && (
                <a
                  href={`tel:${current.phone}`}
                  className="flex items-center gap-1 underline underline-offset-2"
                >
                  <Phone className="h-3 w-3" />
                  {current.phone}
                </a>
              )}
              {current?.website && (
                <a
                  href={current.website}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 underline underline-offset-2 max-w-[20rem]"
                  title={current.website}
                >
                  <Globe className="h-3 w-3 shrink-0" />
                  <span className="truncate">
                    {current.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                  </span>
                </a>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <ShortcutSettings
              shortcuts={shortcuts}
              setShortcut={setShortcut}
            />
            <div className="inline-flex items-stretch overflow-hidden rounded-full border border-border text-xs font-medium tabular-nums">
              <span className="flex items-center gap-1 bg-muted/60 px-2.5 py-1 text-foreground">
                {safeIndex + 1}
                <span className="text-muted-foreground">/ {total}</span>
              </span>
              <span
                className="flex items-center gap-1 border-l border-border bg-emerald-500/10 px-2.5 py-1 text-emerald-600 dark:text-emerald-400"
                title="Approved"
              >
                <Check className="h-3 w-3" />
                {approvedIds.length}
              </span>
              <span
                className="flex items-center gap-1 border-l border-border bg-red-500/10 px-2.5 py-1 text-red-600 dark:text-red-400"
                title="Rejected"
              >
                <X className="h-3 w-3" />
                {rejectedIds.length}
              </span>
              <span
                className="flex items-center gap-1 border-l border-border bg-muted/60 px-2.5 py-1 text-muted-foreground"
                title="Skipped"
              >
                <CornerUpRight className="h-3 w-3" />
                {skippedIds.length}
              </span>
            </div>
            <Button variant="ghost" size="icon" onClick={goPrev} disabled={safeIndex === 0}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={goNext} disabled={safeIndex >= total - 1}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSkip}
              className={status && status !== "skipped" ? "opacity-50 hover:opacity-100" : ""}
            >
              <SkipForward className="h-4 w-4 mr-1" /> {status === "skipped" ? "Skipped" : "Skip"}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleReject}
              className={status && status !== "rejected" ? "opacity-50 hover:opacity-100" : ""}
            >
              <X className="h-4 w-4 mr-1" /> {status === "rejected" ? "Rejected" : "Reject"}
            </Button>
            <Button
              size="sm"
              onClick={handleApprove}
              className={`bg-emerald-600 hover:bg-emerald-700 text-white ${
                status && status !== "approved" ? "opacity-50 hover:opacity-100" : ""
              }`}
            >
              <Check className="h-4 w-4 mr-1" /> {status === "approved" ? "Approved" : "Approve"}
            </Button>
            <Button variant="ghost" size="sm" onClick={handleExit}>
              <LogOut className="h-4 w-4 mr-1" /> Exit
            </Button>
          </div>
        </div>
        {/* progress bar */}
        <div className="mt-2 h-1 w-full overflow-hidden rounded bg-muted">
          <div
            className="h-full bg-primary transition-[width] duration-200"
            style={{
              width: `${total ? ((safeIndex + 1) / total) * 100 : 0}%`,
            }}
          />
        </div>
      </header>

      {/* Split panes: website (left) + Google search (right) */}
      <div className="grid flex-1 grid-cols-1 gap-2 overflow-hidden p-2 md:grid-cols-2">
        <div className="relative overflow-hidden rounded-lg border border-border bg-card/30">
          <div className="absolute right-2 top-2 z-10 flex gap-1">
            {!website && (
              <Badge variant="secondary" className="h-7 px-2 text-[10px]">
                No website
              </Badge>
            )}
            {website && (
              <a
                href={website}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center rounded-md bg-secondary px-2.5 py-1.5 text-xs font-medium text-secondary-foreground hover:bg-secondary/80"
              >
                <ExternalLink className="h-3 w-3 mr-1" /> Open Site
              </a>
            )}
          </div>
          {current && website && (
            <SafeIframe
              key={`site-${current.id}`}
              src={website}
              externalUrl={website}
              title="Restaurant website"
            />
          )}
          {current && !website && (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              No website on file
            </div>
          )}
        </div>

        <div className="relative overflow-hidden rounded-lg border border-border bg-card/30">
          <div className="absolute right-2 top-2 z-10">
            <a
              href={searchExternal}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center rounded-md bg-secondary px-2.5 py-1.5 text-xs font-medium text-secondary-foreground hover:bg-secondary/80"
            >
              <ExternalLink className="h-3 w-3 mr-1" /> Open Search
            </a>
          </div>
          {current && (
            <SafeIframe
              key={`search-${current.id}`}
              src={searchUrl}
              externalUrl={searchExternal}
              title="Google search"
            />
          )}
        </div>
      </div>
    </div>
  );
}

// Some sites (and Google search itself) refuse to load inside an iframe via
// X-Frame-Options or CSP. The browser will silently leave the frame blank;
// onLoad does fire even when the page is blocked, so we can't detect this
// reliably. We render the iframe and a small fallback overlay the user can
// click if the frame stays empty.
function SafeIframe({
  src,
  externalUrl,
  title,
}: {
  src: string;
  externalUrl: string;
  title: string;
}) {
  const [showFallback, setShowFallback] = useState(false);

  // Timer-based fallback: if onLoad hasn't fired after ~5s assume the frame
  // was refused or the target is slow. Either way give the user an escape
  // hatch. Refusal usually fires `load` immediately on a blank doc, so this
  // mostly catches the dead-frame case.
  useEffect(() => {
    setShowFallback(false);
    const t = window.setTimeout(() => setShowFallback(true), 4000);
    return () => window.clearTimeout(t);
  }, [src]);

  return (
    <>
      <iframe
        title={title}
        src={src}
        className="h-full w-full border-0 bg-white"
        loading="lazy"
        referrerPolicy="no-referrer"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        onLoad={() => setShowFallback(false)}
      />
      {showFallback && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-3">
          <a
            href={externalUrl}
            target="_blank"
            rel="noreferrer"
            title={externalUrl}
            className="pointer-events-auto max-w-[90%] truncate rounded-md bg-foreground/90 px-3 py-1.5 text-xs text-background shadow"
          >
            {externalUrl.length > 120 ? `${externalUrl.slice(0, 120)}…` : externalUrl}
          </a>
        </div>
      )}
    </>
  );
}

const ACTION_LABELS: { action: ApprovalAction; label: string }[] = [
  { action: "approve", label: "Approve" },
  { action: "reject", label: "Reject" },
  { action: "skip", label: "Skip" },
  { action: "next", label: "Next" },
  { action: "prev", label: "Previous" },
  { action: "exit", label: "Exit" },
  { action: "openSite", label: "Open site in new tab" },
  { action: "openSearch", label: "Open search in new tab" },
];

function ShortcutSettings({
  shortcuts,
  setShortcut,
}: {
  shortcuts: Partial<Record<ApprovalAction, Shortcut>>;
  setShortcut: (action: ApprovalAction, s: Shortcut | null) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant="ghost" size="sm" title="Configure shortcuts">
            <Settings className="h-4 w-4 mr-1" /> Keybinds
          </Button>
        }
      />
      <PopoverContent align="end" className="w-80">
        <div className="flex items-center justify-between">
          <span className="font-medium">Keyboard shortcuts</span>
          <span className="text-[10px] text-muted-foreground">
            Unset by default
          </span>
        </div>
        <div className="flex flex-col gap-1.5">
          {ACTION_LABELS.map(({ action, label }) => (
            <ShortcutRow
              key={action}
              label={label}
              value={shortcuts[action] ?? null}
              onChange={(s) => setShortcut(action, s)}
            />
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground">
          Click a row, then press the combo. Backspace clears it.
        </p>
      </PopoverContent>
    </Popover>
  );
}

function ShortcutRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Shortcut | null;
  onChange: (s: Shortcut | null) => void;
}) {
  const [recording, setRecording] = useState(false);
  const [warning, setWarning] = useState<string | null>(
    value ? reservedComboWarning(value) : null,
  );

  useEffect(() => {
    if (!recording) return;
    function onKey(e: KeyboardEvent) {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        setRecording(false);
        return;
      }
      if (e.key === "Backspace" || e.key === "Delete") {
        onChange(null);
        setWarning(null);
        setRecording(false);
        return;
      }
      const sc = shortcutFromEvent(e);
      if (!sc) return;
      onChange(sc);
      setWarning(reservedComboWarning(sc));
      setRecording(false);
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [recording, onChange]);

  return (
    <div className="flex flex-col gap-1 rounded-md border border-border/60 px-2 py-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm">{label}</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setRecording((r) => !r)}
            className={`min-w-20 rounded border px-2 py-0.5 text-xs font-mono ${
              recording
                ? "border-primary bg-primary/10 text-primary animate-pulse"
                : "border-border bg-muted/40 hover:bg-muted"
            }`}
          >
            {recording
              ? "Press keys…"
              : value
                ? formatShortcut(value)
                : "Not set"}
          </button>
          {value && !recording && (
            <button
              type="button"
              onClick={() => {
                onChange(null);
                setWarning(null);
              }}
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              title="Clear shortcut"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
      {warning && (
        <div className="flex items-start gap-1 text-[10px] text-amber-600 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          <span>{warning}</span>
        </div>
      )}
    </div>
  );
}

