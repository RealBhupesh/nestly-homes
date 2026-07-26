import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type Review = {
  id: string;
  listing_id: string;
  user_id: string;
  rating: number;
  title: string | null;
  body: string;
  created_at: string;
  updated_at: string;
  reviewer?: { display_name: string | null; avatar_url: string | null } | null;
};

function StarRow({ value, onChange, size = 18 }: { value: number; onChange?: (n: number) => void; size?: number }) {
  const [hover, setHover] = useState(0);
  const show = hover || value;
  const interactive = Boolean(onChange);
  return (
    <div
      className="inline-flex items-center gap-0.5"
      onMouseLeave={interactive ? () => setHover(0) : undefined}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          aria-label={`${n} star${n > 1 ? "s" : ""}`}
          disabled={!interactive}
          onMouseEnter={interactive ? () => setHover(n) : undefined}
          onClick={interactive ? () => onChange!(n) : undefined}
          className={`transition ${interactive ? "cursor-pointer hover:scale-110" : "cursor-default"}`}
        >
          <svg viewBox="0 0 24 24" width={size} height={size} className={n <= show ? "fill-coral" : "fill-ink/15"}>
            <path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4 6.1 20.5l1.2-6.5L2.5 9.4l6.6-.9L12 2.5z" />
          </svg>
        </button>
      ))}
    </div>
  );
}

