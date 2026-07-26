import { createFileRoute } from "@tanstack/react-router";
import { LISTINGS } from "@/lib/listings-data";

// Edge-cached JSON feed of all listings. Cloudflare (and any CDN in front of
// the Worker) will honour these headers: 5 min fresh at the edge, then serve
// stale-while-revalidate for a day so repeat visits paint instantly while a
// background refresh happens.
const CACHE_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "public, max-age=60, s-maxage=300, stale-while-revalidate=86400",
  "cdn-cache-control": "public, s-maxage=300, stale-while-revalidate=86400",
  vary: "Accept-Encoding",
};

export const Route = createFileRoute("/api/public/listings")({
  server: {
    handlers: {
      GET: async () =>
        new Response(JSON.stringify({ listings: LISTINGS, count: LISTINGS.length }), {
          headers: CACHE_HEADERS,
        }),
    },
  },
});
