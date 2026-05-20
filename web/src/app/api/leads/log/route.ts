import { NextResponse } from "next/server";
import { createAuthClient, createDataClient } from "@/lib/supabase/server";

type LogAction =
  | "csv_download"
  | "send_to_sheets"
  | "selection_snapshot"
  | "lead_approved"
  | "lead_rejected"
  | "lead_skipped"
  | "approval_start"
  | "approval_end";

type Body = {
  action: LogAction;
  source?: string;
  rowCount?: number;
  restaurantIds?: number[];
  filters?: unknown;
  metadata?: Record<string, unknown>;
};

const ALLOWED: LogAction[] = [
  "csv_download",
  "send_to_sheets",
  "selection_snapshot",
  "lead_approved",
  "lead_rejected",
  "lead_skipped",
  "approval_start",
  "approval_end",
];

// Cap the id array we persist so a runaway selection can't bloat the row.
const MAX_IDS = 50_000;

export async function POST(request: Request) {
  const auth = await createAuthClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.action || !ALLOWED.includes(body.action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const ids = Array.isArray(body.restaurantIds)
    ? body.restaurantIds.slice(0, MAX_IDS).filter((n) => Number.isFinite(n))
    : null;

  const db = await createDataClient();
  const { error } = await db.from("lead_action_logs").insert({
    user_id: user.id,
    user_email: user.email,
    action: body.action,
    source: body.source ?? null,
    row_count:
      body.rowCount ?? (ids ? ids.length : null),
    restaurant_ids: ids,
    filters: body.filters ?? null,
    metadata: body.metadata ?? null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
