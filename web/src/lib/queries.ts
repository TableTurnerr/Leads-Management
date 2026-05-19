import type { SupabaseClient } from "@supabase/supabase-js";
import { applyFilters, filtersToRpcArgs } from "./filters";
import type { Filters, MapPointArrays, Restaurant } from "./types";

const LIST_COLS =
  "id,name,address,city,province,postal_code,country,latitude,longitude," +
  "website,phone,category,categories,cat_list,rating,ratings,price_range," +
  "price_bucket,position,link,is_chain,dataset,location_name";

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

// Map: direct PostgREST query over the partial covering index
// (idx_restaurants_map_cover). The index-only scan returns every matching
// row in ~1.5s on the unfiltered ~144k case, vs ~6s if we ask Postgres to
// jsonb_agg the same data. We transform rows → columnar arrays in Node so
// Plotly can pass the arrays straight to a single scattermapbox trace.
const MAP_COLS = "id,name,latitude,longitude,rating,ratings";

type MapRow = {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  rating: number | null;
  ratings: number | null;
};

export async function fetchMapPointArrays(
  supabase: SupabaseClient,
  filters: Filters,
): Promise<MapPointArrays> {
  const q = applyFilters(
    supabase
      .from("restaurants")
      .select(MAP_COLS)
      .not("latitude", "is", null)
      .not("longitude", "is", null)
      .limit(200000),
    filters,
  );
  const { data, error } = await q;
  if (error) throw error;

  const rows = (data ?? []) as unknown as MapRow[];
  const n = rows.length;
  const id = new Array<number>(n);
  const name = new Array<string>(n);
  const lat = new Array<number>(n);
  const lon = new Array<number>(n);
  const rating = new Array<number | null>(n);
  const ratings = new Array<number | null>(n);
  for (let i = 0; i < n; i++) {
    const r = rows[i];
    id[i] = r.id;
    name[i] = r.name;
    lat[i] = r.latitude;
    lon[i] = r.longitude;
    rating[i] = r.rating;
    ratings[i] = r.ratings;
  }
  return { id, name, lat, lon, rating, ratings, count: n };
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
