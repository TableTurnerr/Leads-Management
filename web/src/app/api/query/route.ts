import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  fetchOverview,
  fetchMapPoints,
  fetchList,
  fetchCategoryStats,
  fetchTopCategories,
  fetchColumnValues,
} from "@/lib/queries";
import type { Filters } from "@/lib/types";

type Body =
  | { type: "overview"; filters: Filters }
  | { type: "map"; filters: Filters }
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

  try {
    switch (body.type) {
      case "overview":
        return NextResponse.json(await fetchOverview(supabase, body.filters));
      case "map":
        return NextResponse.json({
          points: await fetchMapPoints(supabase, body.filters),
        });
      case "list":
        return NextResponse.json(
          await fetchList(supabase, body.filters, {
            sortCol: body.sortCol,
            asc: body.asc,
            page: body.page,
            pageSize: body.pageSize,
          }),
        );
      case "category_stats":
        return NextResponse.json({
          rows: await fetchCategoryStats(supabase, body.topN, body.minCount),
        });
      case "top_categories":
        return NextResponse.json({
          rows: await fetchTopCategories(supabase, body.filters, body.topN),
        });
      case "column":
        return NextResponse.json(
          await fetchColumnValues(supabase, body.filters, body.col, body.topN),
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
