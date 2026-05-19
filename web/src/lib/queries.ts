import type { SupabaseClient } from "@supabase/supabase-js";
import { applyFilters, filtersToRpcArgs } from "./filters";
import type { Filters, MapPointArrays, Restaurant } from "./types";

// Slim column set — only what the visible table renders, plus id for keys
// and joins. Fetching the wide row (cat_list, categories, location_name,
// link, etc.) doubled wire size for no UI benefit; the Selected tab and
// Sheets export hit fetchRestaurantsByIds for the full payload on demand.
const LIST_COLS =
  "id,name,address,city,province,category," +
  "rating,ratings,price_bucket,website,phone";

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

// Map: a single RPC that returns six parallel arrays for every point
// matching the active filters. The unfiltered case (the common path) is
// served from a cached row in public.map_cache, refreshed by the ingest
// script — sub-50ms server side. Filtered queries fall through to live
// compute. The RPC route is required: PostgREST's db-max-rows caps direct
// table queries at 1000 rows on this project, and a single jsonb return
// value sidesteps that.
export async function fetchMapPointArrays(
  supabase: SupabaseClient,
  filters: Filters,
): Promise<MapPointArrays> {
  const { data, error } = await supabase.rpc(
    "restaurants_map_points",
    filtersToRpcArgs(filters),
  );
  if (error) throw error;
  return (data ?? {
    id: [],
    name: [],
    lat: [],
    lon: [],
    rating: [],
    ratings: [],
    count: 0,
  }) as MapPointArrays;
}

export async function fetchRestaurantsByIds(
  supabase: SupabaseClient,
  ids: number[],
): Promise<Restaurant[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase.rpc("restaurants_by_ids", {
    p_ids: ids,
  });
  if (error) throw error;
  return (data ?? []) as Restaurant[];
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
