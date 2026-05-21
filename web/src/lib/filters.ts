import { ALL_APPROVAL_STATUSES, type Filters, type ApprovalStatus } from "./types";

export type ApprovalFlagsPayload = {
  includeStatuses: ApprovalStatus[];
  excludeStatuses: ApprovalStatus[];
  approvedIds: number[];
  rejectedIds: number[];
  skippedIds: number[];
  downloadedIds: number[];
  sentToSheetsIds: number[];
};

type FlagBuckets = Omit<ApprovalFlagsPayload, "includeStatuses" | "excludeStatuses">;

// True when the given status list would actually drop any row given the
// current per-bucket ID arrays. "pending" always counts (we cannot bound the
// pending population without scanning), the rest only count if their ID array
// is non-empty.
function statusListIsNonEmpty(
  statuses: ApprovalStatus[],
  flags: FlagBuckets,
): boolean {
  for (const s of statuses) {
    if (s === "pending") return true;
    if (s === "approved"     && flags.approvedIds.length     > 0) return true;
    if (s === "rejected"     && flags.rejectedIds.length     > 0) return true;
    if (s === "skipped"      && flags.skippedIds.length      > 0) return true;
    if (s === "downloaded"   && flags.downloadedIds.length   > 0) return true;
    if (s === "sentToSheets" && flags.sentToSheetsIds.length > 0) return true;
  }
  return false;
}

// Whether the include side narrows results. An include set covering every
// known status is a no-op; otherwise we narrow when at least one of the
// statuses NOT in the include set has rows.
export function includeNarrowsResults(
  include: ApprovalStatus[],
  flags: FlagBuckets,
): boolean {
  if (include.length === 0) return false;
  if (include.length === ALL_APPROVAL_STATUSES.length) return false;
  const missing = ALL_APPROVAL_STATUSES.filter((s) => !include.includes(s));
  return statusListIsNonEmpty(missing, flags);
}

// Whether the exclude side narrows results. The default ["rejected"] is a
// no-op until the user actually rejects at least one lead, which lets the
// server-side cache fast-path stay eligible in the common case.
export function excludeNarrowsResults(
  exclude: ApprovalStatus[],
  flags: FlagBuckets,
): boolean {
  if (exclude.length === 0) return false;
  return statusListIsNonEmpty(exclude, flags);
}

export function approvalFlagsToRpcArgs(payload: ApprovalFlagsPayload | null | undefined) {
  const empty = {
    p_approval_statuses:  null,
    p_approved_ids:       null,
    p_rejected_ids:       null,
    p_skipped_ids:        null,
    p_downloaded_ids:     null,
    p_sent_to_sheets_ids: null,
    p_excluded_statuses:  null,
  };
  if (!payload) return empty;
  const includeNarrows = includeNarrowsResults(payload.includeStatuses, payload);
  const excludeNarrows = excludeNarrowsResults(payload.excludeStatuses, payload);
  if (!includeNarrows && !excludeNarrows) return empty;
  // Both sides reference the same per-status ID arrays in SQL, so we send
  // them unconditionally whenever either side narrows.
  return {
    p_approval_statuses:  includeNarrows ? payload.includeStatuses : null,
    p_approved_ids:       payload.approvedIds.length     ? payload.approvedIds     : null,
    p_rejected_ids:       payload.rejectedIds.length     ? payload.rejectedIds     : null,
    p_skipped_ids:        payload.skippedIds.length      ? payload.skippedIds      : null,
    p_downloaded_ids:     payload.downloadedIds.length   ? payload.downloadedIds   : null,
    p_sent_to_sheets_ids: payload.sentToSheetsIds.length ? payload.sentToSheetsIds : null,
    p_excluded_statuses:  excludeNarrows ? payload.excludeStatuses : null,
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

// Collect every restaurant id whose status set intersects `statuses`. The
// per-bucket ID arrays come from the client (markApproved / markDownloaded
// etc.) so this is the only ground truth the table-list path has for who
// got which status.
function idsMatchingStatuses(
  statuses: ApprovalStatus[],
  flags: ApprovalFlagsPayload,
): number[] {
  const set = new Set<number>();
  if (statuses.includes("approved"))     for (const id of flags.approvedIds)     set.add(id);
  if (statuses.includes("rejected"))     for (const id of flags.rejectedIds)     set.add(id);
  if (statuses.includes("skipped"))      for (const id of flags.skippedIds)      set.add(id);
  if (statuses.includes("downloaded"))   for (const id of flags.downloadedIds)   set.add(id);
  if (statuses.includes("sentToSheets")) for (const id of flags.sentToSheetsIds) set.add(id);
  return [...set];
}

// Pending = no primary status on file (not approved / rejected / skipped).
// Returning the union of every primary bucket lets callers express pending
// via "id not in (primaries)".
function primaryStatusIds(flags: ApprovalFlagsPayload): number[] {
  const set = new Set<number>();
  for (const id of flags.approvedIds) set.add(id);
  for (const id of flags.rejectedIds) set.add(id);
  for (const id of flags.skippedIds)  set.add(id);
  return [...set];
}

// Note: used by the table list-page query path. The map and overview go
// through filtersToRpcArgs so most filter logic lives in SQL; approval
// status is the exception — it relies on per-bucket ID arrays that only
// the client has, so we wire it in here as well.
export function applyFilters<T>(
  query: T,
  filters: Filters,
  approvalFlags?: ApprovalFlagsPayload | null,
): T {
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

  if (filters.enabled.approvalStatuses && approvalFlags) {
    const inc = approvalFlags.includeStatuses;
    const exc = approvalFlags.excludeStatuses;

    // Exclude side: drop rows whose status set intersects `exc`. "Pending"
    // is special — there's no bucket of pending IDs, only the absence of a
    // primary status, so we encode "not pending" as "must be in some
    // primary bucket".
    if (exc.length > 0) {
      const ids = idsMatchingStatuses(exc, approvalFlags);
      if (ids.length > 0) {
        q = q.not("id", "in", `(${ids.join(",")})`);
      }
      if (exc.includes("pending")) {
        const primary = primaryStatusIds(approvalFlags);
        if (primary.length === 0) {
          // Every row is pending → excluding pending wipes the result set.
          q = q.eq("id", -1);
        } else {
          q = q.in("id", primary);
        }
      }
    }

    // Include side: keep only rows that match at least one of `inc`. When
    // pending is present we OR "row has a non-primary status" with "row is
    // in some primary bucket". When pending is the only include we negate
    // the primary set; when pending is absent we restrict to the explicit
    // include IDs.
    if (inc.length > 0) {
      if (inc.includes("pending")) {
        const explicit = idsMatchingStatuses(
          inc.filter((s) => s !== "pending"),
          approvalFlags,
        );
        const primary = primaryStatusIds(approvalFlags);
        if (primary.length === 0) {
          // Everything is pending, so "pending OR …" is a no-op.
        } else if (explicit.length === 0) {
          q = q.not("id", "in", `(${primary.join(",")})`);
        } else {
          q = q.or(
            `id.in.(${explicit.join(",")}),id.not.in.(${primary.join(",")})`,
          );
        }
      } else {
        const ids = idsMatchingStatuses(inc, approvalFlags);
        if (ids.length === 0) {
          // None of the requested statuses have any rows — nothing matches.
          q = q.eq("id", -1);
        } else {
          q = q.in("id", ids);
        }
      }
    }
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
      ? {
          ...approvalFlags,
          includeStatuses: filters.includeApprovalStatuses,
          excludeStatuses: filters.excludeApprovalStatuses,
        }
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
