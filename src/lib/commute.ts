// Commute-time helpers. No routing API — we use haversine distance + a
// realistic average speed per mode. Good enough for a "Under N minutes"
// filter and dramatically cheaper than a real ETA call.

export type CommuteMode = "walk" | "bike" | "bus" | "drive";

export interface CommuteDest {
  key: string;
  label: string;
  hint: string;
  lat: number;
  lng: number;
}

// Curated Pune destinations. `custom` slot is reserved for a user pin.
export const COMMUTE_DESTS: CommuteDest[] = [
  { key: "coep", label: "COEP Tech University", hint: "Shivaji Nagar", lat: 18.5308, lng: 73.8475 },
  {
    key: "sym-viman",
    label: "Symbiosis Viman Nagar",
    hint: "Viman Nagar",
    lat: 18.5679,
    lng: 73.9143,
  },
  { key: "hinjewadi", label: "Hinjewadi IT Park", hint: "Phase 1", lat: 18.5913, lng: 73.7389 },
  {
    key: "pune-station",
    label: "Pune Railway Station",
    hint: "Central",
    lat: 18.5286,
    lng: 73.8743,
  },
  { key: "magarpatta", label: "Magarpatta City", hint: "Hadapsar", lat: 18.5158, lng: 73.928 },
];

// km/h — conservative urban averages including stops/lights.
const SPEED: Record<CommuteMode, number> = {
  walk: 4.8,
  bike: 16,
  bus: 18,
  drive: 24,
};

export const MODE_LABEL: Record<CommuteMode, string> = {
  walk: "Walk",
  bike: "Bike",
  bus: "Bus",
  drive: "Drive",
};

export const MODE_ICON: Record<CommuteMode, string> = {
  walk: "🚶",
  bike: "🚴",
  bus: "🚌",
  drive: "🚗",
};

export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function commuteMinutes(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  mode: CommuteMode,
): number {
  // Multiply haversine by a small detour factor to approximate street routing.
  const detour = mode === "walk" ? 1.25 : mode === "bike" ? 1.3 : 1.4;
  const km = haversineKm(from, to) * detour;
  return Math.round((km / SPEED[mode]) * 60);
}

export function getDest(key: string): CommuteDest | undefined {
  return COMMUTE_DESTS.find((d) => d.key === key);
}

export function isCommuteMode(v: string): v is CommuteMode {
  return v === "walk" || v === "bike" || v === "bus" || v === "drive";
}
