import { createFileRoute } from "@tanstack/react-router";
import { getListingById, getListingPhotos } from "@/lib/listings-data";

// Per-listing JSON, cached hard at the edge. Listings are treated as
// near-immutable in this demo, so we give the CDN a long freshness window
// and a generous stale-while-revalidate for repeat opens.
const CACHE_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
  "cdn-cache-control": "public, s-maxage=3600, stale-while-revalidate=86400",
  vary: "Accept-Encoding",
};

export const Route = createFileRoute("/api/public/listings/$id")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const listing = getListingById(params.id);
        if (!listing) {
          return new Response(JSON.stringify({ error: "not_found" }), {
            status: 404,
            headers: { "content-type": "application/json; charset=utf-8" },
          });
        }
        const photos = getListingPhotos(listing);
        return new Response(JSON.stringify({ listing, photos }), {
          headers: CACHE_HEADERS,
        });
      },
    },
  },
});
