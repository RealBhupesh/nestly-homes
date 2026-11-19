import { createFileRoute } from "@tanstack/react-router";
import { getListing } from "@/lib/public-listings.functions";
import { isUuid } from "@/lib/listings-data";

// Per-listing JSON for a PUBLISHED listing (public-safe fields only).
const CACHE_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "public, max-age=60, s-maxage=300, stale-while-revalidate=3600",
  "cdn-cache-control": "public, s-maxage=300, stale-while-revalidate=3600",
  "access-control-allow-origin": "*",
  vary: "Accept-Encoding",
};

const notFound = () =>
  new Response(JSON.stringify({ error: "not_found" }), {
    status: 404,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=30",
    },
  });

export const Route = createFileRoute("/api/public/listings/$id")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        if (!isUuid(params.id)) return notFound();
        try {
          const listing = await getListing({ data: { id: params.id } });
          if (!listing) return notFound();
          return new Response(JSON.stringify({ listing, photos: listing.photos }), {
            headers: CACHE_HEADERS,
          });
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
