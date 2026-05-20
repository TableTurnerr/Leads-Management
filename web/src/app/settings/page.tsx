import { redirect } from "next/navigation";
import Link from "next/link";
import { createAuthClient, createDataClient } from "@/lib/supabase/server";
import { SettingsForm } from "./settings-form";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ArrowLeft, ArrowRight, Ban } from "lucide-react";

export default async function SettingsPage() {
  const auth = await createAuthClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) redirect("/login");

  const db = await createDataClient();
  const { data: settings } = await db
    .from("user_settings")
    .select("sheets_webhook_url")
    .eq("user_id", user.id)
    .maybeSingle();

  const { count: chainCount } = await db
    .from("fast_food_chains")
    .select("*", { count: "exact", head: true });

  return (
    <main className="max-w-2xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground">
            Configure how Leads Management talks to your tools.
          </p>
        </div>
        <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/" />}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to explorer
        </Button>
      </div>
      <SettingsForm
        initialUrl={settings?.sheets_webhook_url ?? ""}
        email={user.email ?? ""}
      />
      <Card>
        <CardHeader className="border-b pb-4">
          <div className="flex items-center gap-2.5">
            <span className="grid place-items-center h-8 w-8 rounded-md bg-muted text-foreground/80">
              <Ban className="h-4 w-4" />
            </span>
            <div>
              <CardTitle className="text-base">Fast-food chains</CardTitle>
              <CardDescription>
                {chainCount ?? 0} chain name{chainCount === 1 ? "" : "s"} excluded from
                the leads view.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-4 flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Add or remove names. Matching leads are flagged automatically.
          </p>
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={<Link href="/settings/chains" />}
          >
            Manage chains
            <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
