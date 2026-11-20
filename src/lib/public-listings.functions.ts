import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  FURNISHINGS,
  PROPERTY_TYPES,
  isUuid,
  mapListingRow,
  type Furnishing,
  type Listing,
  type ListingRowLike,
  type PropertyType,
} from "@/lib/listings-data";

// Public (anonymous) read access to PUBLISHED listings. Uses the service-role
// client server-side, so every query MUST filter on status = 'published' and
// must only select public-safe columns (never contact_phone / contact_name /
// owner email).

const PUBLIC_COLUMNS =
  "id,title,description,mode,property_type,price_amount,deposit_amount,bedrooms,bathrooms,area_sqft,furnishing,amenities,cover_photo_url,owner_id,created_at,updated_at,available_from,address_line,city,state,nearby,latitude,longitude,is_featured";

type Row = ListingRowLike & { owner_id: string };

async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}
type Admin = Awaited<ReturnType<typeof getAdmin>>;

/** Attach photos + owner display info, map to public `Listing`. */
async function hydrate(
  admin: Admin,
  rows: Row[],
  opts: { maxPhotos?: number; descMax?: number } = {},
): Promise<Listing[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const ownerIds = [...new Set(rows.map((r) => r.owner_id))];
  const [photosRes, profilesRes] = await Promise.all([
    admin
      .from("listing_photos")
      .select("listing_id,url,position")
      .in("listing_id", ids)
      .order("position", { ascending: true }),
    admin.from("profiles").select("id,display_name,is_verified_owner").in("id", ownerIds),
  ]);
  const photosBy = new Map<string, string[]>();
  for (const p of photosRes.data ?? []) {
    const arr = photosBy.get(p.listing_id) ?? [];
    if (!opts.maxPhotos || arr.length < opts.maxPhotos) arr.push(p.url);
    photosBy.set(p.listing_id, arr);
  }
  const profileBy = new Map((profilesRes.data ?? []).map((p) => [p.id, p]));
  return rows.map((r) => {
    const prof = profileBy.get(r.owner_id);
    const l = mapListingRow(r, {
      photos: photosBy.get(r.id) ?? [],
      ownerDisplayName: prof?.display_name ?? null,
      ownerVerified: Boolean(prof?.is_verified_owner),
    });
    if (opts.descMax && l.description.length > opts.descMax) {
      l.description = `${l.description.slice(0, opts.descMax).trimEnd()}…`;
    }
    return l;
  });
}

// ---------------------------------------------------------------------------
// searchListings
// ---------------------------------------------------------------------------

const bboxSchema = z.object({
  west: z.number().min(-180).max(180),
  south: z.number().min(-90).max(90),
  east: z.number().min(-180).max(180),
  north: z.number().min(-90).max(90),
});

const searchSchema = z.object({
  q: z.string().trim().max(120).optional(),
  mode: z.enum(["rent", "sale"]).optional(),
  propertyTypes: z
    .array(z.enum(PROPERTY_TYPES as [PropertyType, ...PropertyType[]]))
    .max(6)
    .optional(),
  minPrice: z.number().min(0).max(1e11).optional(),
  maxPrice: z.number().min(0).max(1e11).optional(),
  beds: z.number().int().min(0).max(20).optional(),
  furnishing: z.enum(FURNISHINGS as [Furnishing, ...Furnishing[]]).optional(),
  bbox: bboxSchema.optional(),
  /** Only listings created after this ISO timestamp. */
  postedAfter: z.string().datetime({ offset: true }).optional(),
  /** Only return listings that have map coordinates. */
  requireCoords: z.boolean().optional(),
  sort: z.enum(["fresh", "price-asc", "price-desc", "relevance", "featured"]).default("fresh"),
  limit: z.number().int().min(1).max(48).default(24),
  offset: z.number().int().min(0).max(5000).default(0),
});

export type SearchListingsInput = z.input<typeof searchSchema>;
export interface SearchListingsResult {
  items: Listing[];
  total: number;
  offset: number;
  hasMore: boolean;
}

