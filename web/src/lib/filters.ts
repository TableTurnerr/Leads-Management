import { ALL_APPROVAL_STATUSES, type Filters, type ApprovalStatus } from "./types";

export type ApprovalFlagsPayload = {
  statuses: ApprovalStatus[];
  approvedIds: number[];
  rejectedIds: number[];
  skippedIds: number[];
  downloadedIds: number[];
  sentToSheetsIds: number[];
};

// True when the approval-status selection would narrow results given the current
// per-bucket ID arrays. Returning false here lets callers pass null params and
// keep the server-side cache fast-path eligible — the default selection
// (everything except "rejected") is a no-op until the user actually rejects
// at least one lead.
export function approvalFlagsNarrowsResults(
  selected: ApprovalStatus[],
  flags: Omit<ApprovalFlagsPayload, "statuses">,
): boolean {
  if (selected.length === 0) return false;
  if (selected.length === ALL_APPROVAL_STATUSES.length) return false;
  for (const s of ALL_APPROVAL_STATUSES) {
    if (selected.includes(s)) continue;
    if (s === "pending") return true;
    if (s === "approved"     && flags.approvedIds.length     > 0) return true;
    if (s === "rejected"     && flags.rejectedIds.length     > 0) return true;
    if (s === "skipped"      && flags.skippedIds.length      > 0) return true;
    if (s === "downloaded"   && flags.downloadedIds.length   > 0) return true;
    if (s === "sentToSheets" && flags.sentToSheetsIds.length > 0) return true;
  }
  return false;
}

export function approvalFlagsToRpcArgs(payload: ApprovalFlagsPayload | null | undefined) {
  const empty = {
    p_approval_statuses:      null,
    p_approved_ids:       null,
    p_rejected_ids:       null,
    p_skipped_ids:        null,
    p_downloaded_ids:     null,
    p_sent_to_sheets_ids: null,
  };
  if (!payload) return empty;
  const { statuses } = payload;
  if (!approvalFlagsNarrowsResults(statuses, payload)) return empty;
  return {
    p_approval_statuses:      statuses,
    p_approved_ids:       payload.approvedIds.length     ? payload.approvedIds     : null,
    p_rejected_ids:       payload.rejectedIds.length     ? payload.rejectedIds     : null,
    p_skipped_ids:        payload.skippedIds.length      ? payload.skippedIds      : null,
    p_downloaded_ids:     payload.downloadedIds.length   ? payload.downloadedIds   : null,
    p_sent_to_sheets_ids: payload.sentToSheetsIds.length ? payload.sentToSheetsIds : null,
  };
}

// Returns a copy of `filters` with every disabled group reset to its default
// "no-op" value. Downstream code (both RPC args and PostgREST builder) only
// has to look at the resolved values, never the `enabled` flags.
export function resolveFilters(filters: Filters): Filters {
  const en = filters.enabled;
  return {
    ...filters,
    provinces:         en.provinces         ? filters.provinces         : [],
    city:              en.city              ? filters.city              : null,
    categories:        en.categories        ? filters.categories        : [],
    excludeCategories: en.excludeCategories ? filters.excludeCategories : [],
    scoreMin:          en.score             ? filters.scoreMin          : 0,
    scoreMax:          en.score             ? filters.scoreMax          : 5,
    ratingNullPolicy:  en.score             ? filters.ratingNullPolicy  : "include",
    minReviews:        en.reviews           ? filters.minReviews        : 0,
    maxReviews:        en.reviews           ? filters.maxReviews        : null,
    priceBuckets:      en.priceBuckets      ? filters.priceBuckets      : [],
    isChainOnly:       en.isChain           ? filters.isChainOnly       : null,
    hasPhone:          en.hasPhone          ? filters.hasPhone          : null,
    hasWebsite:        en.hasWebsite        ? filters.hasWebsite        : null,
    hasAddress:        en.hasAddress        ? filters.hasAddress        : null,
    hasCoordinates:    en.hasCoordinates    ? filters.hasCoordinates    : null,
    search:            en.search            ? filters.search            : "",
  };
}

