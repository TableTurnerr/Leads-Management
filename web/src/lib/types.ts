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

export type Filters = {
  province: string | null;
  city: string | null;
  categories: string[];
  scoreMin: number;
  scoreMax: number;
  minReviews: number;
  priceBucket: string | null;
  isChainOnly: boolean | null;
  search: string;
};

export type MapPointArrays = {
  id: number[];
  lat: number[];
  lon: number[];
  rating: (number | null)[];
  count: number;
};

export const DEFAULT_FILTERS: Filters = {
  province: null,
  city: null,
  categories: [],
  scoreMin: 0,
  scoreMax: 5,
  minReviews: 0,
  priceBucket: null,
  isChainOnly: null,
  search: "",
};
