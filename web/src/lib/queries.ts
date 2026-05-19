import type { SupabaseClient } from "@supabase/supabase-js";
import { applyFilters, filtersToRpcArgs } from "./filters";
import type { Filters, Restaurant } from "./types";

const LIST_COLS =
  "id,name,address,city,province,postal_code,country,latitude,longitude," +
  "website,phone,category,categories,cat_list,rating,ratings,price_range," +
  "price_bucket,position,link,is_chain,dataset,location_name";

const MAP_COLS = "id,name,city,province,latitude,longitude,rating,ratings,price_bucket";

export type OverviewStats = {
  total: number;
  cities: number;
  provinces: number;
  avgRating: number | null;
  totalReviews: number;
  scoreBuckets: { bucket: number; count: number }[];
  reviewBuckets: { bucket: number; count: number }[];
  topCities: { city: string; count: number }[];
  topProvinces: { province: string; count: number }[];
  priceBreakdown: { price: string; count: number }[];
};

// One round trip, server-side aggregation.
export async function fetchOverview(
  supabase: SupabaseClient,
  filters: Filters,
): Promise<OverviewStats> {
  const { data, error } = await supabase.rpc(
    "restaurants_overview",
    filtersToRpcArgs(filters),
  );
  if (error) throw error;
  return (data ?? {
    total: 0,
    cities: 0,
    provinces: 0,
    avgRating: null,
    totalReviews: 0,
    scoreBuckets: [],
    reviewBuckets: [],
    topCities: [],
    topProvinces: [],
    priceBreakdown: [],
  }) as OverviewStats;
}

// Map: server-side LIMIT, slim columns. Default 3000 is enough to read at a
// glance; the map tab exposes a "More points" control if the user wants more.
export async function fetchMapPoints(
  supabase: SupabaseClient,
  filters: Filters,
  limit = 3000,
) {
  const q = applyFilters(
    supabase
      .from("restaurants")
      .select(MAP_COLS)
      .not("latitude", "is", null)
      .not("longitude", "is", null)
      .limit(limit),
    filters,
  );
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function fetchList(
  supabase: SupabaseClient,
  filters: Filters,
  opts: {
    sortCol: string;
    asc: boolean;
    page: number;
    pageSize: number;
  },
): Promise<{ rows: Restaurant[]; total: number }> {
  const from = (opts.page - 1) * opts.pageSize;
  const to = from + opts.pageSize - 1;
  // count=estimated avoids a full sequential count on every page change;
  // PostgREST returns the planner's estimate.
  const q = applyFilters(
    supabase
      .from("restaurants")
      .select(LIST_COLS, { count: "estimated" })
      .order(opts.sortCol, { ascending: opts.asc, nullsFirst: false })
      .range(from, to),
    filters,
  );
  const { data, count, error } = await q;
  if (error) throw error;
  return { rows: (data ?? []) as unknown as Restaurant[], total: count ?? 0 };
}

export async function fetchCategoryStats(
  supabase: SupabaseClient,
  topN: number,
  minCount: number,
) {
  const { data, error } = await supabase.rpc("restaurants_category_stats", {
    p_min_count: minCount,
    p_limit: topN,
  });
  if (error) throw error;
  return (data ?? []) as Array<{
    category: string;
    count: number;
    avg_rating: number;
  }>;
}

export async function fetchTopCategories(
  supabase: SupabaseClient,
  filters: Filters,
  topN: number,
) {
  const { data, error } = await supabase.rpc("restaurants_top_categories", {
    ...filtersToRpcArgs(filters),
    p_limit: topN,
  });
  if (error) throw error;
  return (data ?? []) as Array<{ category: string; count: number }>;
}

export type Facets = {
  provinces: string[];
  priceBuckets: string[];
  topCategories: string[];
};

export async function fetchFacets(supabase: SupabaseClient): Promise<Facets> {
  const { data, error } = await supabase.rpc("restaurants_facets");
  if (error) throw error;
  return (data ?? { provinces: [], priceBuckets: [], topCategories: [] }) as Facets;
}

export async function fetchCities(
  supabase: SupabaseClient,
  province: string | null,
): Promise<string[]> {
  const { data, error } = await supabase.rpc("restaurants_cities", {
    p_province: province,
  });
  if (error) throw error;
  return (data ?? []) as string[];
}

export async function fetchColumnValues(
  supabase: SupabaseClient,
  filters: Filters,
  col: string,
  topN: number,
) {
  const { data, error } = await supabase.rpc("restaurants_column_stats", {
    ...filtersToRpcArgs(filters),
    p_column: col,
    p_limit: topN,
  });
  if (error) throw error;
  return (data ?? {
    total: 0,
    nonNull: 0,
    unique: 0,
    top: [],
  }) as {
    total: number;
    nonNull: number;
    unique: number;
    top: { value: string; count: number }[];
  };
}
