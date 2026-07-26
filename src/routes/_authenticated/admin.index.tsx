import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getAdminOverview, getAdminTimeseries } from "@/lib/admin.functions";
import { Building2, CheckCircle2, FileEdit, Archive, Star, ImageIcon, Users, TrendingUp, TrendingDown, ArrowUpRight, Sparkles } from "lucide-react";
import { AreaChart, Area, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useRealtimeRefresh } from "@/hooks/use-realtime-refresh";
import { LiveIndicator } from "@/components/nestly/LiveIndicator";

export const Route = createFileRoute("/_authenticated/admin/")({
  component: AdminOverview,
});

type Overview = Awaited<ReturnType<typeof getAdminOverview>>;
type Series = Awaited<ReturnType<typeof getAdminTimeseries>>;

function AdminOverview() {
  const [data, setData] = useState<Overview | null>(null);
  const [series, setSeries] = useState<Series | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const refresh = () => {
    Promise.all([
      getAdminOverview().then(setData),
      getAdminTimeseries({ data: { days: 30 } }).then(setSeries).catch(() => {}),
    ])
      .then(() => setLastUpdated(new Date()))
      .catch((e) => setErr(e.message));
  };
  useEffect(() => { refresh(); }, []);
  useRealtimeRefresh(["listings", "listing_reviews", "profiles"], refresh, { channelName: "admin-overview" });

  if (err) return <p className="text-sm text-red-600">{err}</p>;
  if (!data) return <OverviewSkeleton />;

  const stats = [
    { label: "Total listings", value: data.counts.listings, icon: Building2, tone: "ink", to: "/admin/listings" },
    { label: "Published", value: data.counts.published, icon: CheckCircle2, tone: "emerald", to: "/admin/listings" },
    { label: "Drafts", value: data.counts.drafts, icon: FileEdit, tone: "amber", to: "/admin/listings" },
    { label: "Archived", value: data.counts.archived, icon: Archive, tone: "slate", to: "/admin/listings" },
    { label: "Reviews", value: data.counts.reviews, icon: Star, tone: "coral", to: "/admin/reviews" },
    { label: "Photos", value: data.counts.photos, icon: ImageIcon, tone: "violet", to: "/admin/photos" },
    { label: "Users", value: data.counts.users, icon: Users, tone: "sky", to: "/admin/users" },
  ] as const;

  const last7Listings = (series ?? []).slice(-7).reduce((a, b) => a + b.listings, 0);
  const prev7Listings = (series ?? []).slice(-14, -7).reduce((a, b) => a + b.listings, 0);
  const trend = prev7Listings === 0 ? (last7Listings > 0 ? 100 : 0) : Math.round(((last7Listings - prev7Listings) / prev7Listings) * 100);
  const positive = trend >= 0;

  return (
    <div className="space-y-8">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl border border-border/60 bg-gradient-to-br from-ink via-ink to-ink/85 p-6 text-cream shadow-sm sm:p-8">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-coral/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-20 h-72 w-72 rounded-full bg-violet-500/20 blur-3xl" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:gap-6">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-cream/60">
              <Sparkles className="h-3 w-3" /> Command center
            </div>
            <h1 className="mt-2 text-2xl font-medium tracking-tight sm:text-4xl">Welcome back.</h1>
            <p className="mt-2 max-w-lg text-[12.5px] text-cream/70 sm:text-[13px]">
              A live snapshot of your marketplace. Moderate content, watch trends, and keep the community healthy — all from one place.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <Link to="/admin/listings" className="inline-flex items-center gap-1.5 rounded-full bg-cream px-4 py-1.5 text-[12px] font-medium text-ink transition hover:bg-cream/90">
                Review listings <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
              <Link to="/admin/reviews" className="inline-flex items-center gap-1.5 rounded-full border border-cream/25 px-4 py-1.5 text-[12px] text-cream/85 transition hover:border-cream/50 hover:text-cream">
                Moderate reviews
              </Link>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[12px] sm:flex-col sm:items-end">
            <LiveIndicator lastUpdated={lastUpdated} />
            <span className="whitespace-nowrap rounded-full border border-cream/20 bg-cream/5 px-3 py-1 text-cream/70">Last 30 days</span>
            <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-3 py-1 ${positive ? "bg-emerald-400/15 text-emerald-200" : "bg-rose-400/15 text-rose-200"}`}>
              {positive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {positive ? "+" : ""}{trend}% listings WoW
            </span>
          </div>
        </div>
      </section>

      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        {stats.map((s) => <KpiCard key={s.label} {...s} />)}
      </div>

      <section className="rounded-3xl border border-border/60 bg-card p-4 shadow-sm sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div>
            <h2 className="text-[15px] font-medium text-ink">Activity</h2>
            <p className="text-[12px] text-ink/55">Listings, users and reviews · last 30 days</p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-[11px] text-ink/60">
            <Legend color="var(--ink, #111)" label="Listings" />
            <Legend color="#8b5cf6" label="Users" />
            <Legend color="#f59e0b" label="Reviews" />
          </div>
        </div>
        <div className="mt-5 h-64">
          <ResponsiveContainer>
            <AreaChart data={series ?? []} margin={{ top: 10, right: 8, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="gL" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#111" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#111" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gU" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gR" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" tickFormatter={(d) => d.slice(5)} fontSize={10} stroke="#9ca3af" />
              <YAxis fontSize={10} stroke="#9ca3af" allowDecimals={false} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Area type="monotone" dataKey="listings" stroke="#111" fill="url(#gL)" strokeWidth={1.5} />
              <Area type="monotone" dataKey="users" stroke="#8b5cf6" fill="url(#gU)" strokeWidth={1.5} />
              <Area type="monotone" dataKey="reviews" stroke="#f59e0b" fill="url(#gR)" strokeWidth={1.5} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="rounded-3xl border border-border/60 bg-card p-5 shadow-sm sm:p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-[15px] font-medium text-ink">Recently updated</h2>
              <p className="text-[12px] text-ink/55">Latest edits across the catalog</p>
            </div>
            <Link to="/admin/listings" className="inline-flex items-center gap-1 text-[12px] text-ink/60 hover:text-ink">
              View all <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
          <ul className="mt-4 divide-y divide-border/60 text-[13px]">
            {data.recent.map((l: any) => (
              <li key={l.id} className="group flex items-center justify-between gap-3 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-muted text-ink/60">
                    <Building2 className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <Link
                      to="/listing/$id"
                      params={{ id: l.id }}
                      className="block truncate font-medium text-ink group-hover:underline"
                    >
                      {l.title}
                    </Link>
                    <p className="truncate text-[12px] text-ink/50">
                      {l.city} · <span className="capitalize">{l.mode}</span>
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <StatusPill status={l.status} />
                  <span className="hidden text-[11px] text-ink/45 sm:inline">
                    {new Date(l.updated_at).toLocaleDateString()}
                  </span>
                </div>
              </li>
            ))}
            {data.recent.length === 0 && <li className="py-6 text-center text-ink/50">No listings yet.</li>}
          </ul>
        </div>

        <div className="rounded-3xl border border-border/60 bg-card p-5 shadow-sm sm:p-6">
          <div>
            <h2 className="text-[15px] font-medium text-ink">Top cities</h2>
            <p className="text-[12px] text-ink/55">Where your inventory lives</p>
          </div>
          <ul className="mt-4 space-y-3 text-[13px]">
            {data.topCities.map((c) => {
              const max = Math.max(...data.topCities.map((x) => x.count), 1);
              const pct = Math.round((c.count / max) * 100);
              return (
                <li key={c.city}>
                  <div className="flex items-center justify-between text-[13px]">
                    <span className="font-medium text-ink">{c.city}</span>
                    <span className="text-ink/50">{c.count} listings</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-gradient-to-r from-ink to-ink/60 transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </li>
              );
            })}
            {data.topCities.length === 0 && <li className="py-6 text-center text-ink/50">No data yet.</li>}
          </ul>
        </div>
      </section>
    </div>
  );
}

const TONE: Record<string, { bg: string; ring: string; icon: string; accent: string }> = {
  ink:     { bg: "from-ink/5 to-transparent",           ring: "ring-ink/10",           icon: "bg-ink text-cream",             accent: "text-ink" },
  emerald: { bg: "from-emerald-500/10 to-transparent",  ring: "ring-emerald-500/15",   icon: "bg-emerald-500 text-white",     accent: "text-emerald-700" },
  amber:   { bg: "from-amber-500/10 to-transparent",    ring: "ring-amber-500/15",     icon: "bg-amber-500 text-white",       accent: "text-amber-700" },
  slate:   { bg: "from-slate-500/10 to-transparent",    ring: "ring-slate-500/15",     icon: "bg-slate-500 text-white",       accent: "text-slate-700" },
  coral:   { bg: "from-coral/10 to-transparent",        ring: "ring-coral/15",         icon: "bg-coral text-cream",           accent: "text-coral" },
  violet:  { bg: "from-violet-500/10 to-transparent",   ring: "ring-violet-500/15",    icon: "bg-violet-500 text-white",      accent: "text-violet-700" },
  sky:     { bg: "from-sky-500/10 to-transparent",      ring: "ring-sky-500/15",       icon: "bg-sky-500 text-white",         accent: "text-sky-700" },
};

function KpiCard({ label, value, icon: Icon, tone, to }: { label: string; value: number; icon: any; tone: string; to: string }) {
  const t = TONE[tone] ?? TONE.ink;
  return (
    <Link
      to={to as any}
      className={`group relative overflow-hidden rounded-2xl border border-border/60 bg-card p-4 shadow-sm ring-1 ${t.ring} transition hover:-translate-y-0.5 hover:shadow-md`}
    >
      <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${t.bg}`} />
      <div className="relative flex items-start justify-between">
        <span className={`grid h-9 w-9 place-items-center rounded-xl ${t.icon} shadow-sm`}>
          <Icon className="h-4 w-4" />
        </span>
        <ArrowUpRight className="h-3.5 w-3.5 text-ink/25 transition group-hover:text-ink" />
      </div>
      <p className="relative mt-3 text-[11px] font-medium uppercase tracking-wider text-ink/55">{label}</p>
      <p className="relative mt-1 text-2xl font-medium tracking-tight text-ink">{value.toLocaleString()}</p>
    </Link>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    published: "bg-emerald-50 text-emerald-700 ring-emerald-500/20",
    draft: "bg-amber-50 text-amber-700 ring-amber-500/20",
    archived: "bg-slate-100 text-slate-600 ring-slate-500/20",
    pending: "bg-sky-50 text-sky-700 ring-sky-500/20",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ring-1 ${map[status] ?? "bg-muted text-ink/70 ring-border"}`}>
      {status}
    </span>
  );
}

function OverviewSkeleton() {
  return (
    <div className="space-y-8">
      <div className="h-52 animate-pulse rounded-3xl bg-muted/70" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-2xl bg-muted/60" />
        ))}
      </div>
      <div className="h-72 animate-pulse rounded-3xl bg-muted/60" />
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block h-2 w-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}