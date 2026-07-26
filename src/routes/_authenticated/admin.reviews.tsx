import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { listAllReviews, deleteReviewAdmin, bulkDeleteReviews } from "@/lib/admin.functions";
import { Star, Trash2, X } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/reviews")({
  component: AdminReviews,
});

type Row = Awaited<ReturnType<typeof listAllReviews>>[number];

function AdminReviews() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [minRating, setMinRating] = useState<number>(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  async function load() {
    setRows(null);
    setSelected(new Set());
    try {
      const data = await listAllReviews();
      setRows(data);
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function remove(id: string) {
    if (!confirm("Delete this review?")) return;
    try {
      await deleteReviewAdmin({ data: { id } });
      setRows((r) => r?.filter((x) => x.id !== id) ?? null);
      toast.success("Deleted");
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  const filtered = useMemo(() => rows?.filter((r) => r.rating >= minRating) ?? null, [rows, minRating]);

  function toggle(id: string) {
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  async function bulkRemove() {
    const ids = Array.from(selected);
    if (!ids.length) return;
    if (!confirm(`Delete ${ids.length} review${ids.length === 1 ? "" : "s"}?`)) return;
    setBusy(true);
    try {
      await bulkDeleteReviews({ data: { ids } });
      const s = new Set(ids);
      setRows((r) => r?.filter((x) => !s.has(x.id)) ?? null);
      setSelected(new Set());
      toast.success(`Deleted ${ids.length}`);
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.2em] text-ink/45">Moderation</p>
          <h1 className="mt-1 text-2xl font-medium tracking-tight text-ink sm:text-3xl">Reviews</h1>
        </div>
        <div className="-mx-1 flex items-center gap-1 overflow-x-auto rounded-full border border-border/70 bg-background p-1 text-[12px] scrollbar-hide sm:mx-0">
          {[0, 1, 2, 3, 4, 5].map((r) => (
            <button
              key={r}
              onClick={() => setMinRating(r)}
              className={`shrink-0 rounded-full px-3 py-1 ${minRating === r ? "bg-ink text-cream" : "text-ink/70 hover:text-ink"}`}
            >
              {r === 0 ? "All" : `${r}★+`}
            </button>
          ))}
        </div>
      </header>

      {rows === null && <p className="text-sm text-ink/50">Loading…</p>}
      {filtered?.length === 0 && (
        <p className="rounded-2xl border border-dashed border-border/70 p-8 text-center text-sm text-ink/50">
          No reviews yet.
        </p>
      )}

      <ul className="grid gap-3">
        {filtered?.map((r) => (
          <li key={r.id} className={`rounded-2xl border p-4 ${selected.has(r.id) ? "border-ink bg-muted/40" : "border-border/70 bg-card"}`}>
            <div className="flex items-start justify-between gap-4">
              <input
                type="checkbox"
                checked={selected.has(r.id)}
                onChange={() => toggle(r.id)}
                className="mt-1 h-4 w-4 shrink-0 accent-ink"
                aria-label="Select review"
              />
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-[12px] text-ink/60">
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-ink">
                    <Star className="h-3 w-3 fill-current" />
                    {r.rating}
                  </span>
                  <Link
                    to="/listing/$id"
                    params={{ id: r.listing_id }}
                    className="truncate hover:underline"
                  >
                    Listing {r.listing_id}
                  </Link>
                  <span>·</span>
                  <span>{new Date(r.created_at).toLocaleDateString()}</span>
                </div>
                {r.title && <p className="mt-2 font-medium text-ink">{r.title}</p>}
                <p className="mt-1 whitespace-pre-wrap text-[13px] text-ink/80">{r.body}</p>
              </div>
              <button
                onClick={() => remove(r.id)}
                className="shrink-0 rounded-full p-2 text-ink/50 hover:bg-red-50 hover:text-red-600"
                aria-label="Delete review"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </li>
        ))}
      </ul>

      {selected.size > 0 && (
        <div
          className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 sm:bottom-4"
          style={{ paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom))" }}
        >
          <div className="flex items-center gap-2 rounded-full border border-border/70 bg-card/95 px-3 py-2 shadow-xl backdrop-blur">
            <button onClick={() => setSelected(new Set())} className="inline-flex h-8 w-8 items-center justify-center rounded-full hover:bg-muted">
              <X className="h-4 w-4" />
            </button>
            <span className="px-2 text-[13px] font-medium text-ink">{selected.size} selected</span>
            <div className="mx-1 h-5 w-px bg-border/70" />
            <button
              disabled={busy}
              onClick={bulkRemove}
              className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12px] font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}