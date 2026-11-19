import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { SITE_URL } from "@/lib/site";

type SitemapEntry = {
  path: string;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: string;
  lastmod?: string;
};

const STATIC_ENTRIES: SitemapEntry[] = [
  { path: "/", changefreq: "daily", priority: "1.0" },
  { path: "/search", changefreq: "hourly", priority: "0.9" },
  { path: "/about", changefreq: "monthly", priority: "0.4" },
  { path: "/contact", changefreq: "monthly", priority: "0.4" },
  { path: "/terms", changefreq: "yearly", priority: "0.2" },
  { path: "/privacy", changefreq: "yearly", priority: "0.2" },
];

// Google accepts up to 50,000 URLs per sitemap file.
const MAX_LISTINGS = 45_000;

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function renderSitemap(entries: SitemapEntry[], baseUrl = SITE_URL): string {
  const urls = entries.map((e) => {
    const parts = [`    <loc>${xmlEscape(`${baseUrl}${e.path}`)}</loc>`];
    if (e.lastmod) parts.push(`    <lastmod>${xmlEscape(e.lastmod)}</lastmod>`);
    if (e.changefreq) parts.push(`    <changefreq>${e.changefreq}</changefreq>`);
    if (e.priority) parts.push(`    <priority>${e.priority}</priority>`);
    return `  <url>\n${parts.join("\n")}\n  </url>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
}

async function listingEntries(): Promise<SitemapEntry[]> {
  // Server-only import: keeps the service-role client out of the client bundle.
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("listings")
    .select("id, updated_at")
    .eq("status", "published")
    .order("updated_at", { ascending: false })
    .limit(MAX_LISTINGS);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    path: `/listing/${encodeURIComponent(row.id)}`,
    lastmod: row.updated_at ? new Date(row.updated_at).toISOString() : undefined,
    changefreq: "weekly" as const,
    priority: "0.7",
  }));
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        let listings: SitemapEntry[] = [];
        try {
          listings = await listingEntries();
        } catch (error) {
          // Fail soft: a sitemap with only static pages beats a 500.
          console.error(
            JSON.stringify({
              level: "error",
              kind: "sitemap_listings_failed",
              message: error instanceof Error ? error.message : String(error),
            }),
          );
        }
        const xml = renderSitemap([...STATIC_ENTRIES, ...listings]);
        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml; charset=utf-8",
            "Cache-Control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
          },
        });
      },
    },
  },
});
