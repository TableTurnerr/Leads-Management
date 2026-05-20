export type Restaurant = {
  id: number;
  name: string;
  address: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  website: string | null;
  phone: string | null;
  category: string | null;
  categories: string | null;
  cat_list: string[];
  rating: number | null;
  ratings: number | null;
  price_range: string | null;
  price_bucket: string | null;
  position: number | null;
  link: string | null;
  images: string | null;
  geo_coordinates: string | null;
  time_zone: string | null;
  keys: string | null;
  location_name: string | null;
  is_chain: boolean;
  dataset: string;
};

// What policy to apply to rows whose `rating` column is null.
//   "include" — keep them regardless of the score-range bounds
//   "exclude" — drop them unless the score range is the full 0–5 default
//   "only"    — keep only null-rated rows (useful for data-quality audits)
export type RatingNullPolicy = "include" | "exclude" | "only";

export type LeadStatus =
  | "approved"
  | "rejected"
  | "skipped"
  | "pending"
  | "downloaded"
  | "sentToSheets";

export const ALL_LEAD_STATUSES: LeadStatus[] = [
  "approved",
  "rejected",
  "skipped",
  "pending",
  "downloaded",
  "sentToSheets",
];

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  approved: "Approved",
  rejected: "Rejected",
  skipped: "Skipped",
  pending: "Pending",
  downloaded: "Downloaded",
  sentToSheets: "Sent to Sheets",
};

// Each top-level key on `enabled` corresponds to a filter group. When a key
// is false the filter is "ignored" — its values are preserved in state so
// the user can re-enable without re-entering, but no predicate is applied.
export type FilterEnabled = {
  provinces: boolean;
  city: boolean;
  categories: boolean;
  excludeCategories: boolean;
  score: boolean;
  reviews: boolean;
  priceBuckets: boolean;
  isChain: boolean;
  hasPhone: boolean;
  hasWebsite: boolean;
  hasAddress: boolean;
  hasCoordinates: boolean;
  search: boolean;
  leadStatuses: boolean;
};

export type Filters = {
  provinces: string[];
  city: string | null;
  categories: string[];
  excludeCategories: string[];
  scoreMin: number;
  scoreMax: number;
  ratingNullPolicy: RatingNullPolicy;
  minReviews: number;
  maxReviews: number | null;
  priceBuckets: string[];
  isChainOnly: boolean | null;
  hasPhone: boolean | null;
  hasWebsite: boolean | null;
  hasAddress: boolean | null;
  hasCoordinates: boolean | null;
  search: string;
  leadStatuses: LeadStatus[];
  enabled: FilterEnabled;
};

export type MapPointArrays = {
  id: number[];
  lat: number[];
  lon: number[];
  rating: (number | null)[];
  count: number;
};

export const DEFAULT_ENABLED: FilterEnabled = {
  provinces: true,
  city: true,
  categories: true,
  excludeCategories: true,
  score: true,
  reviews: true,
  priceBuckets: true,
  isChain: true,
  hasPhone: true,
  hasWebsite: true,
  hasAddress: true,
  hasCoordinates: true,
  search: true,
  leadStatuses: true,
};

export const DEFAULT_FILTERS: Filters = {
  provinces: [],
  city: null,
  categories: [],
  excludeCategories: [],
  scoreMin: 0,
  scoreMax: 5,
  ratingNullPolicy: "include",
  minReviews: 0,
  maxReviews: null,
  priceBuckets: [],
  isChainOnly: false,
  hasPhone: null,
  hasWebsite: null,
  hasAddress: null,
  hasCoordinates: null,
  search: "",
  leadStatuses: [],
  enabled: DEFAULT_ENABLED,
};
