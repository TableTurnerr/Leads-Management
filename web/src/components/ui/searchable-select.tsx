"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { ChevronDownIcon, CheckIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

// A single-select dropdown whose first interactive element is a search box.
// Built on Popover instead of the base-ui Select so the search input can
// receive focus and typed characters without colliding with the Select's
// built-in typeahead.
export type SearchableSelectOption = {
  value: string;
  label?: string;
};

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyText = "No matches.",
  clearLabel,
  disabled,
  className,
  maxListHeight = 240,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  options: (SearchableSelectOption | string)[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  // When set, the dropdown shows a leading row whose label is `clearLabel`
  // and selecting it calls onChange(null). Used for "All" entries.
  clearLabel?: string;
  disabled?: boolean;
  className?: string;
  maxListHeight?: number;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement | null>(null);

  // Reset the query whenever the popover closes so reopening starts fresh.
  // The setTimeout keeps the visible text intact during the close animation.
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => searchRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setQuery(""), 150);
    return () => clearTimeout(t);
  }, [open]);

  const normalized = useMemo<SearchableSelectOption[]>(
    () =>
      options.map((o) => (typeof o === "string" ? { value: o } : o)),
    [options],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return normalized;
    return normalized.filter((o) =>
      (o.label ?? o.value).toLowerCase().includes(q),
    );
  }, [normalized, query]);

  const currentLabel = useMemo(() => {
    if (value == null) return null;
    const hit = normalized.find((o) => o.value === value);
    return hit?.label ?? hit?.value ?? value;
  }, [normalized, value]);

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger
        nativeButton
        disabled={disabled}
        className={cn(
          "flex h-8 w-full items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent py-1 pr-2 pl-2.5 text-sm transition-colors outline-none",
          "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "dark:bg-input/30 dark:hover:bg-input/50",
          className,
        )}
      >
        <span
          className={cn(
            "flex-1 text-left truncate",
            currentLabel == null && "text-muted-foreground",
          )}
        >
          {currentLabel ?? placeholder}
        </span>
        <ChevronDownIcon className="size-4 text-muted-foreground shrink-0" />
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Positioner
          align="start"
          sideOffset={4}
          className="isolate z-50 w-(--anchor-width)"
        >
          <PopoverPrimitive.Popup
            className="rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-hidden data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95"
          >
            <Input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="h-8 text-xs border-0 border-b border-border rounded-none rounded-t-lg focus-visible:ring-0 focus-visible:border-border"
            />
            <div
              className="overflow-y-auto py-1 scrollbar-custom"
              style={{ maxHeight: maxListHeight }}
            >
              {clearLabel != null && (
                <Row
                  selected={value == null}
                  onSelect={() => {
                    onChange(null);
                    setOpen(false);
                  }}
                >
                  <span className="text-muted-foreground">{clearLabel}</span>
                </Row>
              )}
              {filtered.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">
                  {emptyText}
                </p>
              )}
              {filtered.map((o) => {
                const selected = o.value === value;
                return (
                  <Row
                    key={o.value}
                    selected={selected}
                    onSelect={() => {
                      onChange(o.value);
                      setOpen(false);
                    }}
                  >
                    {o.label ?? o.value}
                  </Row>
                );
              })}
            </div>
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

function Row({
  selected,
  onSelect,
  children,
}: {
  selected: boolean;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        "w-full flex items-center gap-2 px-2 py-1.5 text-xs text-left rounded-sm",
        "hover:bg-accent hover:text-accent-foreground",
        selected && "bg-accent/60",
      )}
    >
      <span className="flex-1 truncate">{children}</span>
      {selected && <CheckIcon className="size-3.5 shrink-0" />}
    </button>
  );
}
