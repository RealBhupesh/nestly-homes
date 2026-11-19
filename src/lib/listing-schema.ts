import { z } from "zod";

export const PROPERTY_TYPES = ["room", "studio", "apartment", "house", "pg", "other"] as const;
export const FURNISHINGS = ["unfurnished", "semi", "furnished"] as const;
export const AMENITY_OPTIONS = [
  "Wi-Fi",
  "AC",
  "Geyser",
  "Parking",
  "Lift",
  "Power backup",
  "Security",
  "Balcony",
  "Kitchen",
  "Washing machine",
  "Refrigerator",
  "Gym",
  "Pet friendly",
  "Study desk",
] as const;

export const nearbyPlaceSchema = z.object({
  label: z.string().trim().min(1).max(120),
  lat: z.number().min(-90).max(90).optional().nullable(),
  lng: z.number().min(-180).max(180).optional().nullable(),
});
export type NearbyPlace = z.infer<typeof nearbyPlaceSchema>;

export const listingSchema = z.object({
  title: z.string().trim().min(4, "Title is too short").max(120),
  description: z.string().trim().max(4000).default(""),
  mode: z.enum(["rent", "sale"]),
  status: z.enum(["draft", "published", "archived"]).default("draft"),
  property_type: z.enum(PROPERTY_TYPES),
  furnishing: z.enum(FURNISHINGS),
  bedrooms: z.coerce.number().int().min(0).max(20),
  bathrooms: z.coerce.number().int().min(0).max(20),
  area_sqft: z.coerce.number().int().min(0).max(100000).optional().nullable(),
  price_amount: z.coerce.number().int().min(0).max(1_000_000_000),
  deposit_amount: z.coerce.number().int().min(0).max(1_000_000_000).optional().nullable(),
  seeking_count: z.coerce.number().int().min(1).max(20).optional().nullable(),
  address_line: z.string().trim().min(4).max(240),
  city: z.string().trim().min(2).max(80),
  state: z.string().trim().max(80).optional().nullable(),
  country: z.string().trim().min(2).max(80).default("India"),
  postal_code: z.string().trim().max(20).optional().nullable(),
  latitude: z.coerce.number().min(-90).max(90).optional().nullable(),
  longitude: z.coerce.number().min(-180).max(180).optional().nullable(),
  amenities: z.array(z.string()).default([]),
  nearby: z.array(nearbyPlaceSchema).max(5).default([]),
  available_from: z.string().optional().nullable(),
  contact_name: z.string().trim().max(80).optional().nullable(),
  contact_phone: z.string().trim().max(30).optional().nullable(),
});

export type ListingInput = z.infer<typeof listingSchema>;
