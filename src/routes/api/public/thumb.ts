import { createFileRoute } from "@tanstack/react-router";

// Allow-listed upstream image hosts. We proxy so the CDN in front of the
// Worker (Cloudflare) can cache thumbnails against our own origin, which
// warms much faster across repeat visits than relying purely on the
// upstream CDN's cache key.
const ALLOWED_HOSTS = new Set(["images.unsplash.com"]);

// Thumbnails are content-addressed by Unsplash photo id + query params, so
// they're effectively immutable — cache for a year.
const IMMUTABLE_HEADERS: Record<string, string> = {
  "cache-control": "public, max-age=31536000, s-maxage=31536000, immutable",
  "cdn-cache-control": "public, s-maxage=31536000, immutable",
  vary: "Accept",
};

export const Route = createFileRoute("/api/public/thumb")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const src = url.searchParams.get("src");
        if (!src) return new Response("missing src", { status: 400 });

        let target: URL;
        try {
          target = new URL(src);
        } catch {
          return new Response("bad src", { status: 400 });
        }
        if (target.protocol !== "https:" || !ALLOWED_HOSTS.has(target.hostname)) {
          return new Response("forbidden host", { status: 403 });
        }

        const upstream = await fetch(target.toString(), {
          headers: { accept: "image/avif,image/webp,image/*,*/*;q=0.8" },
        });
        if (!upstream.ok || !upstream.body) {
          return new Response("upstream error", { status: 502 });
        }

        const headers = new Headers(IMMUTABLE_HEADERS);
        const ct = upstream.headers.get("content-type");
        if (ct) headers.set("content-type", ct);
        const len = upstream.headers.get("content-length");
        if (len) headers.set("content-length", len);

        return new Response(upstream.body, { status: 200, headers });
      },
    },
  },
});
