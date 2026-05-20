"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type ApprovalAction =
  | "approve"
  | "reject"
  | "skip"
  | "next"
  | "prev"
  | "exit"
  | "openSite"
  | "openSearch";

export type Shortcut = {
  key: string; // KeyboardEvent.key (single character lowercased) or "ArrowRight", "F5", etc.
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;
};

export type ShortcutMap = Partial<Record<ApprovalAction, Shortcut>>;

const STORAGE_KEY = "tt-approval-shortcuts-v1";
const ENDPOINT = "/api/approval-shortcuts";
const PUT_DEBOUNCE_MS = 1000;

function readFromStorage(): ShortcutMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as ShortcutMap) : {};
  } catch {
    return {};
  }
}

function writeToStorage(map: ShortcutMap) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* quota / private mode: ignore */
  }
}

function sameMap(a: ShortcutMap, b: ShortcutMap): boolean {
  const ak = Object.keys(a);
  const bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  for (const k of ak) {
    const x = a[k as ApprovalAction];
    const y = b[k as ApprovalAction];
    if (!x || !y) return false;
    if (
      x.key !== y.key ||
      x.ctrl !== y.ctrl ||
      x.shift !== y.shift ||
      x.alt !== y.alt ||
      x.meta !== y.meta
    ) {
      return false;
    }
  }
  return true;
}

// Mirrors shortcut bindings between the client and a per-user row on the
// server so a user gets the same shortcuts on any device. localStorage is the
// fast read cache; on mount we fetch from the server and let it win when it
// has data, otherwise we push the local cache up.
export function useApprovalShortcuts() {
  const [shortcuts, setShortcuts] = useState<ShortcutMap>(() => readFromStorage());
  const initialized = useRef(false);
  const lastSent = useRef<ShortcutMap | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(ENDPOINT, { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as { shortcuts?: ShortcutMap };
        if (cancelled) return;

        const remote = json.shortcuts && typeof json.shortcuts === "object"
          ? json.shortcuts
          : {};
        const local = readFromStorage();

        if (Object.keys(remote).length > 0 && !sameMap(remote, local)) {
          writeToStorage(remote);
          setShortcuts(remote);
          lastSent.current = remote;
        } else if (Object.keys(remote).length === 0 && Object.keys(local).length > 0) {
          await pushShortcuts(local);
          lastSent.current = local;
        } else {
          lastSent.current = remote;
        }
      } catch {
        // Offline / unauthenticated: local cache stays authoritative.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const setShortcut = useCallback((action: ApprovalAction, s: Shortcut | null) => {
    setShortcuts((prev) => {
      const next = { ...prev };
      if (s) next[action] = s;
      else delete next[action];
      writeToStorage(next);

      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        if (lastSent.current && sameMap(lastSent.current, next)) return;
        void pushShortcuts(next).then(() => {
          lastSent.current = next;
        });
      }, PUT_DEBOUNCE_MS);

      return next;
    });
  }, []);

  return { shortcuts, setShortcut };
}

async function pushShortcuts(map: ShortcutMap): Promise<void> {
  try {
    await fetch(ENDPOINT, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ shortcuts: map }),
    });
  } catch {
    // Swallow; localStorage still has it and the next change will retry.
  }
}

export function formatShortcut(s: Shortcut): string {
  const parts: string[] = [];
  if (s.ctrl) parts.push("Ctrl");
  if (s.alt) parts.push("Alt");
  if (s.shift) parts.push("Shift");
  if (s.meta) parts.push("Meta");
  parts.push(prettyKey(s.key));
  return parts.join(" + ");
}

function prettyKey(k: string): string {
  if (k.length === 1) return k.toUpperCase();
  if (k === " ") return "Space";
  return k;
}

export function shortcutFromEvent(e: KeyboardEvent): Shortcut | null {
  if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) return null;
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  return {
    key,
    ctrl: e.ctrlKey,
    shift: e.shiftKey,
    alt: e.altKey,
    meta: e.metaKey,
  };
}

export function shortcutMatchesEvent(s: Shortcut, e: KeyboardEvent): boolean {
  const evKey = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  return (
    s.key === evKey &&
    s.ctrl === e.ctrlKey &&
    s.shift === e.shiftKey &&
    s.alt === e.altKey &&
    s.meta === e.metaKey
  );
}

// Combos known to be reserved by the browser, the OS, or accessibility tools.
// Triggering one of these is usually a bad idea because the browser eats the
// event before the page sees it, or the OS pre-empts the tab entirely.
export function reservedComboWarning(s: Shortcut): string | null {
  const key = s.key;
  const mac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
  const cmd = s.meta;
  const ctrl = s.ctrl;
  const primary = mac ? cmd : ctrl;

  const reservedFnKeys = new Set(["F1", "F3", "F5", "F6", "F7", "F11", "F12"]);
  if (reservedFnKeys.has(key) && !ctrl && !s.alt && !s.shift && !cmd) {
    return `${formatShortcut(s)} is reserved by the browser (${key}).`;
  }

  if (!mac && s.alt && key === "F4") {
    return "Alt + F4 closes the window on Windows.";
  }
  if ((s.alt && key === "Tab") || (cmd && key === "Tab" && mac)) {
    return "This combo switches windows at the OS level and won't reach the page.";
  }
  if (s.alt && (key === "ArrowLeft" || key === "ArrowRight") && !ctrl && !s.shift && !cmd) {
    return `${formatShortcut(s)} navigates browser history.`;
  }

  if (primary && !s.alt && key.length === 1) {
    const reservedPrimary = new Set([
      "t", "n", "w", "r", "l", "d", "f", "p", "j", "h", "u", "o", "s", "k",
      "+", "-", "0",
    ]);
    if (reservedPrimary.has(key)) {
      return `${formatShortcut(s)} is a default browser shortcut.`;
    }
    if (/^[1-9]$/.test(key) && !s.shift) {
      return `${formatShortcut(s)} jumps to a browser tab.`;
    }
  }

  if (primary && s.shift && !s.alt && key.length === 1) {
    const reservedShift = new Set(["t", "n", "p", "i", "j", "delete", "r"]);
    if (reservedShift.has(key)) {
      return `${formatShortcut(s)} is a default browser shortcut.`;
    }
  }

  return null;
}
