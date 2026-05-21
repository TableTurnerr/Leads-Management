import { NextResponse } from "next/server";
import { createAuthClient, createDataClient } from "@/lib/supabase/server";

// Returns the union of restaurant_ids per action for the current user. The
// store keeps these arrays locally for instant rendering of approval-status
// badges and for the include/exclude approval filter; hydrating from the
// audit log lets the filter survive a localStorage clear or a new device.
export async function GET() {
  const auth = await createAuthClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const db = await createDataClient();
  const { data, error } = await db
    .from("lead_action_logs")
    .select("action, restaurant_ids")
    .eq("user_id", user.id)
    .in("action", [
      "csv_download",
      "send_to_sheets",
      "lead_approved",
      "lead_rejected",
      "lead_skipped",
    ])
    .not("restaurant_ids", "is", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const approved = new Set<number>();
  const rejected = new Set<number>();
  const skipped = new Set<number>();
  const downloaded = new Set<number>();
  const sentToSheets = new Set<number>();

  for (const row of data ?? []) {
    const ids = (row.restaurant_ids ?? []) as number[];
    let bucket: Set<number> | null = null;
    switch (row.action as string) {
      case "csv_download":   bucket = downloaded;   break;
      case "send_to_sheets": bucket = sentToSheets; break;
      case "lead_approved":  bucket = approved;     break;
      case "lead_rejected":  bucket = rejected;     break;
      case "lead_skipped":   bucket = skipped;      break;
    }
    if (!bucket) continue;
    for (const id of ids) bucket.add(id);
  }

  return NextResponse.json({
    approvedIds: [...approved],
    rejectedIds: [...rejected],
    skippedIds: [...skipped],
    downloadedIds: [...downloaded],
    sentToSheetsIds: [...sentToSheets],
  });
}
