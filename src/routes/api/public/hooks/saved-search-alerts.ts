import { createFileRoute } from "@tanstack/react-router";

// Saved-search alert digest job.
//
// Triggered by Vercel Cron (see vercel.json -> "crons"), which calls this path
// with `GET` and `Authorization: Bearer ${CRON_SECRET}`. POST is accepted too
// so it can be triggered manually / from another scheduler:
//
//   curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://<site>/api/public/hooks/saved-search-alerts
//
// For every saved search with alert_frequency != 'off' it finds published
// listings created since the last notification and emails the owner one
// digest. Frequencies (saved_searches.alert_frequency):
//   'daily'   → at most once every ~23h
//   'instant' → every run (the Hobby plan only allows a daily cron, so this
//               behaves like daily unless the job is scheduled more often)

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

// Legacy UI values -> DB enum public.property_type.
const TYPE_ALIASES: Record<string, string> = { flat: "apartment" };

function matches(l: ListingRow, p: Params): boolean {
  const mode = p.mode ?? "rent";
  if (l.mode !== mode) return false;
  const type = p.type ? (TYPE_ALIASES[p.type] ?? p.type) : undefined;
  if (type && type !== "any" && l.property_type !== type) return false;
  if (p.furn && p.furn !== "any" && l.furnishing !== p.furn) return false;
  const max = Number(p.max);
  if (Number.isFinite(max) && max > 0 && Number(l.price_amount) > max) return false;
  if (p.q) {
    const hay = `${l.title} ${l.city} ${l.address_line}`.toLowerCase();
    if (!hay.includes(p.q.toLowerCase())) return false;
  }
  return true;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

async function isAuthorized(request: Request): Promise<boolean> {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false; // Refuse to run without a configured secret.
  const header = request.headers.get("authorization") ?? "";
  const { timingSafeEqual, createHash } = await import("node:crypto");
  // Hash both sides so lengths always match for timingSafeEqual.
  const a = createHash("sha256").update(header).digest();
  const b = createHash("sha256").update(`Bearer ${secret}`).digest();
  return timingSafeEqual(a, b);
}

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

async function run(request: Request): Promise<Response> {
  if (!(await isAuthorized(request))) {
    if (!process.env.CRON_SECRET)
      console.error("[alerts] CRON_SECRET is not set; refusing to run.");
    return json({ error: "Unauthorized" }, 401);
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { sendEmail, renderEmail, escapeHtml, absoluteSiteUrl } = await import("@/lib/email");

  const { data: searches, error: sErr } = await supabaseAdmin
    .from("saved_searches")
    .select("id, user_id, name, params, alert_frequency, last_notified_at, last_match_count")
    .neq("alert_frequency", "off")
    .limit(5000);
  if (sErr) {
    console.error("[alerts] saved_searches query failed:", sErr.message);
    return json({ error: "Query failed" }, 500);
  }

  const now = new Date();
  const oldestSince = new Date(now.getTime() - 7 * 24 * 3600_000);
  const { data: listings, error: lErr } = await supabaseAdmin
    .from("listings")
    .select(
      "id, title, city, address_line, price_amount, mode, property_type, furnishing, created_at",
    )
    .eq("status", "published")
    .gte("created_at", oldestSince.toISOString())
    .order("created_at", { ascending: false })
    .limit(1000);
  if (lErr) {
    console.error("[alerts] listings query failed:", lErr.message);
    return json({ error: "Query failed" }, 500);
  }

  const rows = (listings ?? []) as unknown as ListingRow[];

  // Group due searches + their fresh matches by user so each user gets one email.
  type Due = { id: string; name: string; fresh: ListingRow[] };
  const byUser = new Map<string, Due[]>();
  let considered = 0;

  for (const s of searches ?? []) {
    const freq = s.alert_frequency as "instant" | "daily" | string;
    if (freq !== "instant" && freq !== "daily") continue;
    const last = s.last_notified_at ? new Date(s.last_notified_at) : null;
    if (freq === "daily" && last && now.getTime() - last.getTime() < 23 * 3600_000) continue;
    considered++;

    let since = last ?? new Date(now.getTime() - 24 * 3600_000);
    if (since < oldestSince) since = oldestSince;
    const fresh = rows.filter(
      (l) => new Date(l.created_at) > since && matches(l, (s.params ?? {}) as Params),
    );
    if (fresh.length === 0) continue;
    const list = byUser.get(s.user_id) ?? [];
    list.push({ id: s.id, name: s.name, fresh });
    byUser.set(s.user_id, list);
  }

  let emailed = 0;
  let notifiedSearches = 0;

  for (const [userId, dues] of byUser) {
    let email: string | null = null;
    try {
      const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
      email = data?.user?.email ?? null;
    } catch (err) {
      console.error("[alerts] user lookup failed:", (err as Error).message);
    }

    const total = dues.reduce((n, d) => n + d.fresh.length, 0);
    let sent = false;
    if (email) {
      const sections = dues
        .map((d) => {
          const items = d.fresh
            .slice(0, 8)
            .map((l) => {
              const url = absoluteSiteUrl(`/listing/${l.id}`);
              const price = `${inr.format(Number(l.price_amount))}${l.mode === "rent" ? "/mo" : ""}`;
              return `<li style="margin:0 0 8px"><a href="${escapeHtml(url)}" style="color:#0f766e;font-weight:600">${escapeHtml(l.title)}</a><br><span style="color:#6b7280">${escapeHtml(l.city)} · ${escapeHtml(price)}</span></li>`;
            })
            .join("");
          const more =
            d.fresh.length > 8 ? `<p style="color:#6b7280">+ ${d.fresh.length - 8} more</p>` : "";
          return `<h2 style="font-size:16px;margin:20px 0 8px">${escapeHtml(d.name)} — ${d.fresh.length} new</h2><ul style="padding-left:18px;margin:0">${items}</ul>${more}`;
        })
        .join("");
      const savedUrl = absoluteSiteUrl("/dashboard/saved");
      sent = await sendEmail({
        to: email,
        subject: `${total} new ${total === 1 ? "home matches" : "homes match"} your saved ${dues.length === 1 ? "search" : "searches"}`,
        html: renderEmail({
          heading: "New places that match your search",
          bodyHtml: sections,
          cta: { label: "See your saved searches", url: savedUrl },
          footer: "You can change or turn off these alerts from your saved searches.",
        }),
        text: `${total} new listings match your saved searches.\n\n${savedUrl}`,
      });
      if (sent) emailed++;
    }

    // Record the run even when email isn't configured, so the in-app
    // "N new" badge (last_match_count) still updates.
    for (const d of dues) {
      const { error } = await supabaseAdmin
        .from("saved_searches")
        .update({ last_notified_at: now.toISOString(), last_match_count: d.fresh.length })
        .eq("id", d.id);
      if (!error) notifiedSearches++;
    }
  }

  return json({
    ok: true,
    searches: searches?.length ?? 0,
    due: considered,
    notified: notifiedSearches,
    emailed,
  });
}

export const Route = createFileRoute("/api/public/hooks/saved-search-alerts")({
  server: {
    handlers: {
      GET: async ({ request }) => run(request),
      POST: async ({ request }) => run(request),
    },
  },
});
