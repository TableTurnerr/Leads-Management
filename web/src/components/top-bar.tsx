"use client";

import Link from "next/link";
import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";

export function TopBar({ userEmail }: { userEmail: string }) {
  return (
    <header className="border-b border-border h-14 flex items-center justify-between px-6 gap-4 sticky top-0 z-10 bg-background/80 backdrop-blur">
      <h1 className="text-lg font-semibold tracking-tight">
        Leads Management
      </h1>
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground hidden sm:inline">
          {userEmail}
        </span>
        <Button
          variant="ghost"
          size="icon"
          render={<Link href="/settings" title="Settings" />}
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
