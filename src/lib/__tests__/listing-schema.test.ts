import { describe, expect, it } from "vitest";
import { listingSchema, nearbyPlaceSchema } from "@/lib/listing-schema";

const valid = {
  title: "Sunny 2BHK in Baner",
  mode: "rent",
  property_type: "apartment",
  furnishing: "semi",
  bedrooms: 2,
  bathrooms: 2,
  price_amount: 28000,
  address_line: "Lane 5, Baner Road",
  city: "Pune",
};

describe("listingSchema", () => {
  it("accepts a minimal valid listing and applies defaults", () => {
    const r = listingSchema.parse(valid);
    expect(r.status).toBe("draft");
    expect(r.country).toBe("India");
    expect(r.description).toBe("");
    expect(r.amenities).toEqual([]);
    expect(r.nearby).toEqual([]);
  });

  it("coerces numeric strings from form inputs", () => {
    const r = listingSchema.parse({
      ...valid,
      bedrooms: "3",
      price_amount: "15000",
      latitude: "18.56",
    });
    expect(r.bedrooms).toBe(3);
    expect(r.price_amount).toBe(15000);
    expect(r.latitude).toBeCloseTo(18.56);
  });

  it("trims strings", () => {
    const r = listingSchema.parse({ ...valid, title: "   Room near COEP   ", city: "  Pune " });
    expect(r.title).toBe("Room near COEP");
    expect(r.city).toBe("Pune");
  });

  it("rejects a too-short title with a friendly message", () => {
    const r = listingSchema.safeParse({ ...valid, title: "abc" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toBe("Title is too short");
  });

  it("rejects unknown enums and out-of-range numbers", () => {
    expect(listingSchema.safeParse({ ...valid, mode: "lease" }).success).toBe(false);
    expect(listingSchema.safeParse({ ...valid, property_type: "castle" }).success).toBe(false);
    expect(listingSchema.safeParse({ ...valid, bedrooms: -1 }).success).toBe(false);
    expect(listingSchema.safeParse({ ...valid, bedrooms: 2.5 }).success).toBe(false);
    expect(listingSchema.safeParse({ ...valid, price_amount: 2_000_000_000 }).success).toBe(false);
    expect(listingSchema.safeParse({ ...valid, latitude: 91 }).success).toBe(false);
  });

  it("allows at most 5 nearby places", () => {
    const place = { label: "COEP" };
    expect(listingSchema.safeParse({ ...valid, nearby: Array(5).fill(place) }).success).toBe(true);
    expect(listingSchema.safeParse({ ...valid, nearby: Array(6).fill(place) }).success).toBe(false);
  });
});

describe("nearbyPlaceSchema", () => {
  it("requires a non-empty label and valid coordinates", () => {
    expect(nearbyPlaceSchema.safeParse({ label: "  " }).success).toBe(false);
    expect(nearbyPlaceSchema.safeParse({ label: "Station", lat: 18.5, lng: 73.8 }).success).toBe(
      true,
    );
    expect(nearbyPlaceSchema.safeParse({ label: "Station", lat: null, lng: null }).success).toBe(
      true,
    );
    expect(nearbyPlaceSchema.safeParse({ label: "Station", lng: 200 }).success).toBe(false);
  });
});
