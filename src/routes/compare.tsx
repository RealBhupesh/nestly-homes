import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { formatDistanceToNow } from "date-fns";
import { useEffect } from "react";
import { clearCompare, removeCompare, retainCompare, useCompareIds } from "@/lib/compare-store";
import { getListingsByIds } from "@/lib/public-listings.functions";
import {
  FURNISHING_LABEL,
  PROPERTY_TYPE_ICON,
  PROPERTY_TYPE_LABEL,
  formatMoney,
  type Listing,
} from "@/lib/listings-data";

export const Route = createFileRoute("/compare")({
  head: () => ({
    meta: [
      { title: "Compare homes — Nestly" },
      {
        name: "description",
        content:
          "See rentals and homes side-by-side. Compare price, size, amenities and location at a glance.",
      },
      { property: "og:title", content: "Compare homes — Nestly" },
      {
        property: "og:description",
        content:
          "See rentals and homes side-by-side. Compare price, size, amenities and location at a glance.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ComparePage,
});

function ComparePage() {
  const ids = useCompareIds();
  const fetchByIds = useServerFn(getListingsByIds);
  const { data, isLoading, isError, isSuccess, refetch } = useQuery({
    queryKey: ["listings-by-ids", ids],
    queryFn: () => fetchByIds({ data: { ids } }),
    enabled: ids.length > 0,
    staleTime: 60_000,
  });
  // Drop ids that were unpublished since they were added.
  useEffect(() => {
    if (isSuccess && data) retainCompare(data.map((l) => l.id));
  }, [isSuccess, data]);
  const items = ids.length === 0 ? [] : (data ?? []);

  return (
    <div className="min-h-svh bg-background">
      <div className="mx-auto max-w-6xl px-5 pb-24 pt-10 sm:px-8 sm:pt-14">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
              Side by side
            </p>
            <h1 className="mt-2 font-display text-4xl font-bold tracking-tight text-ink sm:text-5xl">
              Compare homes
            </h1>
            <p className="mt-2 max-w-xl text-sm text-ink/60">
              Line up the details that matter — price, space, amenities and location — then pick the
              one that clicks.
            </p>
          </div>
          {items.length > 0 && (
            <button
              type="button"
              onClick={clearCompare}
              className="rounded-full border border-border bg-card px-4 py-2 text-xs font-semibold text-ink/70 transition hover:text-ink"
            >
              Clear all
            </button>
          )}
        </div>

        {ids.length > 0 && isLoading ? (
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-busy="true">
            {ids.map((id) => (
              <div key={id} className="h-72 animate-pulse rounded-3xl bg-ink/[0.05]" />
            ))}
          </div>
        ) : isError ? (
          <div className="mt-12 rounded-3xl border border-dashed border-border bg-card p-10 text-center">
            <h2 className="font-display text-xl font-semibold text-ink">
              Couldn't load your shortlist
            </h2>
            <p className="mt-2 text-sm text-ink/60">Check your connection and try again.</p>
            <button
              type="button"
              onClick={() => refetch()}
              className="mt-5 inline-flex rounded-full bg-ink px-5 py-2 text-sm font-semibold text-cream"
            >
              Retry
            </button>
          </div>
        ) : items.length === 0 ? (
          <EmptyCompare />
        ) : (
          <CompareGrid items={items} />
        )}
      </div>
    </div>
  );
}

function EmptyCompare() {
  return (
    <div className="mt-12 rounded-3xl border border-dashed border-border bg-card p-12 text-center">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-muted text-ink/60">
        <svg
          viewBox="0 0 24 24"
          className="h-6 w-6"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M8 3 4 7l4 4" />
          <path d="M4 7h16" />
          <path d="m16 21 4-4-4-4" />
          <path d="M20 17H4" />
        </svg>
      </div>
      <h2 className="mt-5 font-display text-2xl font-semibold text-ink">Nothing to compare yet</h2>
      <p className="mt-2 text-sm text-ink/60">
        Tap the compare icon on any listing to add it here. You can compare up to four at once.
      </p>
      <Link
        to="/search"
        search={{ mode: "rent" } as never}
        className="mt-6 inline-flex rounded-full bg-ink px-5 py-2 text-sm font-semibold text-cream shadow-tactile transition hover:-translate-y-0.5 hover:shadow-lift"
      >
        Browse homes
      </Link>
    </div>
  );
}

function CompareGrid({ items }: { items: Listing[] }) {
  // Union of amenities across all items — so each row is meaningful.
  const amenityKeys = Array.from(new Set(items.flatMap((l) => l.amenities))).sort();

  return (
    <div className="mt-10 overflow-x-auto">
      <div
        className="grid min-w-[720px] gap-px rounded-3xl bg-border"
        style={{ gridTemplateColumns: `220px repeat(${items.length}, minmax(200px, 1fr))` }}
      >
        {/* Header row: hero cards */}
        <div className="bg-card p-4" />
        {items.map((l) => (
          <div key={`h-${l.id}`} className="relative bg-card p-4">
            <button
              type="button"
              onClick={() => removeCompare(l.id)}
              aria-label={`Remove ${l.title}`}
              className="absolute right-3 top-3 grid h-7 w-7 place-items-center rounded-full bg-ink/90 text-cream shadow-tactile transition hover:scale-110"
            >
              ×
            </button>
            <Link to="/listing/$id" params={{ id: l.id }} className="block">
              <div className="overflow-hidden rounded-2xl bg-muted">
                {l.photo ? (
                  <img
                    src={l.photo}
                    alt={l.title}
                    loading="lazy"
                    className="aspect-[4/3] w-full object-cover transition duration-500 hover:scale-105"
                  />
                ) : (
                  <div className="grid aspect-[4/3] w-full place-items-center text-4xl" aria-hidden>
                    {PROPERTY_TYPE_ICON[l.propertyType]}
                  </div>
                )}
              </div>
              <h3 className="mt-3 line-clamp-2 font-display text-base font-semibold text-ink">
                {l.title}
              </h3>
              <p className="mt-0.5 truncate text-xs text-ink/60">
                {l.neighborhood} · {l.city}
              </p>
            </Link>
          </div>
        ))}

        <Row label="Price">
          {items.map((l) => (
            <Cell key={`p-${l.id}`}>
              <div className="tabular font-display text-lg font-bold text-ink">
                {formatMoney(l.price)}
              </div>
              <div className="text-[10px] font-medium uppercase tracking-wide text-ink/50">
                {l.listingType === "rent" ? "per month" : "sale price"}
              </div>
            </Cell>
          ))}
        </Row>

        <Row label="Deposit">
          {items.map((l) => (
            <Cell key={`d-${l.id}`}>
              <span className="tabular text-sm text-ink">
                {l.deposit != null ? formatMoney(l.deposit) : "—"}
              </span>
            </Cell>
          ))}
        </Row>

        <Row label="Type">
          {items.map((l) => (
            <Cell key={`t-${l.id}`}>
              <span className="text-sm text-ink">{PROPERTY_TYPE_LABEL[l.propertyType]}</span>
            </Cell>
          ))}
        </Row>

        <Row label="Beds · Baths">
          {items.map((l) => (
            <Cell key={`b-${l.id}`}>
              <span className="tabular text-sm text-ink">
                {l.beds} bed · {l.baths} bath
              </span>
            </Cell>
          ))}
        </Row>

        <Row label="Area">
          {items.map((l) => (
            <Cell key={`a-${l.id}`}>
              <span className="tabular text-sm text-ink">
                {l.areaSqft ? `${l.areaSqft} sqft` : "—"}
              </span>
            </Cell>
          ))}
        </Row>

        <Row label="Furnishing">
          {items.map((l) => (
            <Cell key={`f-${l.id}`}>
              <span className="text-sm text-ink">{FURNISHING_LABEL[l.furnished]}</span>
            </Cell>
          ))}
        </Row>

        <Row label="Location">
          {items.map((l) => (
            <Cell key={`loc-${l.id}`}>
              <span className="text-sm text-ink">
                {l.neighborhood !== l.city ? `${l.neighborhood}, ${l.city}` : l.city}
              </span>
              {l.landmark && (
                <div className="mt-0.5 text-[11px] text-ink/50">Near {l.landmark}</div>
              )}
            </Cell>
          ))}
        </Row>

        <Row label="Posted">
          {items.map((l) => (
            <Cell key={`pd-${l.id}`}>
              <span className="text-sm text-ink">
                {formatDistanceToNow(new Date(l.postedAt), { addSuffix: true })}
              </span>
            </Cell>
          ))}
        </Row>

        <Row label="Owner">
          {items.map((l) => (
            <Cell key={`o-${l.id}`}>
              <div className="flex items-center gap-1.5 text-sm text-ink">
                {l.ownerName}
                {l.ownerVerified && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-teal/15 px-1.5 py-0.5 text-[10px] font-semibold text-teal">
                    <svg viewBox="0 0 24 24" className="h-2.5 w-2.5" fill="currentColor">
                      <path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z" />
                    </svg>
                    Verified
                  </span>
                )}
              </div>
            </Cell>
          ))}
        </Row>

        {amenityKeys.length > 0 && (
          <>
            <div className="col-span-full bg-card px-4 pb-2 pt-6 text-[11px] font-semibold uppercase tracking-[0.18em] text-ink/50">
              Amenities
            </div>
            {amenityKeys.map((amenity) => (
              <Row key={amenity} label={amenity}>
                {items.map((l) => (
                  <Cell key={`am-${l.id}-${amenity}`}>
                    {l.amenities.includes(amenity) ? (
                      <svg viewBox="0 0 24 24" className="h-4 w-4 text-teal" fill="currentColor">
                        <path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z" />
                      </svg>
                    ) : (
                      <span className="text-ink/25">—</span>
                    )}
                  </Cell>
                ))}
              </Row>
            ))}
          </>
        )}

        <Row label="">
          {items.map((l) => (
            <Cell key={`v-${l.id}`}>
              <Link
                to="/listing/$id"
                params={{ id: l.id }}
                className="inline-flex rounded-full bg-ink px-3.5 py-1.5 text-xs font-semibold text-cream shadow-tactile transition hover:-translate-y-0.5 hover:shadow-lift"
              >
                View listing
              </Link>
            </Cell>
          ))}
        </Row>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <div className="bg-card px-4 py-4 text-xs font-semibold uppercase tracking-wide text-ink/50">
        {label}
      </div>
      {children}
    </>
  );
}

function Cell({ children }: { children: React.ReactNode }) {
  return <div className="bg-card px-4 py-4">{children}</div>;
}
