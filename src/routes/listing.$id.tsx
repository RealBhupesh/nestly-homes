import {
  createFileRoute,
  Link,
  notFound,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { ClientOnly } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { useAuth } from "@/hooks/use-auth";
import { openConversation, sendMessage } from "@/lib/messaging.functions";
import { getListing, getSimilarListings } from "@/lib/public-listings.functions";
import {
  FURNISHING_LABEL,
  PROPERTY_TYPE_ICON,
  PROPERTY_TYPE_LABEL,
  formatMoney,
  hasCoords,
  isUuid,
  ownerFirstName,
  type Listing,
} from "@/lib/listings-data";
import { absoluteUrl, OG_IMAGE_URL, SITE_NAME } from "@/lib/site";
import { ListingCard } from "@/components/nestly/ListingCard";
import { ReviewsSection, ReportDialog } from "@/components/nestly/ReviewsSection";
import { BookTourSheet } from "@/components/nestly/BookTourSheet";
import { trackListingView, useListingLike } from "@/lib/listing-engagement";
import { toast } from "sonner";

const ListingsMap = lazy(() =>
  import("@/components/nestly/ListingsMap").then((m) => ({ default: m.ListingsMap })),
);

function describe(listing: Listing): string {
  const bits = [
    `${PROPERTY_TYPE_LABEL[listing.propertyType]} for ${listing.listingType} in ${listing.neighborhood}, ${listing.city}`,
    `${listing.beds} bed · ${listing.baths} bath${listing.areaSqft ? ` · ${listing.areaSqft} sq ft` : ""}`,
    `${formatMoney(listing.price)}${listing.listingType === "rent" ? "/mo" : ""}`,
    "Direct from owner, 0% brokerage on Nestly.",
  ];
  return bits.join(". ");
}

function listingJsonLd(listing: Listing, url: string) {
  const isRent = listing.listingType === "rent";
  const geo = hasCoords(listing)
    ? { "@type": "GeoCoordinates", latitude: listing.lat, longitude: listing.lng }
    : undefined;
  const residenceType =
    listing.propertyType === "house"
      ? "SingleFamilyResidence"
      : listing.propertyType === "apartment" || listing.propertyType === "studio"
        ? "Apartment"
        : "Accommodation";
  return {
    "@context": "https://schema.org",
    "@type": "Offer",
    url,
    name: listing.title,
    description: listing.description.slice(0, 500) || undefined,
    image: listing.photos.slice(0, 6),
    price: listing.price,
    priceCurrency: "INR",
    availability: "https://schema.org/InStock",
    businessFunction: isRent
      ? "http://purl.org/goodrelations/v1#LeaseOut"
      : "http://purl.org/goodrelations/v1#Sell",
    validFrom: listing.postedAt,
    ...(isRent
      ? {
          priceSpecification: {
            "@type": "UnitPriceSpecification",
            price: listing.price,
            priceCurrency: "INR",
            unitCode: "MON",
          },
        }
      : {}),
    itemOffered: {
      "@type": residenceType,
      name: listing.title,
      numberOfRooms: listing.beds || undefined,
      numberOfBathroomsTotal: listing.baths || undefined,
      floorSize: listing.areaSqft
        ? { "@type": "QuantitativeValue", value: listing.areaSqft, unitCode: "FTK" }
        : undefined,
      amenityFeature: listing.amenities
        .slice(0, 20)
        .map((a) => ({ "@type": "LocationFeatureSpecification", name: a, value: true })),
      address: {
        "@type": "PostalAddress",
        addressLocality: listing.neighborhood,
        addressRegion: listing.state ?? undefined,
        addressCountry: "IN",
      },
      geo,
    },
  };
}

export const Route = createFileRoute("/listing/$id")({
  loader: async ({ params }) => {
    if (!isUuid(params.id)) throw notFound();
    const listing = await getListing({ data: { id: params.id } });
    if (!listing) throw notFound();
    return { listing };
  },
  head: ({ loaderData, params }) => {
    if (!loaderData)
      return {
        meta: [
          { title: `Listing not found · ${SITE_NAME}` },
          { name: "robots", content: "noindex" },
        ],
      };
    const { listing } = loaderData;
    const url = absoluteUrl(`/listing/${params.id}`);
    const title = `${listing.title} · ${listing.neighborhood}, ${listing.city} — ${SITE_NAME}`;
    const desc = describe(listing);
    const image = listing.photo ?? OG_IMAGE_URL;
    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
        { property: "og:image", content: image },
        { property: "og:url", content: url },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: desc },
        { name: "twitter:image", content: image },
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: [
        {
          type: "application/ld+json",
          // Escape "<" so listing text can never close the script tag.
          children: JSON.stringify(listingJsonLd(listing, url)).replace(/</g, "\\u003c"),
        },
      ],
    };
  },
  pendingComponent: ListingSkeleton,
  errorComponent: ({ error }) => (
    <div className="mx-auto max-w-xl px-6 pt-16 text-center">
      <h1 className="font-display text-2xl font-semibold text-ink">Something went wrong</h1>
      <p className="mt-2 text-ink/60">{error.message}</p>
      <Link
        to="/search"
        search={{ mode: "rent" }}
        className="mt-6 inline-flex rounded-full bg-ink px-4 py-2 text-sm font-semibold text-background"
      >
        Back to search
      </Link>
    </div>
  ),
  notFoundComponent: () => (
    <div className="mx-auto max-w-xl px-6 pt-16 text-center">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-ink/50">404</p>
      <h1 className="mt-2 font-display text-3xl font-semibold text-ink">
        This listing has moved on
      </h1>
      <p className="mt-2 text-ink/60">
        It may have been rented, sold, or unpublished by the owner.
      </p>
      <Link
        to="/search"
        search={{ mode: "rent" }}
        className="mt-6 inline-flex rounded-full bg-ink px-4 py-2 text-sm font-semibold text-background"
      >
        Browse other places
      </Link>
    </div>
  ),
  component: ListingDetail,
});

