import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { data: settings } = await supabase
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

  const body = (await request.json()) as { rows: unknown[] };
  if (!Array.isArray(body.rows) || body.rows.length === 0) {
    return NextResponse.json({ error: "No rows to send" }, { status: 400 });
  }

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

  return NextResponse.json({ ok: true, count: body.rows.length });
}
