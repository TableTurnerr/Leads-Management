import type { SupabaseClient } from "@supabase/supabase-js";
import { applyFilters } from "./filters";
import type { Filters, Restaurant } from "./types";

const ALL_COLS =
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

// ─── small helper: bucket a numeric column ────────────────────────────────────
function bucketNumeric(values: number[], nbins: number, log = false) {
  if (!values.length) return [];
  let xs = values.slice();
  if (log) xs = xs.map((v) => Math.log10(Math.max(1, v)));
  const min = Math.min(...xs);
  const max = Math.max(...xs);
  if (min === max) return [{ bucket: min, count: xs.length }];
  const step = (max - min) / nbins;
  const counts = new Array(nbins).fill(0) as number[];
  for (const v of xs) {
    const idx = Math.min(nbins - 1, Math.floor((v - min) / step));
    counts[idx] += 1;
  }
  return counts.map((c, i) => ({
    bucket: log ? Math.pow(10, min + (i + 0.5) * step) : min + (i + 0.5) * step,
    count: c,
  }));
}

// ─── overview stats ──────────────────────────────────────────────────────────
export async function fetchOverview(
  supabase: SupabaseClient,
  filters: Filters,
): Promise<OverviewStats> {
  // total count
  const countQ = applyFilters(
    supabase.from("restaurants").select("id", { count: "exact", head: true }),
    filters,
  );
  const { count: total = 0 } = await countQ;

  // sample for charts (cap to keep payload small)
  const sampleSize = 5000;
  const sampleQ = applyFilters(
    supabase
      .from("restaurants")
      .select("rating,ratings,price_bucket,city,province")
      .limit(sampleSize),
    filters,
  );
  const { data: sample = [] } = await sampleQ;

  const rows = (sample ?? []) as Array<{
    rating: number | null;
    ratings: number | null;
    price_bucket: string | null;
    city: string | null;
    province: string | null;
  }>;

  const ratings = rows
    .map((r) => r.rating)
    .filter((v): v is number => v != null);
  const reviews = rows
    .map((r) => r.ratings)
    .filter((v): v is number => v != null);

  const avgRating = ratings.length
    ? ratings.reduce((a, b) => a + b, 0) / ratings.length
    : null;
  const totalReviews = reviews.reduce((a, b) => a + b, 0);

  const cityCounts = new Map<string, number>();
  const provCounts = new Map<string, number>();
  const priceCounts = new Map<string, number>();
  for (const r of rows) {
    if (r.city) cityCounts.set(r.city, (cityCounts.get(r.city) ?? 0) + 1);
    if (r.province)
      provCounts.set(r.province, (provCounts.get(r.province) ?? 0) + 1);
    const p = r.price_bucket ?? "Unknown";
    priceCounts.set(p, (priceCounts.get(p) ?? 0) + 1);
  }
  const toSortedArr = <K extends string>(m: Map<string, number>, key: K, n: number) =>
    Array.from(m.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([k, v]) => ({ [key]: k, count: v }) as { [P in K]: string } & { count: number });

  return {
    total: total ?? 0,
    cities: cityCounts.size,
    provinces: provCounts.size,
    avgRating,
    totalReviews,
    scoreBuckets: bucketNumeric(ratings, 40),
    reviewBuckets: bucketNumeric(reviews, 40, true),
    topCities: toSortedArr(cityCounts, "city", 15),
    topProvinces: toSortedArr(provCounts, "province", 20),
    priceBreakdown: toSortedArr(priceCounts, "price", 6).filter(
      (r) => r.price !== "Unknown",
    ),
  };
}

// ─── map points ──────────────────────────────────────────────────────────────
export async function fetchMapPoints(
  supabase: SupabaseClient,
  filters: Filters,
  limit = 10000,
) {
  const q = applyFilters(
    supabase
      .from("restaurants")
      .select(
        "id,name,city,latitude,longitude,rating,ratings,price_bucket,country,province",
      )
      .not("latitude", "is", null)
      .not("longitude", "is", null)
      .limit(limit),
    filters,
  );
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

// ─── paginated list (Data Table tab) ─────────────────────────────────────────
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
  const q = applyFilters(
    supabase
      .from("restaurants")
      .select(ALL_COLS, { count: "exact" })
      .order(opts.sortCol, { ascending: opts.asc, nullsFirst: false })
      .range(from, to),
    filters,
  );
  const { data, count, error } = await q;
  if (error) throw error;
  return { rows: (data ?? []) as unknown as Restaurant[], total: count ?? 0 };
}

// ─── categories ──────────────────────────────────────────────────────────────
export async function fetchCategoryStats(
  supabase: SupabaseClient,
  topN: number,
  minCount: number,
) {
  // Use the RPC defined in the migration
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
  // Count categories from a sample with current filters applied
  const q = applyFilters(
    supabase.from("restaurants").select("cat_list").limit(20000),
    filters,
  );
  const { data, error } = await q;
  if (error) throw error;
  const counts = new Map<string, number>();
  for (const row of (data ?? []) as { cat_list: string[] }[]) {
    for (const c of row.cat_list ?? []) {
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([category, count]) => ({ category, count }));
}

// ─── facets (sidebar populating) ─────────────────────────────────────────────
export async function fetchFacets(supabase: SupabaseClient) {
  const [{ data: provinces }, { data: priceData }] = await Promise.all([
    supabase
      .from("restaurants")
      .select("province")
      .not("province", "is", null)
      .limit(50000),
    supabase
      .from("restaurants")
      .select("price_bucket")
      .not("price_bucket", "is", null)
      .limit(20000),
  ]);

  const provinceSet = new Set<string>(
    (provinces ?? []).map((r: { province: string }) => r.province).filter(Boolean),
  );
  const priceSet = new Set<string>(
    (priceData ?? []).map((r: { price_bucket: string }) => r.price_bucket).filter(Boolean),
  );

  // top categories across the whole dataset (sampled)
  const { data: catSample } = await supabase
    .from("restaurants")
    .select("cat_list")
    .limit(20000);
  const catCounts = new Map<string, number>();
  const catRows = (catSample ?? []) as unknown as { cat_list: string[] }[];
  for (const row of catRows) {
    for (const c of row.cat_list ?? []) {
      catCounts.set(c, (catCounts.get(c) ?? 0) + 1);
    }
  }
  const topCategories = Array.from(catCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 60)
    .map(([c]) => c);

  return {
    provinces: Array.from(provinceSet).sort(),
    priceBuckets: Array.from(priceSet),
    topCategories,
  };
}

export async function fetchCities(
  supabase: SupabaseClient,
  province: string | null,
) {
  let q = supabase
    .from("restaurants")
    .select("city")
    .not("city", "is", null)
    .limit(50000);
  if (province) q = q.eq("province", province);
  const { data } = await q;
  const set = new Set<string>(
    (data ?? []).map((r: { city: string }) => r.city).filter(Boolean),
  );
  return Array.from(set).sort();
}

// ─── column explorer ─────────────────────────────────────────────────────────
export async function fetchColumnValues(
  supabase: SupabaseClient,
  filters: Filters,
  col: string,
  topN: number,
) {
  const q = applyFilters(
    supabase
      .from("restaurants")
      .select(col)
      .limit(20000),
    filters,
  );
  const { data } = await q;
  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  const counts = new Map<string, number>();
  let nonNull = 0;
  for (const r of rows) {
    const v = r[col];
    if (v == null || v === "") continue;
    nonNull += 1;
    const k = String(v);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const top = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([value, count]) => ({ value, count }));
  return {
    total: rows.length,
    nonNull,
    unique: counts.size,
    top,
  };
}
