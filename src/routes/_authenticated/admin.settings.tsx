import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { listFeatureFlags, setFeatureFlag } from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/admin/settings")({
  component: AdminSettings,
});

type Row = Awaited<ReturnType<typeof listFeatureFlags>>[number];

function AdminSettings() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    try {
      setRows(await listFeatureFlags());
    } catch (e: any) {
      toast.error(e.message);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function toggle(key: string, next: boolean) {
    setBusy(key);
    try {
      await setFeatureFlag({ data: { key, enabled: next } });
      setRows((r) => r?.map((x) => (x.key === key ? { ...x, enabled: next } : x)) ?? null);
      toast.success(`${key} → ${next ? "on" : "off"}`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-8">
      <header>
        <p className="text-[11px] uppercase tracking-[0.2em] text-ink/45">Ops</p>
        <h1 className="mt-1 text-3xl font-medium tracking-tight text-ink">Settings</h1>
        <p className="mt-1 text-[13px] text-ink/60">Toggle app-wide features without a deploy.</p>
      </header>

      <section className="rounded-2xl border border-border/70 bg-card">
        <div className="border-b border-border/70 px-5 py-3 text-sm font-medium text-ink">
          Feature flags
        </div>
        <ul className="divide-y divide-border/70">
          {rows === null && <li className="px-5 py-6 text-sm text-ink/50">Loading…</li>}
          {rows?.map((f) => (
            <li key={f.key} className="flex items-center justify-between gap-4 px-5 py-4">
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-ink">{f.key}</p>
                {f.description && <p className="text-[12px] text-ink/55">{f.description}</p>}
                <p className="mt-1 text-[11px] text-ink/40">
                  Updated {f.updated_at ? new Date(f.updated_at).toLocaleString() : "—"}
                </p>
              </div>
              <button
                disabled={busy === f.key}
                onClick={() => toggle(f.key, !f.enabled)}
                aria-pressed={f.enabled}
                className={`relative h-6 w-11 shrink-0 rounded-full border transition ${f.enabled ? "border-ink bg-ink" : "border-border bg-muted"}`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-cream shadow transition-all ${f.enabled ? "left-5" : "left-0.5"}`}
                />
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
