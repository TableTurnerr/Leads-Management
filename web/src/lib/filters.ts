import type { SupabaseClient } from "@supabase/supabase-js";
import type { Filters } from "./types";

/**
 * Apply a Filters object to a PostgREST query builder. Returns the same
 * builder so calls can be chained. The Supabase client doesn't expose its
 * query-builder type publicly enough to type strictly, so this stays
 * loosely typed.
 */
export function applyFilters<T>(query: T, filters: Filters): T {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = query as any;

  if (filters.province) q = q.eq("province", filters.province);
  if (filters.city) q = q.eq("city", filters.city);

  if (filters.categories.length > 0) {
    q = q.overlaps("cat_list", filters.categories);
  }

  if (filters.priceBucket) q = q.eq("price_bucket", filters.priceBucket);
  if (filters.isChainOnly === true) q = q.eq("is_chain", true);
  if (filters.isChainOnly === false) q = q.eq("is_chain", false);

  if (filters.minReviews > 0) q = q.gte("ratings", filters.minReviews);

  // rating filter: include null ratings (matches the Streamlit "~has_score" logic)
  if (filters.scoreMin > 0 || filters.scoreMax < 5) {
    q = q
      .or(
        `rating.is.null,and(rating.gte.${filters.scoreMin},rating.lte.${filters.scoreMax})`,
      );
  }

  if (filters.search.trim()) {
    const s = filters.search.trim().replace(/[%_]/g, "\\$&");
    q = q.ilike("name", `%${s}%`);
  }

  return q as T;
}

export function buildSupabaseClient(
  supabase: SupabaseClient,
  filters: Filters,
) {
  return applyFilters(supabase.from("restaurants").select("*"), filters);
}
