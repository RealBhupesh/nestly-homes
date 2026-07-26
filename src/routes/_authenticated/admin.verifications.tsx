import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, Loader2, X } from "lucide-react";
import { decideVerification, listVerifications } from "@/lib/verification.functions";

export const Route = createFileRoute("/_authenticated/admin/verifications")({
  component: AdminVerifications,
  head: () => ({
    meta: [
      { title: "Owner verifications · Nestly admin" },
      { name: "description", content: "Review and approve owner verification requests on Nestly." },
    ],
  }),
});

type Row = Awaited<ReturnType<typeof listVerifications>>[number];
const FILTERS = ["pending", "approved", "rejected", "all"] as const;

function AdminVerifications() {
  const load = useServerFn(listVerifications);
  const decide = useServerFn(decideVerification);
  const [status, setStatus] = useState<(typeof FILTERS)[number]>("pending");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    load({ data: { status } })
      .then(setRows)
      .catch((e) => toast.error(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [status]);

  async function act(id: string, decision: "approved" | "rejected") {
    setBusy(id);
    try {
      const note = decision === "rejected" ? window.prompt("Reason (optional)") ?? undefined : undefined;
      await decide({ data: { id, decision, note } });
      setRows((p) => (status === "all" ? p.map((r) => (r.id === id ? { ...r, status: decision } : r)) : p.filter((r) => r.id !== id)));
      toast.success(`Request ${decision}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-[900px] px-4 py-8 sm:px-6">
      <header className="mb-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink/45">Trust &amp; safety</p>
        <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-ink">Owner verifications</h1>
      </header>

      <div className="mb-5 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setStatus(f)}
            className={`h-9 rounded-full border px-3.5 text-[12.5px] font-medium capitalize transition ${
              status === f ? "border-ink bg-ink text-background" : "border-ink/12 text-ink/65 hover:border-ink/35"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex h-32 items-center justify-center text-ink/40">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-ink/12 p-8 text-center text-[13.5px] text-ink/55">
          Nothing here.
        </p>
      ) : (
        <ul className="divide-y divide-ink/[0.06] rounded-2xl border border-ink/[0.08] bg-card">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="text-[14px] font-semibold text-ink">{r.full_name}</p>
                <p className="text-[12.5px] text-ink/55">
                  {r.display_name ?? "—"} · {r.phone} · {new Date(r.created_at).toLocaleDateString()}
                </p>
                {r.review_note && <p className="mt-1 text-[12.5px] text-ink/55">Note: {r.review_note}</p>}
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-ink/[0.06] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-ink/60">
                  {r.status}
                </span>
                {r.status !== "approved" && (
                  <button type="button" disabled={busy === r.id} onClick={() => act(r.id, "approved")} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-ink px-3.5 text-[12.5px] font-semibold text-background hover:brightness-110 disabled:opacity-60">
                    <Check className="h-3.5 w-3.5" /> Approve
                  </button>
                )}
                {r.status !== "rejected" && (
                  <button type="button" disabled={busy === r.id} onClick={() => act(r.id, "rejected")} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-ink/12 px-3.5 text-[12.5px] font-medium text-ink hover:bg-ink/[0.04] disabled:opacity-60">
                    <X className="h-3.5 w-3.5" /> Reject
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