function timeAgo(iso: string): string {
  const s = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.round(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.round(mo / 12)}y ago`;
}

export function ReviewsSection({ listingId }: { listingId: string }) {
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [rating, setRating] = useState(0);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("listing_reviews")
      .select("id, listing_id, user_id, rating, title, body, created_at, updated_at")
      .eq("listing_id", listingId)
      .order("created_at", { ascending: false });
    if (error) {
      console.error(error);
      toast.error("Couldn't load reviews");
      setReviews([]);
    } else {
      const rows = (data ?? []) as Review[];
      // Best-effort profile join (profiles are readable per RLS).
      const ids = Array.from(new Set(rows.map((r) => r.user_id)));
      if (ids.length > 0) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, display_name, avatar_url")
          .in("id", ids);
        const map = new Map((profs ?? []).map((p) => [p.id, p]));
        rows.forEach((r) => {
          const p = map.get(r.user_id);
          r.reviewer = p ? { display_name: p.display_name, avatar_url: p.avatar_url } : null;
        });
      }
      setReviews(rows);
    }
    setLoading(false);
  }, [listingId]);

  useEffect(() => {
    let alive = true;
    supabase.auth.getUser().then(({ data }) => {
      if (alive) setUserId(data.user?.id ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (alive) setUserId(session?.user?.id ?? null);
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => { void load(); }, [load]);

  const myReview = useMemo(
    () => (userId && reviews ? reviews.find((r) => r.user_id === userId) ?? null : null),
    [userId, reviews],
  );

  useEffect(() => {
    if (myReview && !editing) {
      setRating(myReview.rating);
      setTitle(myReview.title ?? "");
      setBody(myReview.body);
    }
  }, [myReview, editing]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;
    if (rating < 1) { toast.warning("Pick a rating"); return; }
    if (body.trim().length < 4) { toast.warning("Say a bit more"); return; }
    setBusy(true);
    const payload = {
      listing_id: listingId,
      user_id: userId,
      rating,
      title: title.trim() || null,
      body: body.trim(),
    };
    const { error } = await supabase
      .from("listing_reviews")
      .upsert(payload, { onConflict: "listing_id,user_id" });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(myReview ? "Review updated" : "Review posted");
    setEditing(false);
    await load();
  };

  const remove = async () => {
    if (!myReview) return;
    if (!confirm("Delete your review?")) return;
    const { error } = await supabase.from("listing_reviews").delete().eq("id", myReview.id);
    if (error) { toast.error(error.message); return; }
    setRating(0); setTitle(""); setBody("");
    toast.success("Review deleted");
    await load();
  };

  const list = reviews ?? [];
  const count = list.length;
  const avg = count === 0 ? 0 : list.reduce((s, r) => s + r.rating, 0) / count;
  const dist = [5, 4, 3, 2, 1].map((n) => ({
    n,
    pct: count === 0 ? 0 : Math.round((list.filter((r) => r.rating === n).length / count) * 100),
  }));

  return (
    <section className="mt-16 border-t border-ink/[0.06] pt-10">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-display text-2xl font-semibold text-ink">Reviews</h2>
        {count > 0 && (
          <div className="flex items-center gap-2 text-sm text-ink/70">
            <StarRow value={Math.round(avg)} size={14} />
            <span className="tabular font-semibold text-ink">{avg.toFixed(1)}</span>
            <span>· {count}</span>
          </div>
        )}
      </div>

      <div className="mt-6 grid gap-8 lg:grid-cols-[280px_minmax(0,1fr)]">
        {/* Summary + form */}
        <div className="space-y-6">
          {count > 0 && (
            <div className="rounded-2xl border border-ink/[0.08] bg-background p-4">
              <div className="tabular font-display text-3xl font-semibold text-ink">{avg.toFixed(1)}</div>
              <div className="mt-1"><StarRow value={Math.round(avg)} size={14} /></div>
              <div className="mt-1 text-[11.5px] text-ink/55">Based on {count} review{count === 1 ? "" : "s"}</div>
              <ul className="mt-4 space-y-1.5">
                {dist.map((d) => (
                  <li key={d.n} className="flex items-center gap-2 text-[11.5px] text-ink/60">
                    <span className="w-3 tabular">{d.n}</span>
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink/[0.06]">
                      <span className="block h-full rounded-full bg-coral" style={{ width: `${d.pct}%` }} />
                    </span>
                    <span className="w-8 text-right tabular">{d.pct}%</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {userId ? (
            <form onSubmit={submit} className="rounded-2xl border border-ink/[0.08] bg-background p-4">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-ink/50">
                  {myReview && !editing ? "Your review" : myReview ? "Edit review" : "Write a review"}
                </p>
                {myReview && !editing && (
                  <button type="button" onClick={() => setEditing(true)} className="text-[11.5px] font-medium text-ink/60 hover:text-ink">Edit</button>
                )}
              </div>

              <div className="mt-3"><StarRow value={rating} onChange={setRating} /></div>

              <input
                value={title}
                onChange={(e) => setTitle(e.target.value.slice(0, 100))}
                placeholder="Summary (optional)"
                className="mt-3 w-full rounded-lg border border-ink/[0.1] bg-background px-3 py-2 text-sm placeholder:text-ink/40 focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value.slice(0, 2000))}
                rows={4}
                placeholder="What was your experience with this place?"
                className="mt-2 w-full resize-none rounded-lg border border-ink/[0.1] bg-background px-3 py-2 text-sm placeholder:text-ink/40 focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <div className="mt-1 text-right text-[11px] text-ink/40 tabular">{body.length}/2000</div>

              <div className="mt-3 flex items-center justify-between">
                {myReview ? (
                  <button type="button" onClick={remove} className="text-[11.5px] font-medium text-primary hover:underline">Delete</button>
                ) : <span />}
                <div className="flex gap-2">
                  {myReview && editing && (
                    <button
                      type="button"
                      onClick={() => { setEditing(false); setRating(myReview.rating); setTitle(myReview.title ?? ""); setBody(myReview.body); }}
                      className="rounded-full px-3 py-1.5 text-xs font-medium text-ink/60 hover:text-ink"
                    >
                      Cancel
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={busy}
                    className="rounded-full bg-ink px-4 py-1.5 text-xs font-semibold text-cream shadow-tactile transition hover:-translate-y-0.5 hover:shadow-lift disabled:opacity-50"
                  >
                    {busy ? "Posting…" : myReview ? "Save" : "Post review"}
                  </button>
                </div>
              </div>
            </form>
          ) : (
            <div className="rounded-2xl border border-dashed border-ink/[0.12] bg-background p-4 text-center">
              <p className="text-sm text-ink/70">Sign in to leave a review.</p>
              <Link to="/auth" className="mt-3 inline-flex rounded-full bg-ink px-4 py-1.5 text-xs font-semibold text-cream shadow-tactile hover:-translate-y-0.5 hover:shadow-lift">
                Sign in
              </Link>
            </div>
          )}
        </div>

        {/* Feed */}
        <div>
          {loading ? (
            <div className="grid gap-3">
              {[0, 1].map((i) => (
                <div key={i} className="h-24 animate-pulse rounded-2xl bg-ink/[0.05]" />
              ))}
            </div>
          ) : list.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-ink/[0.12] p-8 text-center">
              <p className="font-display text-lg font-semibold text-ink">No reviews yet</p>
              <p className="mt-1 text-sm text-ink/55">Be the first to share what it's like to live here.</p>
            </div>
          ) : (
            <ul className="space-y-4">
              {list.map((r) => {
                const name = r.reviewer?.display_name || "Anonymous";
                const isMine = r.user_id === userId;
                return (
                  <li key={r.id} className="rounded-2xl border border-ink/[0.08] bg-background p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        {r.reviewer?.avatar_url ? (
                          <img src={r.reviewer.avatar_url} alt="" className="h-9 w-9 rounded-full object-cover" />
                        ) : (
                          <div className="grid h-9 w-9 place-items-center rounded-full bg-ink text-background font-display text-xs font-semibold">
                            {name.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <p className="text-[13px] font-semibold text-ink">
                            {name} {isMine && <span className="ml-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">You</span>}
                          </p>
                          <div className="mt-0.5 flex items-center gap-2">
                            <StarRow value={r.rating} size={12} />
                            <span className="text-[11px] text-ink/50">{timeAgo(r.created_at)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    {r.title && <p className="mt-3 text-sm font-semibold text-ink">{r.title}</p>}
                    <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-ink/75">{r.body}</p>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}