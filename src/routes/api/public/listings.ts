import { createFileRoute } from "@tanstack/react-router";
import { searchListings } from "@/lib/public-listings.functions";
import { searchParamsToFilters } from "@/lib/listings-data";

// Public JSON feed of PUBLISHED listings (public-safe fields only), paginated.
//   GET /api/public/listings?mode=rent&type=room,pg&max=15000&q=kothrud&limit=24&offset=0
// CDN caching: 1 min fresh at the edge, then stale-while-revalidate.
const CACHE_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "public, max-age=30, s-maxage=60, stale-while-revalidate=600",
  "cdn-cache-control": "public, s-maxage=60, stale-while-revalidate=600",
  "access-control-allow-origin": "*",
  vary: "Accept-Encoding",
};

function num(v: string | null): number | undefined {
  if (v == null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

export const Route = createFileRoute("/api/public/listings")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const sp = new URL(request.url).searchParams;
        const filters = searchParamsToFilters({
          mode: sp.get("mode") ?? "any",
          q: sp.get("q") ?? undefined,
          type: sp.get("type") ?? undefined,
          furn: sp.get("furn") ?? undefined,
          min: num(sp.get("min")),
          max: num(sp.get("max")),
          beds: num(sp.get("beds")),
          sort: sp.get("sort") ?? undefined,
        });
        const limit = Math.min(48, Math.max(1, Math.floor(num(sp.get("limit")) ?? 24)));
        const offset = Math.min(5000, Math.floor(num(sp.get("offset")) ?? 0));
        try {
          const res = await searchListings({ data: { ...filters, limit, offset } });
          return new Response(
            JSON.stringify({
              listings: res.items,
              count: res.items.length,
              total: res.total,
              offset: res.offset,
              limit,
              hasMore: res.hasMore,
            }),
            { headers: CACHE_HEADERS },
          );
        } catch {
          return new Response(JSON.stringify({ error: "unavailable" }), {
            status: 503,
            headers: {
              "content-type": "application/json; charset=utf-8",
              "cache-control": "no-store",
            },
          });
        }
      },
    },
  },
});