export const searchListings = createServerFn({ method: "GET" })
  .validator((input: unknown) => searchSchema.parse(input ?? {}))
  .handler(async ({ data }): Promise<SearchListingsResult> => {
    const admin = await getAdmin();
    const empty: SearchListingsResult = {
      items: [],
      total: 0,
      offset: data.offset,
      hasMore: false,
    };

    // Typo-tolerant text search via the trigram RPC (published only, max 100).
    let relevance: Map<string, number> | null = null;
    const q = data.q?.trim();
    if (q && q.length >= 2) {
      const { data: hits, error } = await admin.rpc("search_listings", { _q: q, _limit: 100 });
      if (error) throw new Error("Search is temporarily unavailable");
      relevance = new Map((hits ?? []).map((h) => [h.id, h.relevance ?? 0]));
      if (relevance.size === 0) return empty;
    }

    let query = admin
      .from("listings")
      .select(PUBLIC_COLUMNS, { count: "exact" })
      .eq("status", "published");
    if (data.mode) query = query.eq("mode", data.mode);
    if (data.propertyTypes && data.propertyTypes.length > 0)
      query = query.in("property_type", data.propertyTypes);
    if (data.furnishing) query = query.eq("furnishing", data.furnishing);
    if (data.minPrice && data.minPrice > 0) query = query.gte("price_amount", data.minPrice);
    if (data.maxPrice && data.maxPrice > 0) query = query.lte("price_amount", data.maxPrice);
    if (data.beds && data.beds > 0) query = query.gte("bedrooms", data.beds);
    if (data.postedAfter) query = query.gt("created_at", data.postedAfter);
    if (data.bbox) {
      const { west, south, east, north } = data.bbox;
      query = query
        .gte("latitude", Math.min(south, north))
        .lte("latitude", Math.max(south, north))
        .gte("longitude", Math.min(west, east))
        .lte("longitude", Math.max(west, east));
    } else if (data.requireCoords) {
      query = query.not("latitude", "is", null).not("longitude", "is", null);
    }
    if (relevance) query = query.in("id", [...relevance.keys()]);

    const sortByRelevance = relevance && (data.sort === "relevance" || data.sort === "fresh");
    if (sortByRelevance) {
      // ≤100 candidate rows: fetch all, rank in memory, then page.
      const { data: rows, error } = await query.limit(100);
      if (error) throw new Error("Could not load listings");
      const ranked = ((rows ?? []) as unknown as Row[]).sort(
        (a, b) =>
          (relevance!.get(b.id) ?? 0) - (relevance!.get(a.id) ?? 0) ||
          b.created_at.localeCompare(a.created_at),
      );
      const page = ranked.slice(data.offset, data.offset + data.limit);
      return {
        items: await hydrate(admin, page, { maxPhotos: 5, descMax: 280 }),
        total: ranked.length,
        offset: data.offset,
        hasMore: data.offset + page.length < ranked.length,
      };
    }

    switch (data.sort) {
      case "price-asc":
        query = query.order("price_amount", { ascending: true });
        break;
      case "price-desc":
        query = query.order("price_amount", { ascending: false });
        break;
      case "featured":
        query = query
          .order("is_featured", { ascending: false })
          .order("created_at", { ascending: false });
        break;
      default:
        query = query.order("created_at", { ascending: false });
    }
    query = query.order("id", { ascending: true }).range(data.offset, data.offset + data.limit - 1);

    const { data: rows, count, error } = await query;
    if (error) throw new Error("Could not load listings");
    const items = await hydrate(admin, (rows ?? []) as unknown as Row[], {
      maxPhotos: 5,
      descMax: 280,
    });
    const total = count ?? items.length;
    return { items, total, offset: data.offset, hasMore: data.offset + items.length < total };
  });

// ---------------------------------------------------------------------------
// getListing
// ---------------------------------------------------------------------------

