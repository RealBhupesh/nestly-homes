import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { listAllSavedSearches } from "@/lib/admin.functions";
import { toCSV, downloadCSV } from "@/lib/csv";
import { Download, Search, X } from "lucide-react";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

export const Route = createFileRoute("/_authenticated/admin/searches")({ component: AdminSearches });

type Row = Awaited<ReturnType<typeof listAllSavedSearches>>[number];

function AdminSearches() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [q, setQ] = useState("");
  const debouncedQ = useDebouncedValue(q, 200);

  useEffect(() => {
    listAllSavedSearches().then(setRows).catch((e) => toast.error(e.message));
  }, []);

  const filtered = useMemo(() => {
    if (!rows) return null;
    const t = debouncedQ.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter((r) =>
      r.name.toLowerCase().includes(t) ||
      r.email.toLowerCase().includes(t) ||
      JSON.stringify(r.params).toLowerCase().includes(t),
    );
  }, [rows, debouncedQ]);

  function exportCSV() {
    if (!filtered) return;
    const csv = toCSV(
      filtered.map((r) => ({
        name: r.name,
        email: r.email,
        params: JSON.stringify(r.params),
        created_at: r.created_at,
        last_seen_at: r.last_seen_at,
      })),
      ["name", "email", "params", "created_at", "last_seen_at"],
    );
    downloadCSV(`saved-searches-${Date.now()}.csv`, csv);
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-ink/45">Community</p>
          <h1 className="mt-1 text-3xl font-medium tracking-tight text-ink">Saved searches</h1>
          <p className="mt-1 text-[13px] text-ink/60">What people are hunting for.</p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <div className="relative w-full sm:w-56">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink/45" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Filter…"
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
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">By</th>
              <th className="px-4 py-3 font-medium">Params</th>
              <th className="px-4 py-3 font-medium">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/70">
            {rows === null && Array.from({ length: 6 }).map((_, i) => (
              <tr key={`sk-${i}`}>
                <td className="px-4 py-3"><div className="h-3.5 w-40 animate-pulse rounded bg-muted" /></td>
                <td className="px-4 py-3"><div className="h-3 w-48 animate-pulse rounded bg-muted/70" /></td>
                <td className="px-4 py-3"><div className="h-3 w-64 animate-pulse rounded bg-muted/70" /></td>
                <td className="px-4 py-3"><div className="h-3 w-24 animate-pulse rounded bg-muted/70" /></td>
              </tr>
            ))}
            {filtered?.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-ink/50">No saved searches.</td></tr>}
            {filtered?.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-3 font-medium text-ink">{r.name}</td>
                <td className="px-4 py-3 text-ink/70">{r.email}</td>
                <td className="px-4 py-3 text-ink/60">
                  <code className="rounded bg-muted px-1.5 py-0.5 text-[11px]">{JSON.stringify(r.params)}</code>
                </td>
                <td className="px-4 py-3 text-ink/60">{new Date(r.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
