// Public listing types + pure helpers shared by client and server.
// Data comes from the database via src/lib/public-listings.functions.ts —
// this module intentionally contains NO listing data.

export type ListingType = "rent" | "sale";
/** Mirrors the DB enum `public.property_type`. */
export type PropertyType = "room" | "studio" | "apartment" | "house" | "pg" | "other";
/** Mirrors the DB enum `public.furnishing`. */
export type Furnishing = "furnished" | "semi" | "unfurnished";

export const PROPERTY_TYPES: PropertyType[] = [
  "room",
  "studio",
  "apartment",
  "house",
  "pg",
  "other",
];
export const FURNISHINGS: Furnishing[] = ["furnished", "semi", "unfurnished"];

export const PROPERTY_TYPE_LABEL: Record<PropertyType, string> = {
  room: "Room",
  studio: "Studio",
  apartment: "Apartment",
  house: "House",
  pg: "PG",
  other: "Other",
};

export const PROPERTY_TYPE_ICON: Record<PropertyType, string> = {
  room: "🚪",
  studio: "🛋️",
  apartment: "🏢",
  house: "🏡",
  pg: "🛏️",
  other: "🏠",
};

export const FURNISHING_LABEL: Record<Furnishing, string> = {
  furnished: "Furnished",
  semi: "Semi-furnished",
  unfurnished: "Unfurnished",
};

export interface NearbyPlace {
  label: string;
  lat: number | null;
  lng: number | null;
}

/** Public-safe listing shape. Never contains owner contact details. */
export interface Listing {
  id: string;
  title: string;
  description: string;
  listingType: ListingType;
  propertyType: PropertyType;
  /** Monthly rent (rent) or total price (sale), INR. */
  price: number;
  deposit: number | null;
  beds: number;
  baths: number;
  areaSqft: number | null;
  furnished: Furnishing;
  amenities: string[];
  /** Cover photo, or the first gallery photo. Null when the owner added none. */
  photo: string | null;
  photos: string[];
  /** First name + last initial, e.g. "Aarti M." */
  ownerName: string;
  ownerVerified: boolean;
  /** ISO timestamp the listing was created. */
  postedAt: string;
  updatedAt: string;
  availableFrom: string | null;
  /** Locality derived from the address (e.g. "Kothrud"). */
  neighborhood: string;
  /** First nearby place the owner listed, if any. */
  landmark: string | null;
  nearby: NearbyPlace[];
  city: string;
  state: string | null;
  lat: number | null;
  lng: number | null;
  isFeatured: boolean;
}

export type GeoListing = Listing & { lat: number; lng: number };

