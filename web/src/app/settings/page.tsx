import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SettingsForm } from "./settings-form";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: settings } = await supabase
    .from("user_settings")
    .select("sheets_webhook_url")
    .eq("user_id", user.id)
    .maybeSingle();

  return (
    <main className="max-w-2xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <Button variant="ghost" size="sm" render={<Link href="/" />}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to explorer
        </Button>
      </div>
      <SettingsForm
        initialUrl={settings?.sheets_webhook_url ?? ""}
        email={user.email ?? ""}
      />
    </main>
  );
}
