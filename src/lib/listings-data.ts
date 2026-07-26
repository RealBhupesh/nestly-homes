// In-memory seed data for Phase 1. Replaced by DB queries in Phase 2.
export type ListingType = "rent" | "sale";
export type PropertyType = "room" | "pg" | "flat" | "house";

export interface Listing {
  id: string;
  title: string;
  neighborhood: string;
  city: string;
  listingType: ListingType;
  propertyType: PropertyType;
  price: number; // monthly rent or sale price
  deposit?: number;
  beds: number;
  baths: number;
  areaSqft: number;
  furnished: "furnished" | "semi" | "unfurnished";
  amenities: string[];
  photo: string;
  ownerName: string;
  ownerVerified: boolean;
  postedDaysAgo: number;
  distanceKm: number; // to campus
  landmark: string;
  lat: number;
  lng: number;
}

// Curated Unsplash photos (interior/room) — hot-linkable, license OK for demo.
const PHOTOS = [
  "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=1200&q=75&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1200&q=75&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=1200&q=75&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1505873242700-f289a29e1e0f?w=1200&q=75&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200&q=75&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&q=75&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1540518614846-7eded433c457?w=1200&q=75&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1484154218962-a197022b5858?w=1200&q=75&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1554995207-c18c203602cb?w=1200&q=75&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1560185127-6ed189bf02f4?w=1200&q=75&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1513694203232-719a280e022f?w=1200&q=75&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1615529182904-14819c35db37?w=1200&q=75&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1567767292278-a4f21aa2d36e?w=1200&q=75&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1502005229762-cf1b2da7c5d6?w=1200&q=75&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?w=1200&q=75&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1598928636135-d146006ff4be?w=1200&q=75&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?w=1200&q=75&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?w=1200&q=75&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1595526114035-0d45ed16cfbf?w=1200&q=75&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=1200&q=75&auto=format&fit=crop",
];

const NEIGHBORHOODS = [
  "Koregaon Park", "Kothrud", "Viman Nagar", "Baner", "Aundh",
  "Hinjewadi", "Deccan", "Shivaji Nagar", "Wakad", "Kalyani Nagar",
];

const OWNERS = [
  "Aarti M.", "Rohan K.", "Priya S.", "Kabir N.", "Meera T.",
  "Vikram J.", "Naina R.", "Zoya P.", "Aditya G.", "Shreya D.",
];

const AMENITY_POOL = ["Wi-Fi", "AC", "Kitchen", "Washer", "Parking", "Balcony", "Attached bath", "Study desk", "Power backup", "Lift"];

function pick<T>(arr: T[], i: number): T { return arr[i % arr.length]; }

function make(i: number): Listing {
  const isRent = i % 4 !== 0;
  const propType = pick<PropertyType>(["room", "pg", "flat", "house"], i);
  const beds = propType === "room" || propType === "pg" ? 1 : 1 + (i % 3);
  const baseRent = 6000 + ((i * 1373) % 22000);
  const salePrice = 3200000 + ((i * 91117) % 8500000);
  const amenities = AMENITY_POOL.filter((_, idx) => (i + idx) % 3 === 0).slice(0, 4);
  // Deterministic scatter around COEP Tech University, Pune (~18.5308, 73.8475)
  const angle = (i * 137.508) * (Math.PI / 180);
  const radiusKm = 0.3 + (i % 10) * 0.45;
  const dLat = (radiusKm / 111) * Math.cos(angle);
  const dLng = (radiusKm / (111 * Math.cos(18.5308 * Math.PI / 180))) * Math.sin(angle);
  return {
    id: `l-${i + 1}`,
    title: [
      "Sunny room in a shared 2BHK",
      "Bright studio near campus",
      "Cozy PG for students, meals included",
      "Modern 2BHK with balcony",
      "Quiet room, walk to metro",
      "Airy top-floor flat, lots of light",
      "Fully furnished 1BHK, ready to move",
      "Family home with garden",
    ][i % 8],
    neighborhood: pick(NEIGHBORHOODS, i),
    city: "Pune",
    listingType: isRent ? "rent" : "sale",
    propertyType: propType,
    price: isRent ? baseRent : salePrice,
    deposit: isRent ? baseRent * 2 : undefined,
    beds,
    baths: 1 + (i % 2),
    areaSqft: 220 + ((i * 47) % 900),
    furnished: (["furnished", "semi", "unfurnished"] as const)[i % 3],
    amenities,
    photo: pick(PHOTOS, i),
    ownerName: pick(OWNERS, i),
    ownerVerified: i % 3 !== 0,
    postedDaysAgo: i % 14,
    distanceKm: +((i % 10) * 0.4 + 0.3).toFixed(1),
    landmark: "COEP Tech University",
    lat: +(18.5308 + dLat).toFixed(5),
    lng: +(73.8475 + dLng).toFixed(5),
  };
}

export const LISTINGS: Listing[] = Array.from({ length: 42 }, (_, i) => make(i));

export function formatMoney(n: number, currency = "₹"): string {
  return `${currency}${n.toLocaleString("en-IN")}`;
}

// Deterministic gallery: 6 photos per listing, offset from the base PHOTOS pool.
export function getListingPhotos(listing: Listing, count = 6): string[] {
  const idNum = parseInt(listing.id.replace(/\D/g, ""), 10) || 0;
  const out: string[] = [];
  for (let k = 0; k < count; k++) {
    out.push(PHOTOS[(idNum + k * 3) % PHOTOS.length]);
  }
  return out;
}

export function getListingById(id: string): Listing | undefined {
  return LISTINGS.find((l) => l.id === id);
}