// Note: only used by the table list-page query path. The map and overview go
// through filtersToRpcArgs so the SQL stays in one place.
export function applyFilters<T>(query: T, filters: Filters): T {
  const f = resolveFilters(filters);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = query as any;

  if (f.provinces.length > 0) q = q.in("province", f.provinces);
  if (f.city) q = q.eq("city", f.city);

  if (f.categories.length > 0) q = q.overlaps("cat_list", f.categories);
  if (f.excludeCategories.length > 0) {
    // PostgREST: "not.ov" => not overlaps. Quoting per the docs format.
    q = q.not("cat_list", "ov", `{${f.excludeCategories.map(escapeArrayElem).join(",")}}`);
  }

  if (f.priceBuckets.length > 0) q = q.in("price_bucket", f.priceBuckets);
  if (f.isChainOnly === true) q = q.eq("is_chain", true);
  if (f.isChainOnly === false) q = q.eq("is_chain", false);

  if (f.hasPhone === true)   q = q.not("phone",   "is", null);
  if (f.hasPhone === false)  q = q.is("phone",   null);
  if (f.hasWebsite === true) q = q.not("website", "is", null);
  if (f.hasWebsite === false)q = q.is("website", null);
  if (f.hasAddress === true) q = q.not("address", "is", null);
  if (f.hasAddress === false)q = q.is("address", null);
  if (f.hasCoordinates === true)  q = q.not("latitude", "is", null);
  if (f.hasCoordinates === false) q = q.is("latitude", null);

  if (f.minReviews > 0) q = q.gte("ratings", f.minReviews);
  if (f.maxReviews != null && f.maxReviews >= 0) q = q.lte("ratings", f.maxReviews);

  // Score range + null policy combine into one OR clause so PostgREST can
  // push it down. We always emit it explicitly so the SQL is deterministic.
  const scoreActive = f.scoreMin > 0 || f.scoreMax < 5;
  if (f.ratingNullPolicy === "only") {
    q = q.is("rating", null);
  } else if (scoreActive) {
    if (f.ratingNullPolicy === "include") {
      q = q.or(
        `rating.is.null,and(rating.gte.${f.scoreMin},rating.lte.${f.scoreMax})`,
      );
    } else {
      q = q.gte("rating", f.scoreMin).lte("rating", f.scoreMax);
    }
  } else if (f.ratingNullPolicy === "exclude") {
    q = q.not("rating", "is", null);
  }

  if (f.search.trim()) {
    const s = f.search.trim().replace(/[%_]/g, "\\$&");
    q = q.ilike("name", `%${s}%`);
  }

  return q as T;
}

function escapeArrayElem(s: string) {
  // PostgreSQL array literal element quoting — wrap in double quotes if it
  // contains commas, spaces, or other special chars; double-escape inner ".
  if (/[",{}\\\s]/.test(s)) {
    return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return s;
}

// Translate a Filters object to the named-arg shape the RPCs expect. The
// second arg merges the approval-status RPC params; the filter is gated by
// Filters.enabled.approvalStatuses so a disabled section drops to null/no-op.
export function filtersToRpcArgs(
  filters: Filters,
  approvalFlags?: ApprovalFlagsPayload | null,
) {
  const f = resolveFilters(filters);
  const search = f.search.trim();
  const approvalEnabled = filters.enabled.approvalStatuses;
  const approvalPayload: ApprovalFlagsPayload | null =
    approvalEnabled && approvalFlags
      ? { ...approvalFlags, statuses: filters.approvalStatuses }
      : null;
  return {
    p_provinces:           f.provinces.length         ? f.provinces         : null,
    p_city:                f.city,
    p_categories:          f.categories.length        ? f.categories        : null,
    p_exclude_categories:  f.excludeCategories.length ? f.excludeCategories : null,
    p_price_buckets:       f.priceBuckets.length      ? f.priceBuckets      : null,
    p_chain_only:          f.isChainOnly,
    p_has_phone:           f.hasPhone,
    p_has_website:         f.hasWebsite,
    p_has_address:         f.hasAddress,
    p_has_coordinates:     f.hasCoordinates,
    p_min_reviews:         f.minReviews,
    p_max_reviews:         f.maxReviews,
    p_score_min:           f.scoreMin,
    p_score_max:           f.scoreMax,
    p_rating_null_policy:  f.ratingNullPolicy,
    p_search:              search ? search.replace(/[%_]/g, "\\$&") : null,
    ...approvalFlagsToRpcArgs(approvalPayload),
  };
}
