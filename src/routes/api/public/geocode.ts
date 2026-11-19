import { createFileRoute } from "@tanstack/react-router";

// Server-side proxy for OpenStreetMap Nominatim, so browsers never call it
// directly (its usage policy requires an identifying User-Agent, max ~1 req/s
// and caching — https://operations.osmfoundation.org/policies/nominatim/).
//
//   GET /api/public/geocode?q=<text>&limit=<1-10>[&viewbox=l,t,r,b][&bounded=1]
//       → https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&countrycodes=in&...
//   GET /api/public/geocode?lat=<lat>&lon=<lon>[&zoom=<3-18>]
//       → https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&...
//
// The response body is Nominatim's JSON, unchanged (jsonv2: search → array
// of hits with lat/lon/display_name/name/category/type/address; reverse →
// a single object). Results are cached in memory per instance (LRU, 24h)
// and at the CDN (Cache-Control public, max-age=86400).

const NOMINATIM = "https://nominatim.openstreetmap.org";
const CACHE_MAX = 500;
const CACHE_TTL_MS = 24 * 3600_000;

interface CacheEntry {
  body: string;
  expires: number;
}
const cache = new Map<string, CacheEntry>();

function cacheGet(key: string): string | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (hit.expires <= Date.now()) {
    cache.delete(key);
    return null;
  }
  // Refresh LRU position.
  cache.delete(key);
  cache.set(key, hit);
  return hit.body;
}

function cacheSet(key: string, body: string) {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, { body, expires: Date.now() + CACHE_TTL_MS });
  while (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

// Keep this instance at ≤ 1 upstream request per second.
let nextSlot = 0;
async function waitForUpstreamSlot(): Promise<boolean> {
  const now = Date.now();
  const start = Math.max(now, nextSlot);
  const wait = start - now;
  if (wait > 4000) return false; // queue too long — shed load
  nextSlot = start + 1000;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  return true;
}

function siteUrl(): string {
  return (process.env.PUBLIC_SITE_URL || "https://nestly-homes.vercel.app").replace(/\/+$/, "");
}

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

function error(status: number, message: string, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...JSON_HEADERS, "cache-control": "no-store", ...extra },
  });
}

function ok(body: string, cacheStatus: "HIT" | "MISS") {
  return new Response(body, {
    status: 200,
    headers: {
      ...JSON_HEADERS,
      "cache-control": "public, max-age=86400, s-maxage=86400",
      "x-geocode-cache": cacheStatus,
    },
  });
}

function buildUpstreamUrl(params: URLSearchParams): URL | string {
  const latRaw = params.get("lat");
  const lonRaw = params.get("lon") ?? params.get("lng");
  if (latRaw !== null || lonRaw !== null) {
    const lat = Number(latRaw);
    const lon = Number(lonRaw);
    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lon) ||
      Math.abs(lat) > 90 ||
      Math.abs(lon) > 180
    ) {
      return "Invalid lat/lon";
    }
    const u = new URL(`${NOMINATIM}/reverse`);
    u.searchParams.set("format", "jsonv2");
    u.searchParams.set("addressdetails", "1");
    // ~1 m precision is plenty and makes the cache effective.
    u.searchParams.set("lat", lat.toFixed(5));
    u.searchParams.set("lon", lon.toFixed(5));
    const zoom = Number(params.get("zoom"));
    if (Number.isInteger(zoom) && zoom >= 3 && zoom <= 18) u.searchParams.set("zoom", String(zoom));
    return u;
  }

  const q = (params.get("q") ?? "").trim().replace(/\s+/g, " ");
  if (q.length < 2 || q.length > 200) return "q must be 2-200 characters";
  const limitRaw = Number(params.get("limit") ?? 5);
  const limit = Number.isFinite(limitRaw) ? Math.min(10, Math.max(1, Math.round(limitRaw))) : 5;
  const u = new URL(`${NOMINATIM}/search`);
  u.searchParams.set("format", "jsonv2");
  u.searchParams.set("addressdetails", "1");
  u.searchParams.set("countrycodes", "in");
  u.searchParams.set("limit", String(limit));
  u.searchParams.set("q", q.toLowerCase());
  const viewbox = params.get("viewbox");
  if (viewbox) {
    const parts = viewbox.split(",").map(Number);
    if (parts.length === 4 && parts.every((n) => Number.isFinite(n) && Math.abs(n) <= 180)) {
      u.searchParams.set("viewbox", parts.join(","));
      if (params.get("bounded") === "1") u.searchParams.set("bounded", "1");
    }
  }
  return u;
}

export const Route = createFileRoute("/api/public/geocode")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const upstreamUrl = buildUpstreamUrl(new URL(request.url).searchParams);
        if (typeof upstreamUrl === "string") return error(400, upstreamUrl);

        const key = upstreamUrl.toString();
        const cached = cacheGet(key);
        if (cached !== null) return ok(cached, "HIT");

        const { rateLimit, clientIp } = await import("@/lib/rate-limit");
        const rl = await rateLimit(`geo:${clientIp(request)}`, 30, 60);
        if (!rl.ok) return error(429, "Too many requests", { "retry-after": String(rl.resetSec) });

        if (!(await waitForUpstreamSlot())) {
          return error(503, "Geocoder busy, try again shortly", { "retry-after": "2" });
        }

        let res: Response;
        try {
          res = await fetch(key, {
            headers: {
              "User-Agent": `Nestly/1.0 (+${siteUrl()})`,
              Referer: siteUrl(),
              Accept: "application/json",
              "Accept-Language": request.headers.get("accept-language")?.slice(0, 100) || "en",
            },
            redirect: "manual",
            signal: AbortSignal.timeout(8000),
          });
        } catch (err) {
          console.error("[geocode] upstream error:", (err as Error)?.message ?? err);
          return error(502, "Geocoder unavailable");
        }
        if (res.status === 429)
          return error(503, "Geocoder busy, try again shortly", { "retry-after": "5" });
        if (res.status !== 200) {
          console.error(`[geocode] upstream status ${res.status}`);
          return error(502, "Geocoder unavailable");
        }
        const body = await res.text();
        try {
          JSON.parse(body);
        } catch {
          return error(502, "Geocoder returned an invalid response");
        }
        cacheSet(key, body);
        return ok(body, "MISS");
      },
    },
  },
});