function ListingDetail() {
  const { listing } = Route.useLoaderData();
  const photos = listing.photos;
  const navigate = useNavigate();
  const href = useRouterState({ select: (s) => s.location.href });
  const { user, loading: authLoading } = useAuth();
  const goSignIn = () => navigate({ to: "/auth", search: { redirect: href } as never });
  const [shareBusy, setShareBusy] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const fetchSimilar = useServerFn(getSimilarListings);
  const similarQ = useQuery({
    queryKey: ["similar-listings", listing.id],
    queryFn: () => fetchSimilar({ data: { id: listing.id, limit: 6 } }),
    staleTime: 5 * 60_000,
  });
  const similar = similarQ.data ?? [];
  const firstName = ownerFirstName(listing);
  const postedAgo = formatDistanceToNow(new Date(listing.postedAt), { addSuffix: true });

  const onShare = async () => {
    if (shareBusy) return;
    const url =
      typeof window !== "undefined"
        ? `${window.location.origin}/listing/${listing.id}`
        : absoluteUrl(`/listing/${listing.id}`);
    const text = `${listing.title} · ${formatMoney(listing.price)}${listing.listingType === "rent" ? "/mo" : ""} in ${listing.neighborhood}`;
    setShareBusy(true);
    try {
      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        try {
          await navigator.share({ title: listing.title, text, url });
          return;
        } catch (err) {
          if (err instanceof DOMException && err.name === "AbortError") return;
          // fall through to clipboard
        }
      }
      await navigator.clipboard.writeText(url);
      toast.success("Link copied", { description: "Share it on WhatsApp, email or anywhere." });
    } catch {
      toast.error("Couldn't copy the link", { description: url });
    } finally {
      setShareBusy(false);
    }
  };
  const openConv = useServerFn(openConversation);
  const sendMsg = useServerFn(sendMessage);
  const [active, setActive] = useState(0);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [contactOpen, setContactOpen] = useState(false);
  const [contactSent, setContactSent] = useState(false);
  const [contactBusy, setContactBusy] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);
  const [contactForm, setContactForm] = useState({ message: "", date: "" });
  const [tourOpen, setTourOpen] = useState(false);

  // Track a view once per listing per session.
  useEffect(() => {
    trackListingView(listing.id);
  }, [listing.id]);

  const like = useListingLike(listing.id);
  const onLike = async () => {
    const r = await like.toggle();
    if (r.needsAuth) {
      toast.message("Sign in to save this place", {
        description: "We'll keep your favourites synced across devices.",
        action: { label: "Sign in", onClick: goSignIn },
      });
    }
  };

  const isRent = listing.listingType === "rent";
  const monthly = listing.price;
  const deposit = listing.deposit;
  const movedInTotal = isRent && deposit != null ? monthly + deposit : monthly;

  return (
    <main className="min-h-screen bg-background pb-28 pt-10 sm:pb-20 sm:pt-14">
      {/* Floating back button — always visible */}
      <button
        type="button"
        onClick={() =>
          window.history.length > 1
            ? window.history.back()
            : navigate({ to: "/search", search: { mode: listing.listingType } })
        }
        className="fixed left-4 top-4 z-50 inline-flex items-center gap-1.5 rounded-full border border-ink/10 bg-white/90 px-3.5 py-2 text-[13px] font-semibold text-ink shadow-lg backdrop-blur-md transition hover:border-ink/25 hover:bg-white sm:left-6 sm:top-6"
        aria-label="Go back"
      >
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M15 18l-6-6 6-6" />
        </svg>
        Back
      </button>
      {!authLoading && (
        <Link
          to={user ? "/dashboard" : "/auth"}
          search={(user ? undefined : { redirect: href }) as never}
          className="fixed right-4 top-4 z-50 inline-flex items-center rounded-full border border-ink/10 bg-white/90 px-3.5 py-2 text-[13px] font-semibold text-ink shadow-lg backdrop-blur-md transition hover:border-ink/25 hover:bg-white sm:right-6 sm:top-6"
        >
          {user ? "Dashboard" : "Sign in"}
        </Link>
      )}

      {/* Breadcrumb */}
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <nav className="flex items-center gap-1.5 text-[12px] text-ink/50">
          <Link to="/" className="hover:text-ink">
            Home
          </Link>
          <span>/</span>
          <Link
            to="/search"
            search={{ mode: listing.listingType }}
            className="hover:text-ink capitalize"
          >
            {listing.listingType}
          </Link>
          <span>/</span>
          <span className="truncate text-ink/80">{listing.neighborhood}</span>
        </nav>

        {/* Header */}
        <header className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {listing.ownerVerified && (
                <span className="inline-flex items-center gap-1 rounded-full bg-teal/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-teal">
                  <svg viewBox="0 0 24 24" className="h-3 w-3" fill="currentColor">
                    <path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z" />
                  </svg>
                  Verified owner
                </span>
              )}
              <span className="rounded-full bg-ink/[0.05] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-ink/70">
                {PROPERTY_TYPE_LABEL[listing.propertyType]} · for {listing.listingType}
              </span>
            </div>
            <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
              {listing.title}
            </h1>
            <p className="mt-1.5 text-[14px] text-ink/60">
              {listing.neighborhood !== listing.city ? `${listing.neighborhood}, ` : ""}
              {listing.city}
              {listing.landmark ? ` · near ${listing.landmark}` : ""} · listed {postedAgo}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onLike}
              aria-pressed={like.liked}
              disabled={like.busy}
              className={`inline-flex h-10 items-center gap-1.5 rounded-full border px-4 text-[13px] font-medium transition ${
                like.liked
                  ? "border-coral/40 bg-coral/10 text-coral"
                  : "border-ink/10 bg-background text-ink hover:bg-ink/[0.04]"
              }`}
            >
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill={like.liked ? "currentColor" : "none"}
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z" />
              </svg>
              {like.liked ? "Saved" : "Save"}
              {like.count > 0 && (
                <span className="tabular text-[11px] text-ink/50">· {like.count}</span>
              )}
            </button>
            <button
              type="button"
              onClick={onShare}
              disabled={shareBusy}
              className="inline-flex h-10 items-center gap-1.5 rounded-full border border-ink/10 bg-background px-4 text-[13px] font-medium text-ink hover:bg-ink/[0.04] disabled:opacity-60"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <path d="M4 12v7a1 1 0 001 1h14a1 1 0 001-1v-7M16 6l-4-4-4 4M12 2v14" />
              </svg>
              Share
            </button>
          </div>
        </header>

        {/* Gallery */}
        <section className="mt-6">
          {photos.length === 0 && (
            <div className="grid aspect-[16/7] w-full place-items-center rounded-3xl bg-gradient-to-br from-muted to-ink/10 text-center">
              <div>
                <div className="text-6xl" aria-hidden>
                  {PROPERTY_TYPE_ICON[listing.propertyType]}
                </div>
                <p className="mt-2 text-[13px] text-ink/55">
                  The owner hasn't added photos yet — ask for some when you message.
                </p>
              </div>
            </div>
          )}
          {/* Mobile: hero + snap-scroll thumbnails */}
          <div className={photos.length === 0 ? "hidden" : "sm:hidden"}>
            <button
              type="button"
              onClick={() => setLightbox(0)}
              className="block aspect-[4/3] w-full overflow-hidden rounded-2xl bg-muted"
            >
              <img
                src={photos[0]}
                alt={`${listing.title} — main`}
                className="h-full w-full object-cover"
              />
            </button>
            {photos.length > 1 && (
              <div className="-mx-4 mt-2 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 scrollbar-hide">
                {photos.slice(1).map((src: string, i: number) => (
                  <button
                    key={src + i}
                    type="button"
                    onClick={() => setLightbox(i + 1)}
                    className="relative aspect-[4/3] w-32 shrink-0 snap-start overflow-hidden rounded-xl bg-muted"
                  >
                    <img
                      src={src}
                      alt={`${listing.title} — ${i + 2}`}
                      className="h-full w-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
          {/* Desktop mosaic */}
          <div
            className={`hidden ${photos.length === 0 ? "" : "sm:grid"} grid-cols-4 grid-rows-2 gap-2 overflow-hidden rounded-3xl sm:h-[460px]`}
          >
            <button
              type="button"
              onClick={() => setLightbox(0)}
              className="group relative col-span-2 row-span-2 overflow-hidden bg-muted"
            >
              <img
                src={photos[0]}
                alt={`${listing.title} — main`}
                className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.02]"
              />
            </button>
            {photos.slice(1, 5).map((src: string, i: number) => (
              <button
                key={src + i}
                type="button"
                onClick={() => setLightbox(i + 1)}
                className="group relative overflow-hidden bg-muted"
              >
                <img
                  src={src}
                  alt={`${listing.title} — ${i + 2}`}
                  className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.02]"
                />
                {i === 3 && photos.length > 5 && (
                  <span className="absolute inset-0 flex items-center justify-center bg-ink/40 text-[13px] font-semibold text-background backdrop-blur-[2px]">
                    +{photos.length - 5} photos
                  </span>
                )}
              </button>
            ))}
          </div>
        </section>

        {/* Body grid */}
        <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_360px]">
          {/* Left — content */}
          <div className="min-w-0">
            {/* Stat strip */}
            <div className="grid grid-cols-2 gap-3 border-b border-ink/[0.06] pb-6 sm:grid-cols-4">
              <Stat label="Bedrooms" value={String(listing.beds)} />
              <Stat label="Bathrooms" value={String(listing.baths)} />
              <Stat label="Area" value={listing.areaSqft ? `${listing.areaSqft} ft²` : "—"} />
              <Stat label="Furnishing" value={FURNISHING_LABEL[listing.furnished]} />
            </div>

            {/* Overview */}
            <section className="border-b border-ink/[0.06] py-6">
              <h2 className="font-display text-xl font-semibold text-ink">About this place</h2>
              {listing.description.trim() ? (
                <p className="mt-3 whitespace-pre-line text-[15px] leading-relaxed text-ink/75">
                  {listing.description}
                </p>
              ) : (
                <p className="mt-3 text-[15px] leading-relaxed text-ink/55">
                  The owner hasn't written a description yet. Message {firstName} to ask about the
                  place.
                </p>
              )}
              {listing.availableFrom && (
                <p className="mt-3 text-[13px] text-ink/60">
                  Available from{" "}
                  <span className="font-semibold text-ink">
                    {new Date(listing.availableFrom).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                </p>
              )}
            </section>

            {/* Amenities */}
            {listing.amenities.length > 0 && (
              <section className="border-b border-ink/[0.06] py-6">
                <h2 className="font-display text-xl font-semibold text-ink">
                  What this place offers
                </h2>
                <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {listing.amenities.map((a: string) => (
                    <li key={a} className="flex items-center gap-2.5 text-[14px] text-ink/80">
                      <span className="grid h-8 w-8 place-items-center rounded-lg border border-ink/10 bg-ink/[0.03] text-ink">
                        <svg
                          viewBox="0 0 24 24"
                          className="h-4 w-4"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                        >
                          <path d="M4 12l5 5L20 6" />
                        </svg>
                      </span>
                      {a}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Nearby */}
            {listing.nearby.length > 0 && (
              <section className="border-b border-ink/[0.06] py-6">
                <h2 className="font-display text-xl font-semibold text-ink">Nearby</h2>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {listing.nearby.map((n) => (
                    <li
                      key={n.label}
                      className="rounded-full border border-ink/10 px-3 py-1.5 text-[13px] text-ink/75"
                    >
                      {n.label}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Map */}
            <section className="py-6">
              <h2 className="font-display text-xl font-semibold text-ink">Where you'll be</h2>
              <p className="mt-1 text-[13px] text-ink/60">
                {listing.neighborhood !== listing.city ? `${listing.neighborhood}, ` : ""}
                {listing.city}
              </p>
              {hasCoords(listing) ? (
                <div className="mt-4 h-[320px] overflow-hidden rounded-2xl border border-ink/[0.06]">
                  <ClientOnly
                    fallback={<div className="h-full w-full animate-pulse bg-ink/[0.04]" />}
                  >
                    <Suspense
                      fallback={<div className="h-full w-full animate-pulse bg-ink/[0.04]" />}
                    >
                      <ListingsMap
                        listings={[listing]}
                        hoveredId={hoveredId}
                        onHover={setHoveredId}
                        variant="dot"
                      />
                    </Suspense>
                  </ClientOnly>
                </div>
              ) : (
                <p className="mt-4 rounded-2xl border border-dashed border-ink/[0.12] p-4 text-[13px] text-ink/55">
                  The exact location isn't on the map yet. Ask {firstName} for the address when you
                  get in touch.
                </p>
              )}
            </section>
          </div>

          {/* Right — sticky sidebar */}
          <aside className="lg:sticky lg:top-28 lg:self-start">
            <div className="rounded-3xl border border-ink/[0.08] bg-card p-5 shadow-tactile">
              <div className="flex items-baseline gap-2">
                <span className="font-display text-3xl font-bold tracking-tight text-ink">
                  {formatMoney(monthly)}
                </span>
                {isRent && <span className="text-[13px] text-ink/60">/month</span>}
              </div>

              {isRent ? (
                <dl className="mt-5 space-y-3 border-t border-ink/[0.06] pt-4 text-[13.5px]">
                  <Row label="Monthly rent" value={formatMoney(monthly)} />
                  <Row
                    label="Refundable deposit"
                    value={deposit != null ? formatMoney(deposit) : "Ask owner"}
                  />
                  <Row label="Nestly fee" value="Free" />
                  {deposit != null && (
                    <div className="mt-3 flex items-center justify-between border-t border-ink/[0.06] pt-3 text-[14px] font-semibold text-ink">
                      <span>Move-in total</span>
                      <span>{formatMoney(movedInTotal)}</span>
                    </div>
                  )}
                </dl>
              ) : (
                <p className="mt-3 text-[13px] text-ink/60">
                  Asking price set by the owner. Registration, stamp duty and legal costs are
                  separate.
                </p>
              )}

              <div className="mt-5 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setContactSent(false);
                    setContactOpen(true);
                  }}
                  className="group inline-flex h-11 items-center justify-center gap-2 rounded-full bg-ink px-4 text-[13.5px] font-semibold text-background transition hover:brightness-110"
                >
                  Contact {firstName}
                  <svg
                    viewBox="0 0 24 24"
                    className="h-3.5 w-3.5 transition group-hover:translate-x-0.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => setTourOpen(true)}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-ink/10 bg-background px-4 text-[13.5px] font-medium text-ink hover:bg-ink/[0.04]"
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  >
                    <rect x="3" y="4.5" width="18" height="16" rx="3" />
                    <path d="M3 9.5h18M8 3v3M16 3v3" />
                  </svg>
                  Book a tour
                </button>
              </div>

              <p className="mt-3 flex items-center gap-1.5 text-[11.5px] text-ink/50">
                <span className="h-1.5 w-1.5 rounded-full bg-coral" /> 0% broker fees on Nestly.
                {listing.ownerVerified ? " Owner verified." : ""}
              </p>
            </div>

            {/* Owner card */}
            <div className="mt-4 flex items-center gap-3 rounded-2xl border border-ink/[0.08] bg-background p-4">
              <div className="grid h-11 w-11 place-items-center rounded-full bg-ink text-background font-display text-sm font-semibold">
                {listing.ownerName.charAt(0)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-[13px] font-semibold text-ink">
                  {listing.ownerName}
                  {listing.ownerVerified && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-ink/[0.06] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-ink/70">
                      <svg
                        viewBox="0 0 24 24"
                        className="h-3 w-3"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="m4.5 12.5 5 5 10-11" />
                      </svg>
                      Verified
                    </span>
                  )}
                </p>
                <p className="text-[11.5px] text-ink/55">Listed {postedAgo}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setReportOpen(true)}
              className="mt-3 inline-flex items-center gap-1.5 px-1 text-[12px] font-medium text-ink/50 hover:text-ink"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 21V4h11l-1 4h6v9h-9l1-4H4" />
              </svg>
              Report this listing
            </button>
          </aside>
        </div>

        {/* Similar */}
        {similarQ.isLoading && (
          <section className="mt-16 border-t border-ink/[0.06] pt-10">
            <div className="h-7 w-56 animate-pulse rounded-lg bg-ink/[0.06]" />
            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="aspect-[4/3] animate-pulse rounded-3xl bg-ink/[0.05]" />
              ))}
            </div>
          </section>
        )}
        {similar.length > 0 && (
          <section className="mt-16 border-t border-ink/[0.06] pt-10">
            <h2 className="font-display text-2xl font-semibold text-ink">
              More places in {listing.city}
            </h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {similar.map((l) => (
                <ListingCard key={l.id} listing={l} />
              ))}
            </div>
          </section>
        )}

        <ReviewsSection listingId={listing.id} />
      </div>

      {/* Sticky mobile CTA — always reachable actions */}
      <div
        className="fixed inset-x-0 bottom-0 z-40 border-t border-ink/[0.08] bg-background/95 px-4 py-3 shadow-[0_-8px_30px_-12px_rgba(29,29,40,0.18)] backdrop-blur-xl lg:hidden"
        style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
      >
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-1">
              <span className="font-display text-lg font-bold tracking-tight text-ink">
                {formatMoney(monthly)}
              </span>
              {isRent && <span className="text-[11.5px] text-ink/55">/mo</span>}
            </div>
            <p className="truncate text-[11px] text-ink/55">
              {firstName} · listed {postedAgo}
            </p>
          </div>
          <button
            type="button"
            aria-label="Book a tour"
            onClick={() => setTourOpen(true)}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-ink/10 bg-background text-ink hover:bg-ink/[0.04]"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            >
              <rect x="3" y="4.5" width="18" height="16" rx="3" />
              <path d="M3 9.5h18M8 3v3M16 3v3" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => {
              setContactSent(false);
              setContactOpen(true);
            }}
            className="group inline-flex h-11 flex-1 shrink-0 items-center justify-center gap-1.5 rounded-full bg-ink px-4 text-[13px] font-semibold text-background transition hover:brightness-110"
          >
            Contact
            <svg
              viewBox="0 0 24 24"
              className="h-3.5 w-3.5 transition group-hover:translate-x-0.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>

      {/* Lightbox */}
      {lightbox !== null && photos.length > 0 && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[80] flex items-center justify-center bg-ink/90 p-4 backdrop-blur-md"
          onClick={() => setLightbox(null)}
        >
          <button
            type="button"
            aria-label="Close"
            onClick={() => setLightbox(null)}
            className="absolute right-5 top-5 grid h-10 w-10 place-items-center rounded-full bg-background/10 text-background hover:bg-background/20"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
          <button
            type="button"
            aria-label="Previous"
            onClick={(e) => {
              e.stopPropagation();
              setLightbox((i) => (i! - 1 + photos.length) % photos.length);
            }}
            className="absolute left-4 top-1/2 -translate-y-1/2 grid h-11 w-11 place-items-center rounded-full bg-background/10 text-background hover:bg-background/20"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <img
            src={photos[lightbox]}
            alt={`${listing.title} photo ${lightbox + 1}`}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[85vh] max-w-[92vw] rounded-2xl object-contain shadow-2xl"
          />
          <button
            type="button"
            aria-label="Next"
            onClick={(e) => {
              e.stopPropagation();
              setLightbox((i) => (i! + 1) % photos.length);
            }}
            className="absolute right-4 top-1/2 -translate-y-1/2 grid h-11 w-11 place-items-center rounded-full bg-background/10 text-background hover:bg-background/20"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-background/10 px-3 py-1 text-[12px] font-medium text-background">
            {lightbox + 1} / {photos.length}
          </div>
        </div>
      )}

      <BookTourSheet
        open={tourOpen}
        onClose={() => setTourOpen(false)}
        listingId={listing.id}
        listingTitle={listing.title}
        listingAddress={`${listing.neighborhood}, ${listing.city}`}
        ownerName={listing.ownerName}
      />

      <ReportDialog
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        targetType="listing"
        targetId={listing.id}
        targetLabel={listing.title}
      />

      {/* Contact slide-up sheet */}
      {contactOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Contact ${listing.ownerName}`}
          className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center"
        >
          <button
            type="button"
            aria-label="Close contact sheet"
            onClick={() => setContactOpen(false)}
            className="absolute inset-0 bg-ink/50 backdrop-blur-sm animate-fade-in"
          />
          <div
            className="relative z-10 w-full bg-background shadow-2xl rounded-t-3xl sm:max-w-md sm:rounded-3xl"
            style={{
              paddingBottom: "env(safe-area-inset-bottom)",
              animation: "nestly-slide-up 0.28s cubic-bezier(0.22, 1, 0.36, 1)",
            }}
          >
            <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-ink/15 sm:hidden" />
            <div className="flex items-start justify-between gap-4 px-5 pt-4">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/50">
                  {contactSent ? "Message sent" : "Contact owner"}
                </p>
                <h3 className="mt-1 truncate font-display text-lg font-semibold text-ink">
                  {listing.ownerName} · {listing.neighborhood}
                </h3>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setContactOpen(false)}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-ink/10 bg-background text-ink hover:bg-ink/[0.04]"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                >
                  <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            {contactSent ? (
              <div className="px-5 pb-5 pt-4">
                <div className="rounded-2xl border border-teal/20 bg-teal/[0.06] p-4 text-[13.5px] text-ink/80">
                  <p className="font-semibold text-ink">Message sent.</p>
                  <p className="mt-1">
                    We've sent it to {firstName}. You'll see their reply in your Nestly inbox.
                  </p>
                </div>
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setContactOpen(false)}
                    className="inline-flex h-11 flex-1 items-center justify-center rounded-full border border-ink/10 bg-background px-4 text-[13.5px] font-semibold text-ink hover:bg-ink/[0.04]"
                  >
                    Back to listing
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate({ to: "/dashboard/inbox" })}
                    className="inline-flex h-11 flex-1 items-center justify-center rounded-full bg-ink px-4 text-[13.5px] font-semibold text-background hover:brightness-110"
                  >
                    Open inbox
                  </button>
                </div>
              </div>
            ) : (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (contactBusy) return;
                  setContactError(null);
                  if (!user) {
                    goSignIn();
                    return;
                  }
                  const body =
                    contactForm.message.trim() ||
                    `Hi ${firstName}, is "${listing.title}" still available?${contactForm.date ? ` Could we visit on ${contactForm.date}?` : ""}`;
                  setContactBusy(true);
                  try {
                    // The server derives the owner from the listing id.
                    const conv = await openConv({
                      data: {
                        listingId: listing.id,
                        listingTitle: listing.title.slice(0, 300),
                        ...(listing.photo ? { listingPhoto: listing.photo } : {}),
                      },
                    });
                    await sendMsg({ data: { conversationId: conv.id, body, kind: "text" } });
                    setContactSent(true);
                  } catch (err) {
                    const msg = err instanceof Error ? err.message : "Could not send message";
                    setContactError(msg);
                    toast.error(msg);
                  } finally {
                    setContactBusy(false);
                  }
                }}
                className="px-5 pb-5 pt-4"
              >
                <div className="mb-4 flex items-center gap-3 rounded-2xl border border-ink/[0.08] bg-ink/[0.02] p-2.5">
                  {listing.photo ? (
                    <img
                      src={listing.photo}
                      alt=""
                      className="h-12 w-12 shrink-0 rounded-lg object-cover"
                    />
                  ) : (
                    <span
                      className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-muted text-xl"
                      aria-hidden
                    >
                      {PROPERTY_TYPE_ICON[listing.propertyType]}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-ink">{listing.title}</p>
                    <p className="truncate text-[11.5px] text-ink/55">
                      {formatMoney(listing.price)}
                      {isRent ? "/mo" : ""} · {listing.beds}BR · {listing.neighborhood}
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  {isRent && (
                    <Field label="Preferred visit date (optional)">
                      <input
                        type="date"
                        value={contactForm.date}
                        onChange={(e) => setContactForm((f) => ({ ...f, date: e.target.value }))}
                        className="h-11 w-full rounded-xl border border-ink/10 bg-background px-3 text-[14px] text-ink outline-none focus:border-ink/40"
                      />
                    </Field>
                  )}
                  <Field label="Message">
                    <textarea
                      rows={3}
                      value={contactForm.message}
                      onChange={(e) => setContactForm((f) => ({ ...f, message: e.target.value }))}
                      placeholder={`Hi ${firstName}, is this still available? I'd love to know more.`}
                      className="w-full resize-none rounded-xl border border-ink/10 bg-background p-3 text-[14px] text-ink outline-none focus:border-ink/40"
                    />
                  </Field>
                </div>

                {contactError && (
                  <p className="mt-3 rounded-xl border border-coral/30 bg-coral/[0.06] p-2 text-[12px] text-coral">
                    {contactError}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={contactBusy}
                  className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-ink px-4 text-[13.5px] font-semibold text-background hover:brightness-110 disabled:opacity-60"
                >
                  {contactBusy ? "Sending…" : user ? "Send message" : "Sign in to message"}
                  <svg
                    viewBox="0 0 24 24"
                    className="h-3.5 w-3.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                <p className="mt-2 text-center text-[11px] text-ink/50">
                  Replies land in your Nestly inbox. Never pay a deposit before visiting.
                </p>
              </form>
            )}
          </div>
          <style>{`@keyframes nestly-slide-up { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>
        </div>
      )}
    </main>
  );
}

function Stat({
  label,
  value,
  capitalize,
}: {
  label: string;
  value: string;
  capitalize?: boolean;
}) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink/45">
        {label}
      </div>
      <div
        className={`mt-1 font-display text-lg font-semibold text-ink ${capitalize ? "capitalize" : ""}`}
      >
        {value}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-ink/70">
      <span>{label}</span>
      <span className="tabular text-ink">{value}</span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.14em] text-ink/50">
        {label}
      </span>
      {children}
    </label>
  );
}

function ListingSkeleton() {
  return (
    <main className="min-h-screen bg-background pb-20 pt-10 sm:pt-14" aria-busy="true">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="h-3 w-40 animate-pulse rounded bg-ink/[0.06]" />
        <div className="mt-5 h-9 w-2/3 animate-pulse rounded-lg bg-ink/[0.08]" />
        <div className="mt-2 h-4 w-1/3 animate-pulse rounded bg-ink/[0.06]" />
        <div className="mt-6 aspect-[16/7] w-full animate-pulse rounded-3xl bg-ink/[0.06]" />
        <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-3">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-4 animate-pulse rounded bg-ink/[0.05]"
                style={{ width: `${90 - i * 12}%` }}
              />
            ))}
          </div>
          <div className="h-64 animate-pulse rounded-3xl bg-ink/[0.05]" />
        </div>
      </div>
    </main>
  );
}
