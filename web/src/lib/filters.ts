import type { Filters } from "./types";

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

  if (filters.scoreMin > 0 || filters.scoreMax < 5) {
    q = q.or(
      `rating.is.null,and(rating.gte.${filters.scoreMin},rating.lte.${filters.scoreMax})`,
    );
  }

  if (filters.search.trim()) {
    const s = filters.search.trim().replace(/[%_]/g, "\\$&");
    q = q.ilike("name", `%${s}%`);
  }

  return q as T;
}

// Translate a Filters object to the named-arg shape the RPCs expect. Null
// values are sent as null so the SQL's `is null or ...` short-circuits.
export function filtersToRpcArgs(filters: Filters) {
  const search = filters.search.trim();
  return {
    p_province:     filters.province,
    p_city:         filters.city,
    p_categories:   filters.categories.length ? filters.categories : null,
    p_price_bucket: filters.priceBucket,
    p_chain_only:   filters.isChainOnly,
    p_min_reviews:  filters.minReviews,
    p_score_min:    filters.scoreMin,
    p_score_max:    filters.scoreMax,
    p_search:       search ? search.replace(/[%_]/g, "\\$&") : null,
  };
}