export const getListing = createServerFn({ method: "GET" })
  .validator((input: unknown) => z.object({ id: z.string().max(100) }).parse(input))
  .handler(async ({ data }): Promise<Listing | null> => {
    if (!isUuid(data.id)) return null;
    const admin = await getAdmin();
    const { data: row, error } = await admin
      .from("listings")
      .select(PUBLIC_COLUMNS)
      .eq("id", data.id)
      .eq("status", "published")
      .maybeSingle();
    if (error) throw new Error("Could not load listing");
    if (!row) return null;
    const [listing] = await hydrate(admin, [row as unknown as Row], { maxPhotos: 30 });
    return listing ?? null;
  });

// ---------------------------------------------------------------------------
// getFeaturedListings — featured first, then newest.
// ---------------------------------------------------------------------------

export const getFeaturedListings = createServerFn({ method: "GET" })
  .validator((input: unknown) =>
    z.object({ limit: z.number().int().min(1).max(24).default(8) }).parse(input ?? {}),
  )
  .handler(async ({ data }): Promise<Listing[]> => {
    const admin = await getAdmin();
    const { data: rows, error } = await admin
      .from("listings")
      .select(PUBLIC_COLUMNS)
      .eq("status", "published")
      .order("is_featured", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error("Could not load listings");
    return hydrate(admin, (rows ?? []) as unknown as Row[], { maxPhotos: 5, descMax: 200 });
  });

// ---------------------------------------------------------------------------
// getSimilarListings — same mode + city, ranked by type, distance and price.
// ---------------------------------------------------------------------------

export const getSimilarListings = createServerFn({ method: "GET" })
  .validator((input: unknown) =>
    z
      .object({ id: z.string().max(100), limit: z.number().int().min(1).max(12).default(6) })
      .parse(input),
  )
  .handler(async ({ data }): Promise<Listing[]> => {
    if (!isUuid(data.id)) return [];
    const admin = await getAdmin();
    const { data: base } = await admin
      .from("listings")
      .select("id,mode,property_type,city,price_amount,latitude,longitude")
      .eq("id", data.id)
      .eq("status", "published")
      .maybeSingle();
    if (!base) return [];
    const { data: rows, error } = await admin
      .from("listings")
      .select(PUBLIC_COLUMNS)
      .eq("status", "published")
      .eq("mode", base.mode)
      .ilike("city", base.city)
      .neq("id", base.id)
      .order("created_at", { ascending: false })
      .limit(40);
    if (error) return [];
    const basePrice = Number(base.price_amount) || 1;
    const score = (r: Row) => {
      let s = 0;
      if (r.property_type === base.property_type) s += 2;
      const p = Number(r.price_amount) || 0;
      s += Math.max(0, 1.5 - Math.abs(p - basePrice) / basePrice);
      if (
        base.latitude != null &&
        base.longitude != null &&
        r.latitude != null &&
        r.longitude != null
      ) {
        const dKm = Math.hypot(
          (r.latitude - base.latitude) * 111,
          (r.longitude - base.longitude) * 105,
        );
        s += Math.max(0, 2 - dKm / 3);
      }
      return s;
    };
    const ranked = ((rows ?? []) as unknown as Row[])
      .map((r) => ({ r, s: score(r) }))
      .sort((a, b) => b.s - a.s)
      .slice(0, data.limit)
      .map((x) => x.r);
    return hydrate(admin, ranked, { maxPhotos: 5, descMax: 200 });
  });

// ---------------------------------------------------------------------------
// getListingsByIds — for compare / saved items. Unknown or unpublished ids are dropped.
// ---------------------------------------------------------------------------

export const getListingsByIds = createServerFn({ method: "GET" })
  .validator((input: unknown) =>
    z.object({ ids: z.array(z.string().max(100)).max(12) }).parse(input),
  )
  .handler(async ({ data }): Promise<Listing[]> => {
    const ids = [...new Set(data.ids.filter(isUuid))];
    if (ids.length === 0) return [];
    const admin = await getAdmin();
    const { data: rows, error } = await admin
      .from("listings")
      .select(PUBLIC_COLUMNS)
      .eq("status", "published")
      .in("id", ids);
    if (error) throw new Error("Could not load listings");
    const items = await hydrate(admin, (rows ?? []) as unknown as Row[], {
      maxPhotos: 5,
      descMax: 400,
    });
    const order = new Map(ids.map((id, i) => [id, i]));
    return items.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  });