export function hasCoords(l: Listing): l is GeoListing {
  return (
    typeof l.lat === "number" &&
    typeof l.lng === "number" &&
    Number.isFinite(l.lat) &&
    Number.isFinite(l.lng)
  );
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

export function formatMoney(n: number, currency = "₹"): string {
  return `${currency}${Math.round(n).toLocaleString("en-IN")}`;
}

export function isPropertyType(v: unknown): v is PropertyType {
  return typeof v === "string" && (PROPERTY_TYPES as string[]).includes(v);
}

/**
 * Parse a URL `type` param ("any", "room", "room,pg", legacy "flat") into DB
 * enum values. Unknown values are dropped; empty result means "any".
 */
export function parsePropertyTypes(raw: string | undefined | null): PropertyType[] {
  if (!raw || raw === "any") return [];
  const out = new Set<PropertyType>();
  for (const part of raw.split(",")) {
    const v = part.trim().toLowerCase();
    if (v === "flat" || v === "bhk") out.add("apartment");
    else if (isPropertyType(v)) out.add(v);
  }
  return [...out];
}

/** "Aarti Mehta" → "Aarti M." ; falls back to "Owner". */
export function shortOwnerName(full: string | null | undefined): string {
  const parts = (full ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Owner";
  const first = parts[0].slice(0, 40);
  if (parts.length === 1) return first;
  const initial = parts[parts.length - 1].charAt(0).toUpperCase();
  return `${first} ${initial}.`;
}

/** Owner's first name for friendly copy ("Contact Aarti"). */
export function ownerFirstName(l: Pick<Listing, "ownerName">): string {
  return l.ownerName.split(" ")[0] || "owner";
}

function parseNearby(raw: unknown): NearbyPlace[] {
  if (!Array.isArray(raw)) return [];
  const out: NearbyPlace[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const label = typeof r.label === "string" ? r.label.trim() : "";
    if (!label) continue;
    out.push({
      label: label.slice(0, 120),
      lat: typeof r.lat === "number" ? r.lat : null,
      lng: typeof r.lng === "number" ? r.lng : null,
    });
    if (out.length >= 10) break;
  }
  return out;
}

/** Best-effort locality from a free-text address ("12, Sai Heights, Kothrud, Pune 411038" → "Kothrud"). */
export function deriveNeighborhood(
  addressLine: string | null | undefined,
  city: string,
  state?: string | null,
): string {
  const cityL = city.trim().toLowerCase();
  const stateL = (state ?? "").trim().toLowerCase();
  const parts = (addressLine ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .filter((p) => {
      const pl = p.toLowerCase();
      if (/^\d[\d\s-]*$/.test(pl)) return false; // postal code / house number
      if (cityL && pl.includes(cityL)) return false;
      if (stateL && pl.includes(stateL)) return false;
      if (pl === "india") return false;
      return true;
    });
  const pick = parts[parts.length - 1];
  return pick ? pick.slice(0, 60) : city;
}

/** Raw DB row shape consumed by `mapListingRow` (subset of public.listings). */
export interface ListingRowLike {
  id: string;
  title: string;
  description: string | null;
  mode: ListingType;
  property_type: PropertyType;
  price_amount: number | string;
  deposit_amount: number | string | null;
  bedrooms: number;
  bathrooms: number;
  area_sqft: number | null;
  furnishing: Furnishing;
  amenities: string[] | null;
  cover_photo_url: string | null;
  created_at: string;
  updated_at: string;
  available_from: string | null;
  address_line: string | null;
  city: string;
  state: string | null;
  nearby: unknown;
  latitude: number | null;
  longitude: number | null;
  is_featured: boolean;
}

export function mapListingRow(
  row: ListingRowLike,
  extra: { photos: string[]; ownerDisplayName: string | null; ownerVerified: boolean },
): Listing {
  const nearby = parseNearby(row.nearby);
  const photos = extra.photos.filter(Boolean);
  const cover = row.cover_photo_url || photos[0] || null;
  const gallery = cover && !photos.includes(cover) ? [cover, ...photos] : photos;
  const lat = typeof row.latitude === "number" ? row.latitude : null;
  const lng = typeof row.longitude === "number" ? row.longitude : null;
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? "",
    listingType: row.mode,
    propertyType: row.property_type,
    price: Number(row.price_amount) || 0,
    deposit: row.deposit_amount == null ? null : Number(row.deposit_amount),
    beds: row.bedrooms ?? 0,
    baths: row.bathrooms ?? 0,
    areaSqft: row.area_sqft ?? null,
    furnished: row.furnishing,
    amenities: row.amenities ?? [],
    photo: cover,
    photos: gallery,
    ownerName: shortOwnerName(extra.ownerDisplayName),
    ownerVerified: extra.ownerVerified,
    postedAt: row.created_at,
    updatedAt: row.updated_at,
    availableFrom: row.available_from,
    neighborhood: deriveNeighborhood(row.address_line, row.city, row.state),
    landmark: nearby[0]?.label ?? null,
    nearby,
    city: row.city,
    state: row.state,
    lat: lat != null && lng != null ? lat : null,
    lng: lat != null && lng != null ? lng : null,
    isFeatured: row.is_featured,
  };
}

/** Days since a timestamp (0 = today). */
export function daysSince(iso: string): number {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
}

/** URL / saved-search params as used by /search. */
export interface SearchUrlParams {
  mode?: string;
  q?: string;
  type?: string;
  furn?: string;
  max?: number;
  min?: number;
  beds?: number;
  sort?: string;
}

/** Convert /search URL params into `searchListings` filter input (without paging). */
export function searchParamsToFilters(p: SearchUrlParams) {
  const furn =
    p.furn && (FURNISHINGS as string[]).includes(p.furn) ? (p.furn as Furnishing) : undefined;
  const sort =
    p.sort === "price-asc" || p.sort === "price-desc" || p.sort === "featured"
      ? p.sort
      : ("fresh" as const);
  return {
    q: p.q?.trim() ? p.q.trim().slice(0, 120) : undefined,
    mode: p.mode === "sale" ? ("sale" as const) : p.mode === "any" ? undefined : ("rent" as const),
    propertyTypes: parsePropertyTypes(p.type),
    furnishing: furn,
    minPrice: p.min && p.min > 0 ? p.min : undefined,
    maxPrice: p.max && p.max > 0 ? p.max : undefined,
    beds: p.beds && p.beds > 0 ? Math.floor(p.beds) : undefined,
    sort,
  };
}
