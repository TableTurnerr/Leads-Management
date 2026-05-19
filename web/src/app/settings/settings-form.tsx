"use client";

import { useState } from "react";
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
import { toast } from "sonner";

export function SettingsForm({
  initialUrl,
  email,
}: {
  initialUrl: string;
  email: string;
}) {
  const [url, setUrl] = useState(initialUrl);
  const [saving, setSaving] = useState(false);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      toast.error("Not signed in.");
      setSaving(false);
      return;
    }
    const trimmed = url.trim() || null;
    const { error } = await supabase.from("user_settings").upsert({
      user_id: userData.user.id,
      sheets_webhook_url: trimmed,
      updated_at: new Date().toISOString(),
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Settings saved.");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Apps Script webhook</CardTitle>
        <CardDescription>
          The Send-to-Sheets button POSTs the current selection to this URL as
          JSON. Signed in as {email}.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4" onSubmit={onSave}>
          <div className="grid gap-2">
            <Label htmlFor="webhook">Webhook URL</Label>
            <Input
              id="webhook"
              type="url"
              placeholder="https://script.google.com/macros/s/AKfyc.../exec"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Deploy your Apps Script as a Web App with access set to
              &ldquo;Anyone&rdquo; (or &ldquo;Anyone with the link&rdquo;) and
              paste the URL here. See{" "}
              <code className="text-xs">apps-script/send-to-sheets.gs</code> in
              the repo for the script.
            </p>
          </div>
          <Button type="submit" disabled={saving} className="w-fit">
            {saving ? "Saving…" : "Save"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
