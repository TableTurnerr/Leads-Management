import { NextResponse } from "next/server";
import { gzipSync } from "node:zlib";
import { createClient } from "@/lib/supabase/server";
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

// Next.js dev mode doesn't gzip its responses. The unfiltered map payload
// is several megabytes of JSON over a Singapore round trip — compressing
// it here cuts wire time roughly 5x.
function jsonResponse(payload: unknown, acceptEncoding: string | null) {
  const body = JSON.stringify(payload);
  if (body.length > 4096 && acceptEncoding?.includes("gzip")) {
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
  return new Response(body, {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

type Body =
  | { type: "overview"; filters: Filters }
  | { type: "map"; filters: Filters }
  | { type: "by_ids"; ids: number[] }
  | {
      type: "list";
      filters: Filters;
      sortCol: string;
      asc: boolean;
      page: number;
      pageSize: number;
    }
  | { type: "category_stats"; topN: number; minCount: number }
  | { type: "top_categories"; filters: Filters; topN: number }
  | { type: "column"; filters: Filters; col: string; topN: number };

export async function POST(request: Request) {
  const supabase = await createClient();
  const body = (await request.json()) as Body;
  const acceptEncoding = request.headers.get("accept-encoding");

  try {
    switch (body.type) {
      case "overview":
        return jsonResponse(await fetchOverview(supabase, body.filters), acceptEncoding);
      case "map":
        return jsonResponse(
          await fetchMapPointArrays(supabase, body.filters),
          acceptEncoding,
        );
      case "by_ids":
        return jsonResponse(
          { rows: await fetchRestaurantsByIds(supabase, body.ids) },
          acceptEncoding,
        );
      case "list":
        return jsonResponse(
          await fetchList(supabase, body.filters, {
            sortCol: body.sortCol,
            asc: body.asc,
            page: body.page,
            pageSize: body.pageSize,
          }),
          acceptEncoding,
        );
      case "category_stats":
        return jsonResponse(
          { rows: await fetchCategoryStats(supabase, body.topN, body.minCount) },
          acceptEncoding,
        );
      case "top_categories":
        return jsonResponse(
          { rows: await fetchTopCategories(supabase, body.filters, body.topN) },
          acceptEncoding,
        );
      case "column":
        return jsonResponse(
          await fetchColumnValues(supabase, body.filters, body.col, body.topN),
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
