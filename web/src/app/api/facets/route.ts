import { NextResponse } from "next/server";
import { createDataClient } from "@/lib/supabase/server";
import { fetchFacets, fetchCities } from "@/lib/queries";

export async function GET(request: Request) {
  const supabase = await createDataClient();
  const { searchParams } = new URL(request.url);
  const province = searchParams.get("province");

  if (province !== null) {
    const cities = await fetchCities(supabase, province || null);
    return NextResponse.json({ cities });
  }

  const facets = await fetchFacets(supabase);
  return NextResponse.json(facets);
}
