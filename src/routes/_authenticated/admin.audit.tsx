import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { listAuditLog } from "@/lib/admin.functions";
import { toCSV, downloadCSV } from "@/lib/csv";
import { Download, Search, X } from "lucide-react";
import { useRealtimeRefresh } from "@/hooks/use-realtime-refresh";
import { LiveIndicator } from "@/components/nestly/LiveIndicator";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

export const Route = createFileRoute("/_authenticated/admin/audit")({ component: AdminAudit });

type Row = Awaited<ReturnType<typeof listAuditLog>>[number];

const COLORS: Record<string, string> = {
  listing: "bg-blue-50 text-blue-700",
  review: "bg-amber-50 text-amber-700",
  user: "bg-purple-50 text-purple-700",
  photo: "bg-pink-50 text-pink-700",
  flag: "bg-emerald-50 text-emerald-700",
};

function AdminAudit() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [q, setQ] = useState("");
  const debouncedQ = useDebouncedValue(q, 200);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const load = () => {
    listAuditLog({ data: { q: "", limit: 300 } })
      .then((r) => { setRows(r); setLastUpdated(new Date()); })
      .catch((e) => toast.error(e.message));
  };
  useEffect(() => { load(); }, []);
  useRealtimeRefresh(["admin_audit_log"], load, { channelName: "admin-audit" });

  const filtered = useMemo(() => {
    if (!rows) return null;
    const t = debouncedQ.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter((r) =>
      r.action.toLowerCase().includes(t) ||
      r.entity_type.toLowerCase().includes(t) ||
      (r.actor_email ?? "").toLowerCase().includes(t) ||
      (r.entity_id ?? "").toLowerCase().includes(t),
    );
  }, [rows, debouncedQ]);

  function exportCSV() {
    if (!filtered) return;
    const csv = toCSV(
      filtered.map((r) => ({
        when: r.created_at,
        actor: r.actor_email,
        action: r.action,
        entity: r.entity_type,
        entity_id: r.entity_id ?? "",
        metadata: JSON.stringify(r.metadata),
      })),
      ["when", "actor", "action", "entity", "entity_id", "metadata"],
    );
    downloadCSV(`audit-${Date.now()}.csv`, csv);
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-ink/45">Ops</p>
          <h1 className="mt-1 text-3xl font-medium tracking-tight text-ink">Audit log</h1>
          <p className="mt-1 text-[13px] text-ink/60">Every admin action, timestamped.</p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <LiveIndicator lastUpdated={lastUpdated} />
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink/45" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Filter action, actor, entity…"
              enterKeyHint="search"
              inputMode="search"
              className="h-9 w-full rounded-full border border-border/70 bg-background pl-9 pr-9 text-[13px] outline-none focus:border-ink"
            />
            {q && (
              <button
                type="button"
                onClick={() => setQ("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-ink/50 hover:bg-muted hover:text-ink"
                aria-label="Clear filter"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <button
            onClick={exportCSV}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border/70 px-3 text-[12px] text-ink hover:bg-muted"
          >
            <Download className="h-3.5 w-3.5" /> CSV
          </button>
        </div>
      </header>

      <div className="overflow-hidden rounded-2xl border border-border/70 bg-card">
        <table className="w-full text-[13px]">
          <thead className="border-b border-border/70 text-left text-[11px] uppercase tracking-wider text-ink/50">
            <tr>
              <th className="px-4 py-3 font-medium">When</th>
              <th className="px-4 py-3 font-medium">Actor</th>
              <th className="px-4 py-3 font-medium">Action</th>
              <th className="px-4 py-3 font-medium">Entity</th>
              <th className="px-4 py-3 font-medium">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/70">
            {rows === null && Array.from({ length: 8 }).map((_, i) => (
              <tr key={`sk-${i}`}>
                <td className="px-4 py-3"><div className="h-3 w-32 animate-pulse rounded bg-muted/70" /></td>
                <td className="px-4 py-3"><div className="h-3.5 w-40 animate-pulse rounded bg-muted" /></td>
                <td className="px-4 py-3"><div className="h-4 w-20 animate-pulse rounded bg-muted" /></td>
                <td className="px-4 py-3"><div className="h-4 w-24 animate-pulse rounded-full bg-muted" /></td>
                <td className="px-4 py-3"><div className="h-3 w-56 animate-pulse rounded bg-muted/70" /></td>
              </tr>
            ))}
            {filtered?.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-ink/50">Nothing logged.</td></tr>}
            {filtered?.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-3 text-ink/60">{new Date(r.created_at).toLocaleString()}</td>
                <td className="px-4 py-3 text-ink">{r.actor_email}</td>
                <td className="px-4 py-3">
                  <code className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-ink">{r.action}</code>
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${COLORS[r.entity_type] ?? "bg-muted text-ink/70"}`}>
                    {r.entity_type}
                  </span>
                  {r.entity_id && <span className="ml-2 text-[11px] text-ink/40">{r.entity_id.slice(0, 8)}</span>}
                </td>
                <td className="px-4 py-3 text-ink/60">
                  {r.metadata && Object.keys(r.metadata).length > 0 && (
                    <code className="rounded bg-muted px-1.5 py-0.5 text-[11px]">{JSON.stringify(r.metadata)}</code>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
