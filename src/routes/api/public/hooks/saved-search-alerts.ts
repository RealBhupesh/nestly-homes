import { createFileRoute } from "@tanstack/react-router";

type Params = {
  mode?: string;
  q?: string;
  type?: string;
  max?: number;
  furn?: string;
};

type ListingRow = {
  id: string;
  title: string;
  city: string;
  address_line: string;
  price_amount: number;
  mode: string;
  property_type: string;
  furnishing: string;
  created_at: string;
};

function matches(l: ListingRow, p: Params): boolean {
  const mode = p.mode ?? "rent";
  if (l.mode !== mode) return false;
  if (p.type && p.type !== "any" && l.property_type !== p.type) return false;
  if (p.furn && p.furn !== "any" && l.furnishing !== p.furn) return false;
  if (p.max && p.max > 0 && Number(l.price_amount) > p.max) return false;
  if (p.q) {
    const hay = `${l.title} ${l.city} ${l.address_line}`.toLowerCase();
    if (!hay.includes(p.q.toLowerCase())) return false;
  }
  return true;
}

export const Route = createFileRoute("/api/public/hooks/saved-search-alerts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = request.headers.get("apikey");
        if (!apiKey || apiKey !== process.env.SUPABASE_PUBLISHABLE_KEY) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: searches, error: sErr } = await supabaseAdmin
          .from("saved_searches")
          .select("id, name, params, alert_frequency, last_notified_at, last_match_count")
          .neq("alert_frequency", "off");
        if (sErr) {
          return new Response(JSON.stringify({ error: sErr.message }), { status: 500 });
        }

        const { data: listings, error: lErr } = await supabaseAdmin
          .from("listings")
          .select("id, title, city, address_line, price_amount, mode, property_type, furnishing, created_at")
          .eq("status", "published")
          .order("created_at", { ascending: false })
          .limit(500);
        if (lErr) {
          return new Response(JSON.stringify({ error: lErr.message }), { status: 500 });
        }

        const rows = (listings ?? []) as unknown as ListingRow[];
        const now = new Date();
        let notified = 0;

        for (const s of searches ?? []) {
          const freq = s.alert_frequency as "instant" | "daily";
          const last = s.last_notified_at ? new Date(s.last_notified_at) : null;
          if (freq === "daily" && last && now.getTime() - last.getTime() < 23 * 3600_000) continue;

          const since = last ?? new Date(now.getTime() - 24 * 3600_000);
          const fresh = rows.filter(
            (l) => matches(l, (s.params ?? {}) as Params) && new Date(l.created_at) > since,
          );
          if (fresh.length === 0) continue;

          await supabaseAdmin
            .from("saved_searches")
            .update({ last_notified_at: now.toISOString(), last_match_count: fresh.length })
            .eq("id", s.id);
          notified++;
        }

        return new Response(
          JSON.stringify({ ok: true, searches: searches?.length ?? 0, notified }),
          { headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
