import { NextResponse } from "next/server";
import { createAuthClient, createDataClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const auth = await createAuthClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const db = await createDataClient();
  const { data: settings } = await db
    .from("user_settings")
    .select("sheets_webhook_url")
    .eq("user_id", user.id)
    .maybeSingle();

  const webhook = settings?.sheets_webhook_url;
  if (!webhook) {
    return NextResponse.json(
      { error: "No webhook URL set. Open Settings and paste your Apps Script URL." },
      { status: 400 },
    );
  }

  const body = (await request.json()) as {
    rows: Array<Record<string, unknown>>;
  };
  if (!Array.isArray(body.rows) || body.rows.length === 0) {
    return NextResponse.json({ error: "No rows to send" }, { status: 400 });
  }

  const restaurantIds = body.rows
    .map((r) => (typeof r?.id === "number" ? (r.id as number) : null))
    .filter((n): n is number => n != null);

  let res: Response;
  try {
    res = await fetch(webhook, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sentAt: new Date().toISOString(),
        sentBy: user.email,
        rows: body.rows,
      }),
      // Apps Script sometimes redirects; let fetch follow it
      redirect: "follow",
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: `Could not reach webhook: ${
          err instanceof Error ? err.message : "unknown error"
        }`,
      },
      { status: 502 },
    );
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return NextResponse.json(
      { error: `Webhook returned ${res.status}: ${text.slice(0, 200)}` },
      { status: 502 },
    );
  }

  try {
    await db.from("lead_action_logs").insert({
      user_id: user.id,
      user_email: user.email,
      action: "send_to_sheets",
      source: "selected_tab",
      row_count: body.rows.length,
      restaurant_ids: restaurantIds.length ? restaurantIds : null,
      metadata: { webhook_host: safeHost(webhook) },
    });
  } catch {
    // Logging is best-effort — the user's send already succeeded.
  }

  return NextResponse.json({ ok: true, count: body.rows.length });
}

function safeHost(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}
