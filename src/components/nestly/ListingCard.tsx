import type { Listing } from "@/lib/listings-data";
import { formatMoney, getListingPhotos } from "@/lib/listings-data";
import { Link, useNavigate } from "@tanstack/react-router";
import { CompareToggle } from "@/components/nestly/CompareToggle";
import { useMemo, useState } from "react";
import { useListingLike } from "@/lib/listing-engagement";
import { toast } from "sonner";

// Prefetch the detail-page hero image on intent (hover/focus/touch) so that
// tapping a recommendation card feels instant — the loader is already
// preloaded by the router; this warms the largest paint asset too.
const prefetched = new Set<string>();
function prefetchListingHero(listing: Listing) {
  if (typeof window === "undefined") return;
  const hero = getListingPhotos(listing, 1)[0];
  if (!hero || prefetched.has(hero)) return;
  prefetched.add(hero);
  const img = new Image();
  // Match the detail-page mosaic's largest render size to hit the same cache entry.
  img.decoding = "async";
  img.src = hero;
}

export function ListingCard({ listing }: { listing: Listing }) {
  const fresh = listing.postedDaysAgo <= 3;
  const stale = listing.postedDaysAgo >= 10;
  const photos = useMemo(() => getListingPhotos(listing, 5), [listing]);
  const [photoIdx, setPhotoIdx] = useState(0);
  const like = useListingLike(listing.id);
  const navigate = useNavigate();
  const idNum = parseInt(listing.id.replace(/\D/g, ""), 10) || 0;
  const viewersNow = 2 + (idNum % 9);
  const matchScore = 78 + ((idNum * 7) % 22);
  const pricePerSqft = listing.areaSqft > 0 ? Math.round(listing.price / listing.areaSqft) : 0;
  const hotDeal = matchScore >= 92;

  return (
    <Link
      to="/listing/$id"
      params={{ id: listing.id }}
      preload="intent"
      onMouseEnter={() => prefetchListingHero(listing)}
      onFocus={() => prefetchListingHero(listing)}
      onTouchStart={() => prefetchListingHero(listing)}
      className={`group relative flex flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-tactile transition-all duration-500 ease-out hover:-translate-y-1.5 hover:border-ink/20 hover:shadow-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40 ${
        stale ? "opacity-70" : ""
      }`}
    >
      <article className="contents">
      <div className="relative aspect-[4/3] overflow-hidden bg-muted" onMouseLeave={() => setPhotoIdx(0)}>
        {photos.map((src, i) => (
          <img
            key={i}
            src={src.replace("w=1200", "w=640")}
            srcSet={`${src.replace("w=1200", "w=480")} 480w, ${src.replace("w=1200", "w=768")} 768w, ${src} 1200w`}
            sizes="(max-width: 640px) 90vw, (max-width: 1024px) 45vw, 380px"
            alt={i === 0 ? listing.title : ""}
            loading="lazy"
            decoding="async"
            width={800}
            height={600}
            className={`absolute inset-0 h-full w-full object-cover transition-all duration-700 ease-out ${
              i === photoIdx ? "scale-100 opacity-100 group-hover:scale-110" : "scale-105 opacity-0"
            }`}
          />
        ))}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-black/20" />
        <div className="absolute inset-0 z-10 hidden group-hover:flex">
          {photos.map((_, i) => (
            <div key={i} className="h-full flex-1" onMouseEnter={(e) => { e.stopPropagation(); setPhotoIdx(i); }} />
          ))}
        </div>
        <div className="pointer-events-none absolute bottom-[68px] left-1/2 z-20 flex -translate-x-1/2 gap-1 opacity-0 transition group-hover:opacity-100">
          {photos.map((_, i) => (
            <span key={i} className={`h-1 rounded-full transition-all ${i === photoIdx ? "w-5 bg-white" : "w-1.5 bg-white/50"}`} />
          ))}
        </div>
        <div className="absolute left-3 top-3 z-20 flex flex-wrap gap-1.5">
          {fresh && (
            <span className="inline-flex items-center gap-1 rounded-full bg-ink px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-white shadow-tactile">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-teal" />
              </span>
              Fresh
            </span>
          )}
          {hotDeal && (
            <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-coral to-[hsl(8_88%_58%)] px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-white shadow-tactile">
              🔥 Hot
            </span>
          )}
          {listing.ownerVerified && (
            <span className="inline-flex items-center gap-1 rounded-full bg-card/95 px-2.5 py-1 text-[11px] font-semibold text-ink shadow-tactile backdrop-blur">
              <svg viewBox="0 0 24 24" className="h-3 w-3 text-teal" fill="currentColor"><path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/></svg>
              Verified
            </span>
          )}
        </div>
        <div className="absolute right-3 top-3 z-20 flex items-center gap-1.5">
          <CompareToggle id={listing.id} title={listing.title} />
          <button
            type="button"
            aria-label={like.liked ? "Unlike listing" : "Like listing"}
            aria-pressed={like.liked}
            disabled={like.busy}
            onClick={async (e) => {
              e.preventDefault();
              e.stopPropagation();
              const r = await like.toggle();
              if (r.needsAuth) {
                toast.message("Sign in to save places", {
                  action: { label: "Sign in", onClick: () => navigate({ to: "/auth" }) },
                });
              }
            }}
            className={`grid h-9 w-9 place-items-center rounded-full bg-card/95 shadow-tactile backdrop-blur transition hover:scale-110 active:scale-95 ${like.liked ? "text-coral" : "text-ink hover:text-coral"}`}
          >
            <svg viewBox="0 0 24 24" className={`h-4 w-4 transition ${like.liked ? "scale-110" : ""}`} fill={like.liked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z"/></svg>
          </button>
        </div>
        <div className="absolute inset-x-0 bottom-0 z-20 flex items-end justify-between gap-3 p-3">
          <div className="min-w-0">
            <div className="tabular font-display text-xl font-bold leading-none text-white drop-shadow-md sm:text-2xl">
              {formatMoney(listing.price)}
              <span className="ml-1 text-[11px] font-medium uppercase tracking-wider text-white/80">
                {listing.listingType === "rent" ? "/mo" : ""}
              </span>
            </div>
            {pricePerSqft > 0 && (
              <div className="mt-1 text-[10px] font-medium uppercase tracking-wider text-white/70">
                ₹{pricePerSqft.toLocaleString("en-IN")}/sqft · {listing.areaSqft} sqft
              </div>
            )}
          </div>
          <div
            className="relative grid h-11 w-11 shrink-0 place-items-center rounded-full shadow-tactile"
            title={`${matchScore}% match`}
            style={{ background: `conic-gradient(hsl(155 60% 50%) ${matchScore * 3.6}deg, rgba(255,255,255,0.3) 0deg)` }}
          >
            <span className="grid h-8 w-8 place-items-center rounded-full bg-white text-[10px] font-bold tabular text-ink">
              {matchScore}
            </span>
          </div>
        </div>
        <div className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2 translate-y-3 rounded-full bg-black/60 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-white opacity-0 backdrop-blur transition-all duration-300 group-hover:-translate-y-16 group-hover:opacity-100">
          👀 {viewersNow} viewing now
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="min-w-0">
          <h3 className="truncate font-display text-lg font-semibold text-ink transition group-hover:text-coral">{listing.title}</h3>
          <p className="mt-0.5 flex items-center gap-1.5 truncate text-sm text-ink/60">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0 text-ink/40" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s-8-7-8-13a8 8 0 1 1 16 0c0 6-8 13-8 13Z"/><circle cx="12" cy="9" r="2.5"/></svg>
            <span className="truncate">{listing.neighborhood} · {listing.distanceKm} km to {listing.landmark}</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-xs text-ink/70">
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 font-medium capitalize">
            <span className="leading-none">{listing.propertyType === "flat" ? "🏢" : listing.propertyType === "house" ? "🏡" : listing.propertyType === "pg" ? "🛏️" : "🚪"}</span>
            {listing.propertyType}
          </span>
          <span className="rounded-full bg-muted px-2.5 py-1 font-medium">🛏 {listing.beds} · 🛁 {listing.baths}</span>
          <span className="rounded-full bg-muted px-2.5 py-1 font-medium capitalize">{listing.furnished}</span>
          {listing.amenities.slice(0, 2).map((a) => (
            <span key={a} className="hidden rounded-full border border-ink/10 px-2.5 py-1 font-medium text-ink/60 sm:inline-flex">{a}</span>
          ))}
        </div>
      </div>
      </article>
    </Link>
  );
}