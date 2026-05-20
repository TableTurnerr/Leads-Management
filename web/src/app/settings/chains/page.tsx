import { redirect } from "next/navigation";
import Link from "next/link";
import { createAuthClient, createDataClient } from "@/lib/supabase/server";
import { ChainsManager, type ChainRow } from "./chains-manager";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default async function ChainsPage() {
  const auth = await createAuthClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) redirect("/login");

  const db = await createDataClient();
  const { data, error } = await db.rpc("chains_list");
  const initial: ChainRow[] = error ? [] : ((data ?? []) as ChainRow[]);

  return (
    <main className="max-w-3xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Fast-food chains</h1>
          <p className="text-sm text-muted-foreground">
            Restaurants whose name matches an entry here are flagged as a chain and
            hidden from the leads view by default.
          </p>
        </div>
        <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/settings" />}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to settings
        </Button>
      </div>
      <ChainsManager initial={initial} loadError={error?.message ?? null} />
    </main>
  );
}
