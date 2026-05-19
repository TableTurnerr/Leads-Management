"use client";

import Link from "next/link";
import { MapPinned, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RefreshDataButton } from "@/components/refresh-data-button";

function initialsFromEmail(email: string) {
  const local = email.split("@")[0] ?? "";
  const parts = local.split(/[._-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toLowerCase();
  }
  return local.slice(0, 2).toLowerCase() || "?";
}

export function TopBar({ userEmail }: { userEmail: string }) {
  const initials = initialsFromEmail(userEmail);

  return (
    <header className="border-b border-border h-14 flex items-center justify-between px-6 gap-4 sticky top-0 z-20 bg-background/75 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex items-center gap-2.5 min-w-0">
        <span
          aria-hidden
          className="grid place-items-center h-7 w-7 rounded-md bg-muted/80 text-foreground/80 ring-1 ring-foreground/10"
        >
          <MapPinned className="h-4 w-4" />
        </span>
        <h1 className="text-[15px] font-semibold tracking-tight truncate">
          Leads Management
        </h1>
      </div>
      <div className="flex items-center gap-2">
        <span
          title={userEmail}
          aria-label={userEmail}
          className="grid place-items-center h-7 w-7 rounded-full bg-secondary text-secondary-foreground text-[11px] font-semibold uppercase tracking-wide ring-1 ring-foreground/10 select-none"
        >
          {initials}
        </span>
        <RefreshDataButton />
        <Button
          variant="ghost"
          size="icon-sm"
          nativeButton={false}
          render={<Link href="/settings" title="Settings" aria-label="Settings" />}
        >
          <Settings className="h-4 w-4" />
        </Button>
        <form action="/auth/signout" method="post">
          <Button variant="outline" size="sm" type="submit">
            Sign out
          </Button>
        </form>
      </div>
    </header>
  );
}
