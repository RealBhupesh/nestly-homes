import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getAdminAnalytics } from "@/lib/admin.functions";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend as RLegend,
} from "recharts";
import { useRealtimeRefresh } from "@/hooks/use-realtime-refresh";
import { LiveIndicator } from "@/components/nestly/LiveIndicator";

export const Route = createFileRoute("/_authenticated/admin/analytics")({
  component: AdminAnalytics,
});

type Data = Awaited<ReturnType<typeof getAdminAnalytics>>;
const COLORS = ["#111827", "#8b5cf6", "#f59e0b", "#10b981", "#ef4444", "#06b6d4", "#f97316"];
const fmt = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

function AdminAnalytics() {
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const load = () => {
    getAdminAnalytics()
      .then((r) => {
        setD(r);
        setLastUpdated(new Date());
      })
      .catch((e) => setErr(e.message));
  };
  useEffect(() => {
    load();
  }, []);
  useRealtimeRefresh(["listings"], load, { channelName: "admin-analytics" });
  if (err) return <p className="text-sm text-red-600">{err}</p>;
  if (!d) return <p className="text-sm text-ink/50">Loading…</p>;

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.2em] text-ink/45">Insights</p>
          <h1 className="mt-1 text-2xl font-medium tracking-tight text-ink sm:text-3xl">
            Analytics
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[12px]">
          <LiveIndicator lastUpdated={lastUpdated} />
          <span className="whitespace-nowrap rounded-full bg-muted px-3 py-1 text-ink/60">
            {d.total.toLocaleString()} listings analyzed
          </span>
        </div>
      </header>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-border/70 bg-card p-5">
          <h2 className="text-sm font-medium text-ink">Price by mode</h2>
          <div className="mt-4 grid gap-3">
            {d.byMode.map((m) => (
              <div key={m.mode} className="rounded-xl border border-border/70 p-3">
                <div className="flex items-center justify-between text-[13px]">
                  <span className="font-medium capitalize text-ink">{m.mode}</span>
                  <span className="text-ink/50">{m.count} listings</span>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-[12px] text-ink/70">
                  <Stat label="Min" value={fmt(m.min)} />
                  <Stat label="Avg" value={fmt(m.avg)} />
                  <Stat label="Max" value={fmt(m.max)} />
                </div>
              </div>
            ))}
            {d.byMode.length === 0 && <p className="text-[13px] text-ink/50">No data.</p>}
          </div>
        </div>

        <div className="rounded-2xl border border-border/70 bg-card p-5">
          <h2 className="text-sm font-medium text-ink">Property types</h2>
          <div className="mt-4 h-64">
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={d.byType}
                  dataKey="count"
                  nameKey="type"
                  innerRadius={50}
                  outerRadius={90}
                  paddingAngle={2}
                >
                  {d.byType.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <RLegend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-border/70 bg-card p-5">
          <h2 className="text-sm font-medium text-ink">Bedrooms distribution</h2>
          <div className="mt-4 h-56">
            <ResponsiveContainer>
              <BarChart data={d.byBedrooms} margin={{ top: 10, right: 8, left: -20, bottom: 0 }}>
                <XAxis dataKey="bedrooms" fontSize={11} stroke="#9ca3af" />
                <YAxis fontSize={11} stroke="#9ca3af" allowDecimals={false} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Bar dataKey="count" fill="#111827" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-border/70 bg-card p-5">
          <h2 className="text-sm font-medium text-ink">Top owners</h2>
          <ul className="mt-3 divide-y divide-border/70 text-[13px]">
            {d.topOwners.map((o) => (
              <li key={o.id} className="flex items-center justify-between py-2.5">
                <span className="truncate text-ink">{o.email}</span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-ink/70">
                  {o.count} listings
                </span>
              </li>
            ))}
            {d.topOwners.length === 0 && <li className="py-2 text-ink/50">No owners.</li>}
          </ul>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/60 px-2 py-1.5">
      <p className="text-[10px] uppercase tracking-wider text-ink/45">{label}</p>
      <p className="mt-0.5 font-medium text-ink">{value}</p>
    </div>
  );
}
