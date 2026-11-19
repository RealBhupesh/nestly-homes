import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isUuid } from "@/lib/listings-data";

// Untyped table access — regenerated types lag behind migrations.
const db = supabase as unknown as {
  from: (t: string) => any;
};

// Record a view for a listing. Fire-and-forget; safe for anon.
// Uses a sessionStorage guard so refreshes within the same tab-session don't
// spam the table.
export function trackListingView(listingId: string) {
  if (typeof window === "undefined") return;
  // Only real DB listings are tracked (never legacy seed ids).
  if (!isUuid(listingId)) return;
  try {
    const key = `nly:view:${listingId}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
  } catch {
    // sessionStorage unavailable (private mode) — still record the view
  }
  // viewer_id is either null (anonymous) or the signed-in user's own id.
  supabase.auth.getSession().then(
    ({ data }) => {
      db.from("listing_views")
        .insert({
          listing_id: listingId,
          viewer_id: data.session?.user?.id ?? null,
        })
        .then(
          () => {},
          () => {},
        );
    },
    () => {},
  );
}

// Aggregate stats for a listing owner's dashboard.
export interface ListingStats {
  views: number;
  likes: number;
  messages: number;
}

export async function fetchOwnerListingStats(ids: string[]): Promise<Record<string, ListingStats>> {
  const out: Record<string, ListingStats> = {};
  for (const id of ids) out[id] = { views: 0, likes: 0, messages: 0 };
  if (ids.length === 0) return out;

  const [vRes, lRes, cRes] = await Promise.all([
    db.from("listing_views").select("listing_id").in("listing_id", ids),
    db.from("listing_likes").select("listing_id").in("listing_id", ids),
    db.from("conversations").select("listing_id").in("listing_id", ids),
  ]);

  for (const row of (vRes.data ?? []) as { listing_id: string }[]) {
    if (out[row.listing_id]) out[row.listing_id].views += 1;
  }
  for (const row of (lRes.data ?? []) as { listing_id: string }[]) {
    if (out[row.listing_id]) out[row.listing_id].likes += 1;
  }
  for (const row of (cRes.data ?? []) as { listing_id: string }[]) {
    if (out[row.listing_id]) out[row.listing_id].messages += 1;
  }
  return out;
}

// Client-side like state for the current viewer of a listing.
export function useListingLike(listingId: string) {
  const [liked, setLiked] = useState(false);
  const [count, setCount] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let mounted = true;
    if (!isUuid(listingId)) return;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      const uid = data.session?.user?.id ?? null;
      setUserId(uid);

      const [countRes, mineRes] = await Promise.all([
        db
          .from("listing_likes")
          .select("listing_id", { count: "exact", head: true })
          .eq("listing_id", listingId),
        uid
          ? db
              .from("listing_likes")
              .select("listing_id")
              .eq("listing_id", listingId)
              .eq("user_id", uid)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      if (!mounted) return;
      setCount(countRes.count ?? 0);
      setLiked(!!mineRes.data);
    })();
    return () => {
      mounted = false;
    };
  }, [listingId]);

  const toggle = useCallback(async () => {
    if (!userId) return { needsAuth: true as const };
    if (!isUuid(listingId)) return { needsAuth: false as const };
    if (busy) return { needsAuth: false as const };
    setBusy(true);
    const wasLiked = liked;
    // Optimistic
    setLiked(!wasLiked);
    setCount((c) => Math.max(0, c + (wasLiked ? -1 : 1)));
    const q = wasLiked
      ? db.from("listing_likes").delete().eq("listing_id", listingId).eq("user_id", userId)
      : db.from("listing_likes").insert({ listing_id: listingId, user_id: userId });
    const { error } = await q;
    if (error) {
      // Revert
      setLiked(wasLiked);
      setCount((c) => Math.max(0, c + (wasLiked ? 1 : -1)));
    }
    setBusy(false);
    return { needsAuth: false as const };
  }, [liked, listingId, userId, busy]);

  return { liked, count, toggle, authed: !!userId, busy };
}
