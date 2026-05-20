import { createClient } from "@/lib/supabase/server";
import { filtersToRpcArgs, type ApprovalFlagsPayload } from "@/lib/filters";
import type { Filters } from "@/lib/types";

// Keep this list in lockstep with the columns the restaurants_export_page
// RPC returns. Order here drives column order in the CSV.
const COLS = [
  ["id",           "ID"],
  ["name",         "Name"],
  ["address",      "Address"],
  ["city",         "City"],
  ["province",     "State"],
  ["postal_code",  "Postal Code"],
  ["country",      "Country"],
  ["latitude",     "Latitude"],
  ["longitude",    "Longitude"],
  ["website",      "Website"],
  ["phone",        "Phone"],
  ["category",     "Category"],
  ["rating",       "Rating"],
  ["ratings",      "Reviews"],
  ["price_bucket", "Price"],
  ["is_chain",     "Is Chain"],
] as const;

// Hard ceiling so a misconfigured client can't ask for an unbounded stream.
// Filtered exports rarely hit this; the unfiltered restaurant set is ~144k.
const MAX_ROWS = 500_000;
// Each round trip to Supabase pays HTTP setup, so we use a generous batch
// size. PostgREST is fine with 5k rows of these slim columns in a single
// response (~1MB JSON). Smaller batches just multiply round trips.
const BATCH = 5000;
const PREVIEW_MAX = 1000;

type Body = {
  filters: Filters;
  mode: "preview" | "full";
  previewSize?: number;
  approvalFlags?: ApprovalFlagsPayload | null;
};

export async function POST(request: Request) {
  const supabase = await createClient();
  const body = (await request.json()) as Body;
  const args = filtersToRpcArgs(body.filters, body.approvalFlags);

  const isPreview = body.mode === "preview";
  const cap = isPreview
    ? Math.max(1, Math.min(PREVIEW_MAX, body.previewSize ?? 500))
    : MAX_ROWS;

  // Previews aren't logged — only the real downloads are.
  const user = isPreview
    ? null
    : (await supabase.auth.getUser()).data.user;

  const encoder = new TextEncoder();
  const filename = `restaurants_${isPreview ? "preview" : "filtered"}_${new Date()
    .toISOString()
    .slice(0, 10)}.csv`;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let afterId: number | null = null;
      let written = 0;
      try {
        controller.enqueue(
          encoder.encode(COLS.map(([, lbl]) => lbl).join(",") + "\n"),
        );

        while (written < cap) {
          const wantBatch = Math.min(BATCH, cap - written);
          const { data, error } = await supabase.rpc(
            "restaurants_export_page",
            {
              ...args,
              p_after_id: afterId,
              p_limit: wantBatch,
            },
          );
          if (error) {
            controller.enqueue(
              encoder.encode(`\n# export error: ${error.message}\n`),
            );
            break;
          }
          const rows = (data ?? []) as Array<Record<string, unknown>>;
          if (rows.length === 0) break;

          for (const r of rows) {
            controller.enqueue(encoder.encode(rowToCsvLine(r)));
          }
          written += rows.length;
          afterId = Number(rows[rows.length - 1].id);
          if (rows.length < wantBatch) break;
        }
      } finally {
        controller.close();
        if (!isPreview && user) {
          // A logging failure must not corrupt the CSV the client is
          // already receiving, so swallow any error.
          try {
            await supabase.from("lead_action_logs").insert({
              user_id: user.id,
              user_email: user.email,
              action: "csv_download",
              source: "table_full_export",
              row_count: written,
              filters: body.filters,
              metadata: { filename },
            });
          } catch {
            // intentionally swallowed
          }
        }
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      // Streaming hint for proxies / dev server.
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

function rowToCsvLine(r: Record<string, unknown>): string {
  let out = "";
  for (let i = 0; i < COLS.length; i++) {
    if (i > 0) out += ",";
    out += csvCell(r[COLS[i][0]]);
  }
  out += "\n";
  return out;
}

function csvCell(v: unknown): string {
  if (v == null) return "";
  let s: string;
  if (typeof v === "boolean") s = v ? "true" : "false";
  else if (typeof v === "number") s = String(v);
  else s = String(v);
  // Escape only if needed — keeps the file small.
  if (/[",\n\r]/.test(s)) {
    s = '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}
