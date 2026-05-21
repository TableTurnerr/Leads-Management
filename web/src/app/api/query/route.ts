import { NextResponse } from "next/server";
import { gzipSync, brotliCompressSync, constants as zlibConstants } from "node:zlib";
import { createDataClient } from "@/lib/supabase/server";
import {
  fetchOverview,
  fetchMapPointArrays,
  fetchRestaurantsByIds,
  fetchList,
  fetchCategoryStats,
  fetchTopCategories,
  fetchColumnValues,
} from "@/lib/queries";
import type { Filters } from "@/lib/types";
import type { ApprovalFlagsPayload } from "@/lib/filters";

// Next.js dev mode doesn't compress responses on its own. The unfiltered
// map payload is several megabytes of JSON over a Singapore round trip,
// so we negotiate compression here.
//
// Brotli at quality 4 beats gzip at default on both axes for this kind
// of payload: ~15% smaller wire size *and* ~3x faster to encode (~50ms
// vs ~150ms for the 4MB map). Quality 4 is the sweet spot — higher
// levels compress marginally better but cost much more CPU per request.
// We fall back to gzip for the rare client that doesn't advertise br.
function jsonResponse(payload: unknown, acceptEncoding: string | null) {
  const body = JSON.stringify(payload);
  if (body.length > 4096 && acceptEncoding) {
    if (acceptEncoding.includes("br")) {
      const br = brotliCompressSync(body, {
        params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 4 },
      });
      return new Response(br, {
        status: 200,
        headers: {
          "content-type": "application/json",
          "content-encoding": "br",
          "content-length": String(br.length),
        },
      });
    }
    if (acceptEncoding.includes("gzip")) {
      const gz = gzipSync(body);
      return new Response(gz, {
        status: 200,
        headers: {
          "content-type": "application/json",
          "content-encoding": "gzip",
          "content-length": String(gz.length),
        },
      });
    }
  }
  return new Response(body, {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

type Body =
  | { type: "overview"; filters: Filters; approvalFlags?: ApprovalFlagsPayload | null }
  | { type: "map"; filters: Filters; approvalFlags?: ApprovalFlagsPayload | null }
  | { type: "by_ids"; ids: number[] }
  | {
      type: "list";
      filters: Filters;
      sortCol: string;
      asc: boolean;
      page: number;
      pageSize: number;
      approvalFlags?: ApprovalFlagsPayload | null;
    }
  | { type: "category_stats"; topN: number; minCount: number }
  | {
      type: "top_categories";
      filters: Filters;
      topN: number;
      approvalFlags?: ApprovalFlagsPayload | null;
    }
  | {
      type: "column";
      filters: Filters;
      col: string;
      topN: number;
      approvalFlags?: ApprovalFlagsPayload | null;
    };

export async function POST(request: Request) {
  const supabase = await createDataClient();
  const body = (await request.json()) as Body;
  const acceptEncoding = request.headers.get("accept-encoding");

  try {
    switch (body.type) {
      case "overview":
        return jsonResponse(
          await fetchOverview(supabase, body.filters, body.approvalFlags),
          acceptEncoding,
        );
      case "map":
        return jsonResponse(
          await fetchMapPointArrays(supabase, body.filters, body.approvalFlags),
          acceptEncoding,
        );
      case "by_ids":
        return jsonResponse(
          { rows: await fetchRestaurantsByIds(supabase, body.ids) },
          acceptEncoding,
        );
      case "list":
        return jsonResponse(
          await fetchList(
            supabase,
            body.filters,
            {
              sortCol: body.sortCol,
              asc: body.asc,
              page: body.page,
              pageSize: body.pageSize,
            },
            body.approvalFlags,
          ),
          acceptEncoding,
        );
      case "category_stats":
        return jsonResponse(
          { rows: await fetchCategoryStats(supabase, body.topN, body.minCount) },
          acceptEncoding,
        );
      case "top_categories":
        return jsonResponse(
          {
            rows: await fetchTopCategories(
              supabase,
              body.filters,
              body.topN,
              body.approvalFlags,
            ),
          },
          acceptEncoding,
        );
      case "column":
        return jsonResponse(
          await fetchColumnValues(
            supabase,
            body.filters,
            body.col,
            body.topN,
            body.approvalFlags,
          ),
          acceptEncoding,
        );
      default:
        return NextResponse.json(
          { error: "unknown query type" },
          { status: 400 },
        );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "query failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
