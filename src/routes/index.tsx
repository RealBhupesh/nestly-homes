import { createFileRoute, Link } from "@tanstack/react-router";
import { lazy, Suspense, useState } from "react";
import { ClientOnly } from "@tanstack/react-router";
import {
  formatMoney,
  hasCoords,
  PROPERTY_TYPE_ICON,
  FURNISHING_LABEL,
  type Listing,
} from "@/lib/listings-data";
import { getFeaturedListings, searchListings } from "@/lib/public-listings.functions";
import { useAuth } from "@/hooks/use-auth";
import { pageHead, SITE_DESCRIPTION } from "@/lib/site";

const ListingsMap = lazy(() =>
  import("@/components/nestly/ListingsMap").then((m) => ({ default: m.ListingsMap })),
);

type HomeData = { newest: Listing[]; featured: Listing[]; total: number; failed: boolean };

export const Route = createFileRoute("/")({
  // SSR the listings so the home page is crawlable and paints with content.
  loader: async (): Promise<HomeData> => {
    try {
      const [newest, featured] = await Promise.all([
        searchListings({ data: { sort: "fresh", limit: 24, offset: 0 } }),
        getFeaturedListings({ data: { limit: 10 } }),
      ]);
      return { newest: newest.items, featured, total: newest.total, failed: false };
    } catch {
      return { newest: [], featured: [], total: 0, failed: true };
    }
  },
  staleTime: 60_000,
  head: () =>
    pageHead({
      title: "Nestly — Rent or buy a home in Pune, without the brokers",
      description: SITE_DESCRIPTION,
      path: "/",
    }),
  component: Landing,
});

function AuthNav({ mobile, onNavigate }: { mobile?: boolean; onNavigate?: () => void }) {
  const { user, loading } = useAuth();
  if (loading) return <span className={mobile ? "h-10" : "w-28"} aria-hidden />;
  if (user) {
    return (
      <Link
        to="/dashboard"
        onClick={onNavigate}
        className={
          mobile
            ? "bg-black text-white px-8 py-3 rounded-full text-sm font-semibold"
            : "bg-black text-white px-6 py-2.5 rounded-full text-[13px] font-semibold hover:bg-black/85 transition-colors"
        }
      >
        Dashboard
      </Link>
    );
  }
  return (
    <>
      <a
        href="/auth"
        onClick={onNavigate}
        className={
          mobile
            ? "text-lg text-black/80"
            : "text-[13px] text-black/80 hover:text-black transition-colors"
        }
      >
        Log In
      </a>
      <a
        href="/auth?mode=signup"
        onClick={onNavigate}
        className={
          mobile
            ? "bg-black text-white px-8 py-3 rounded-full text-sm font-semibold"
            : "bg-black text-white px-6 py-2.5 rounded-full text-[13px] font-semibold hover:bg-black/85 transition-colors"
        }
      >
        Sign Up
      </a>
    </>
  );
}

const NAV_LINKS = [
  { label: "Rent", href: "/search?mode=rent" },
  { label: "Buy", href: "/search?mode=sale" },
  { label: "List a place", href: "/dashboard/new" },
  { label: "How it works", href: "#how" },
  { label: "Trust", href: "#trust" },
];

function Logo({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 28"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Nestly"
    >
      <circle cx="14" cy="14" r="10" fill="#000" />
      <circle cx="14" cy="14" r="4" fill="#eeeeee" />
      <text
        x="34"
        y="20"
        fontFamily="Inter, sans-serif"
        fontWeight="700"
        fontSize="18"
        fill="#000"
        letterSpacing="-0.02em"
      >
        Nestly
      </text>
    </svg>
  );
}

function Landing() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const { newest, featured: featuredRows, total, failed } = Route.useLoaderData();
  const heroListings = newest.filter(hasCoords);
  const featured = newest.slice(0, 6);
  const curated = featuredRows;
  const hasAnyFeatured = curated.some((l) => l.isFeatured);
  const isEmpty = newest.length === 0;

  return (
    <div
      className="relative w-full bg-[#eeeeee] text-black"
      style={{ fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" }}
    >
      <section className="relative min-h-screen flex flex-col w-full overflow-hidden">
        {/* Map background */}
        <div className="absolute inset-0 z-0">
          <ClientOnly
            fallback={
              <div className="h-full w-full bg-gradient-to-br from-[#e7e2d8] via-[#eeeeee] to-[#e2ded4]" />
            }
          >
            <Suspense
              fallback={
                <div className="h-full w-full bg-gradient-to-br from-[#e7e2d8] via-[#eeeeee] to-[#e2ded4]" />
              }
            >
              <div className="absolute inset-0">
                <ListingsMap
                  listings={heroListings}
                  hoveredId={null}
                  onHover={() => {}}
                  variant="dot"
                  interactive={false}
                />
              </div>
            </Suspense>
          </ClientOnly>
          {/* Tonal wash for legibility */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#eeeeee]/70 via-[#eeeeee]/30 to-[#eeeeee]/95" />
          <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-[#eeeeee] to-transparent" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-[#eeeeee] to-transparent" />
        </div>

        {/* Navbar */}
        <nav className="w-full relative z-50 pt-6 px-6 lg:px-12 flex items-center justify-between animate-on-load delay-100">
          <Logo className="h-7 w-auto" />

          <div className="hidden md:flex items-center gap-8">
            {NAV_LINKS.map((l) => (
              <a
                key={l.label}
                href={l.href}
                className="text-[13px] font-medium tracking-wide text-black/70 hover:text-black transition-colors"
              >
                {l.label}
              </a>
            ))}
          </div>

          <div className="hidden md:flex items-center gap-6">
            <AuthNav />
          </div>

          {/* Mobile hamburger */}
          <button
            type="button"
            aria-label="Open menu"
            className="md:hidden flex flex-col gap-1.5 p-2"
            onClick={() => setMenuOpen(true)}
          >
            <span className="block h-0.5 w-6 bg-black" />
            <span className="block h-0.5 w-6 bg-black" />
          </button>
        </nav>

        {/* Mobile overlay */}
        {menuOpen && (
          <div className="fixed inset-0 bg-[#eeeeee]/95 backdrop-blur-xl z-[100] flex flex-col">
            <div className="flex items-center justify-between pt-6 px-6">
              <Logo className="h-7 w-auto" />
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setMenuOpen(false)}
                className="p-2 text-2xl leading-none"
              >
                ×
              </button>
            </div>
            <div className="flex-1 flex flex-col items-center justify-center gap-8">
              {NAV_LINKS.map((l) => (
                <a
                  key={l.label}
                  href={l.href}
                  onClick={() => setMenuOpen(false)}
                  className="text-2xl font-medium text-black"
                >
                  {l.label}
                </a>
              ))}
              <AuthNav mobile onNavigate={() => setMenuOpen(false)} />
            </div>
          </div>
        )}

        {/* Hero */}
        <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 text-center pb-16 md:pb-24 pt-20">
          {/* Version pill */}
          <div className="inline-flex items-center bg-white/90 backdrop-blur border border-black/10 hover:border-black/20 rounded-full px-1.5 py-1.5 pr-4 mb-8 md:mb-10 shadow-[0_4px_20px_rgba(0,0,0,0.06)] animate-on-load delay-200">
            <span className="bg-black text-white rounded-full px-3 py-1 text-[10px] font-bold uppercase">
              Live
            </span>
            <span className="ml-3 text-[10px] font-medium uppercase tracking-widest text-black">
              {total > 0
                ? `${total.toLocaleString("en-IN")} ${total === 1 ? "home" : "homes"} listed · Pune`
                : "Now open for owners · Pune"}
            </span>
          </div>

          {/* Headline */}
          <h1
            className="text-black text-[40px] md:text-[56px] lg:text-[72px] font-medium leading-[1.02] tracking-[-0.035em] animate-on-load delay-300"
            style={{ maxWidth: 900 }}
          >
            Find a home,
            <br />
            not a broker.
          </h1>

          {/* Subheadline */}
          <p
            className="text-black/65 text-[16px] md:text-[19px] font-light leading-[1.55] mt-6 mb-10 animate-on-load delay-400"
            style={{ maxWidth: 620 }}
          >
            Rooms, flats and houses to rent or buy — straight from owners across Pune. No brokers,
            no brokerage, and you chat with the owner directly.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row items-center gap-3 animate-on-load delay-500">
            <a
              href="/search?mode=rent"
              className="group pl-6 pr-2 py-2 rounded-full font-medium text-[15px] flex items-center gap-4 shadow-[0_10px_30px_-8px_rgba(126,34,206,0.55)] hover:shadow-[0_14px_36px_-8px_rgba(126,34,206,0.6)] transition-all duration-300 text-white"
              style={{ backgroundColor: "#7e22ce" }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#6b21a8")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#7e22ce")}
            >
              Find your place
              <span
                className="w-8 h-8 rounded-full bg-white flex items-center justify-center"
                style={{ color: "#7e22ce" }}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="transition-transform duration-300 group-hover:translate-x-0.5"
                >
                  <path d="M5 12h14" />
                  <path d="M13 5l7 7-7 7" />
                </svg>
              </span>
            </a>
            <a
              href="/dashboard/new"
              className="px-6 py-3 rounded-full font-medium text-[14px] bg-white/90 backdrop-blur border border-black/10 text-black hover:bg-white hover:border-black/25 transition-all"
            >
              List your place
            </a>
          </div>

          {/* Stat row */}
          <div className="mt-14 md:mt-20 grid grid-cols-3 gap-px overflow-hidden rounded-2xl border border-black/10 bg-black/10 shadow-[0_10px_40px_-20px_rgba(0,0,0,0.25)] animate-on-load delay-500 w-full max-w-3xl">
            {[
              {
                k: total > 0 ? total.toLocaleString("en-IN") : "New",
                v: total > 0 ? "Homes listed now" : "Listings opening",
              },
              { k: "0%", v: "Broker fees, ever" },
              { k: "₹0", v: "To list your place" },
            ].map((s) => (
              <div key={s.v} className="bg-white/95 backdrop-blur px-4 py-5 text-left">
                <p className="text-[22px] md:text-[26px] font-medium tracking-[-0.02em] text-black">
                  {s.k}
                </p>
                <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-black/50">{s.v}</p>
              </div>
            ))}
          </div>
        </main>
      </section>

      {/* Neighborhood map */}
      <section id="how" className="relative border-t border-black/10 bg-white">
        <div className="mx-auto max-w-7xl px-6 py-16 lg:px-12 lg:py-24">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-black/50">
                Live map · Pune
              </p>
              <h2 className="mt-2 text-[32px] md:text-[44px] font-medium leading-[1.05] tracking-[-0.02em] max-w-xl">
                {isEmpty
                  ? "Be among the first owners to list in Pune."
                  : "See every open place on the map."}
              </h2>
            </div>
            <p className="max-w-sm text-[15px] text-black/60">
              {isEmpty
                ? "Nestly is just getting started. List your room, flat or house for free and reach seekers directly — no brokers in between."
                : "Hover a listing to find it on the map, or open the full search to filter by price, type and furnishing."}
            </p>
          </div>
          {failed ? (
            <div className="mt-10 rounded-3xl border border-dashed border-black/15 bg-[#f7f5f0] p-10 text-center">
              <p className="text-[18px] font-medium">We couldn't load listings right now.</p>
              <p className="mt-2 text-[14px] text-black/55">
                Please refresh in a moment, or jump straight into search.
              </p>
              <a
                href="/search?mode=rent"
                className="mt-6 inline-flex rounded-full bg-black px-6 py-3 text-[14px] font-medium text-white"
              >
                Open search
              </a>
            </div>
          ) : isEmpty ? (
            <div className="mt-10 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
              <div className="relative flex min-h-[320px] flex-col justify-end overflow-hidden rounded-3xl border border-black/10 bg-gradient-to-br from-[#f3f0ea] via-white to-[#efe7fb] p-8 shadow-sm">
                <div
                  className="pointer-events-none absolute -right-10 -top-10 h-56 w-56 rounded-full blur-3xl"
                  style={{ backgroundColor: "rgba(126,34,206,0.18)" }}
                />
                <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-black/50">
                  For owners
                </p>
                <p className="mt-3 max-w-md text-[28px] font-medium leading-[1.1] tracking-[-0.02em]">
                  List your place in minutes. Free, with no brokerage.
                </p>
                <div className="mt-6 flex flex-wrap gap-3">
                  <a
                    href="/dashboard/new"
                    className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-[14px] font-medium text-white"
                    style={{ backgroundColor: "#7e22ce" }}
                  >
                    List your place <span aria-hidden>→</span>
                  </a>
                  <a
                    href="/search?mode=rent"
                    className="inline-flex rounded-full border border-black/15 bg-white px-6 py-3 text-[14px] font-medium text-black hover:border-black/40"
                  >
                    Browse search
                  </a>
                </div>
              </div>
              <ul className="grid gap-3">
                {[
                  {
                    k: "Add photos & details",
                    v: "Rent or sale, room to whole house. Our form helps you fill it in.",
                  },
                  {
                    k: "Publish for free",
                    v: "Your listing goes live on search and the map — no fees to list.",
                  },
                  {
                    k: "Chat with seekers",
                    v: "Messages and tour requests land in your Nestly inbox.",
                  },
                ].map((step, i) => (
                  <li
                    key={step.k}
                    className="flex items-start gap-4 rounded-2xl border border-black/10 bg-white p-4"
                  >
                    <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-black text-[13px] font-semibold text-white">
                      {i + 1}
                    </span>
                    <div>
                      <p className="text-[14px] font-medium text-black">{step.k}</p>
                      <p className="mt-0.5 text-[13px] text-black/55">{step.v}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="mt-10 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
              <div className="relative h-[460px] overflow-hidden rounded-3xl border border-black/10 bg-[#f3f0ea] shadow-sm">
                <ClientOnly fallback={<div className="h-full w-full animate-pulse bg-black/5" />}>
                  <Suspense fallback={<div className="h-full w-full animate-pulse bg-black/5" />}>
                    <ListingsMap listings={featured} hoveredId={hoveredId} onHover={setHoveredId} />
                  </Suspense>
                </ClientOnly>
              </div>
              <ul className="grid gap-3">
                {featured.map((l) => (
                  <li key={l.id}>
                    <Link
                      to="/listing/$id"
                      params={{ id: l.id }}
                      onMouseEnter={() => setHoveredId(l.id)}
                      onMouseLeave={() => setHoveredId(null)}
                      className={`group flex items-center gap-4 rounded-2xl border p-3 pr-4 transition ${
                        hoveredId === l.id
                          ? "border-[#7e22ce]/50 bg-[#7e22ce]/[0.04]"
                          : "border-black/10 bg-white hover:border-black/25"
                      }`}
                    >
                      {l.photo ? (
                        <img
                          src={l.photo}
                          alt=""
                          loading="lazy"
                          className="h-16 w-16 flex-shrink-0 rounded-xl object-cover"
                        />
                      ) : (
                        <span
                          className="grid h-16 w-16 flex-shrink-0 place-items-center rounded-xl bg-[#f3f0ea] text-2xl"
                          aria-hidden
                        >
                          {PROPERTY_TYPE_ICON[l.propertyType]}
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14px] font-medium text-black">{l.title}</p>
                        <p className="mt-0.5 text-[12px] text-black/55">
                          {l.neighborhood} · {l.beds} bed{l.areaSqft ? ` · ${l.areaSqft} sqft` : ""}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[14px] font-semibold text-black">
                          {formatMoney(l.price)}
                          {l.listingType === "rent" && (
                            <span className="text-black/50 font-normal">/mo</span>
                          )}
                        </p>
                        <p className="text-[10px] uppercase tracking-widest text-black/40">
                          {l.listingType === "rent" ? "For rent" : "For sale"}
                        </p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>

      {/* Curated carousel */}
      {curated.length > 0 && (
        <section className="relative border-t border-black/10 bg-[#eeeeee]">
          <div className="mx-auto max-w-7xl px-6 pt-20 lg:px-12 lg:pt-28">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-black/50">
                  {hasAnyFeatured ? "Featured" : "Just listed"}
                </p>
                <h2 className="mt-3 text-[36px] md:text-[52px] font-medium leading-[1.02] tracking-[-0.03em] max-w-xl">
                  Homes worth
                  <br />a second look.
                </h2>
              </div>
              <div className="flex items-center gap-3">
                <p className="hidden md:block max-w-[22ch] text-[13px] text-black/55 mr-2">
                  {hasAnyFeatured
                    ? "Featured listings first, then the newest places in Pune."
                    : "The newest places posted by owners in Pune."}
                </p>
                <a
                  href="/search?mode=rent"
                  className="inline-flex items-center gap-2 rounded-full border border-black/15 bg-white px-5 py-2.5 text-[13px] font-medium text-black hover:border-black/40 transition-colors"
                >
                  See all
                  <span aria-hidden>→</span>
                </a>
              </div>
            </div>
          </div>

          <div
            className="mt-10 flex snap-x snap-mandatory gap-6 overflow-x-auto px-6 pb-20 lg:px-12 lg:pb-28 scrollbar-hide"
            style={{ scrollPaddingLeft: "1.5rem", WebkitOverflowScrolling: "touch" }}
          >
            {curated.map((l, i) => {
              // Alternate large / regular cards for editorial rhythm
              const isLarge = i % 3 === 0;
              return (
                <Link
                  key={l.id}
                  to="/listing/$id"
                  params={{ id: l.id }}
                  className={`group relative flex-shrink-0 snap-start overflow-hidden rounded-3xl bg-white shadow-[0_10px_40px_-20px_rgba(0,0,0,0.25)] transition-all duration-500 hover:shadow-[0_20px_50px_-20px_rgba(0,0,0,0.35)] ${
                    isLarge
                      ? "w-[86vw] max-w-[640px] aspect-[4/5]"
                      : "w-[70vw] max-w-[440px] aspect-[3/4]"
                  }`}
                >
                  {l.photo ? (
                    <img
                      src={l.photo}
                      alt={l.title}
                      loading="lazy"
                      className="absolute inset-0 h-full w-full object-cover transition-transform duration-[900ms] ease-out group-hover:scale-[1.04]"
                    />
                  ) : (
                    <div
                      className="absolute inset-0 grid place-items-center bg-gradient-to-br from-[#e7e2d8] to-[#cfc6b8] text-7xl"
                      aria-hidden
                    >
                      {PROPERTY_TYPE_ICON[l.propertyType]}
                    </div>
                  )}
                  {/* Bottom gradient wash */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
                  {/* Top tag */}
                  <div className="absolute left-5 top-5 flex items-center gap-2">
                    <span className="rounded-full bg-white/95 backdrop-blur px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-black">
                      {l.listingType === "rent" ? "For rent" : "For sale"}
                    </span>
                    {l.ownerVerified && (
                      <span
                        className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white"
                        style={{ backgroundColor: "#7e22ce" }}
                      >
                        <span className="inline-block h-1.5 w-1.5 rounded-full bg-white" />
                        Verified
                      </span>
                    )}
                  </div>
                  {/* Bottom metadata */}
                  <div className="absolute inset-x-0 bottom-0 p-6 lg:p-8 text-white">
                    <p className="text-[10px] uppercase tracking-[0.28em] text-white/70">
                      {l.neighborhood !== l.city ? `${l.neighborhood} · ${l.city}` : l.city}
                    </p>
                    <h3
                      className={`mt-2 font-medium leading-[1.05] tracking-[-0.02em] ${isLarge ? "text-[30px] lg:text-[36px]" : "text-[22px] lg:text-[26px]"}`}
                    >
                      {l.title}
                    </h3>
                    <div className="mt-4 flex items-center gap-4 text-[12px] text-white/75">
                      <span>{l.beds} bed</span>
                      <span className="h-1 w-1 rounded-full bg-white/40" />
                      <span>{l.baths} bath</span>
                      <span className="h-1 w-1 rounded-full bg-white/40" />
                      <span>{FURNISHING_LABEL[l.furnished]}</span>
                    </div>
                  </div>
                </Link>
              );
            })}
            {/* Trailing spacer so last card can snap fully */}
            <div className="flex-shrink-0 w-2" aria-hidden />
          </div>
        </section>
      )}

      {/* Trust strip */}
      <section
        id="trust"
        className="relative border-t border-black/10 bg-black text-white overflow-hidden"
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 20%, #7e22ce 0, transparent 40%), radial-gradient(circle at 80% 80%, #ffffff 0, transparent 45%)",
          }}
        />
        <div className="relative mx-auto max-w-7xl px-6 py-20 lg:px-12 lg:py-28">
          <div className="grid gap-14 lg:grid-cols-[1fr_1.4fr] lg:gap-20 lg:items-end">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-white/50">
                Why Nestly
              </p>
              <h2 className="mt-4 text-[36px] md:text-[52px] font-medium leading-[1.02] tracking-[-0.03em]">
                Built for seekers.
                <br />
                <span className="text-white/50">Not for brokers.</span>
              </h2>
              <p className="mt-6 max-w-md text-[15px] leading-[1.65] text-white/60">
                Listings are posted directly by owners and residents, not agents. You see the
                owner's asking price, and every message goes straight to the person with the keys.
              </p>
              <a
                href="/search?mode=rent"
                className="mt-8 inline-flex items-center gap-3 rounded-full bg-white px-6 py-3 text-[14px] font-medium text-black transition-colors hover:bg-white/90"
              >
                Browse homes
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: "#7e22ce" }}
                />
              </a>
            </div>

            <div className="grid gap-px overflow-hidden rounded-3xl bg-white/10 sm:grid-cols-2">
              {[
                {
                  k: "Verified badges",
                  v: "Owners who complete verification get a badge — look for it before you visit or pay anything.",
                  icon: <path d="M12 3l8 3v5c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-3z" />,
                },
                {
                  k: "Zero broker fees",
                  v: "Nestly charges seekers nothing. Deal directly with the owner — no middleman's cut.",
                  icon: <path d="M4 12h16M4 6h16M4 18h10" />,
                },
                {
                  k: "Direct messaging",
                  v: "Chat with the owner in-app. Your phone number stays private.",
                  icon: <path d="M4 5h16v10H8l-4 4V5z" />,
                },
                {
                  k: "Post in minutes",
                  v: "Upload photos, set a price, publish. Free for owners.",
                  icon: <path d="M12 5v14M5 12h14" />,
                },
              ].map((f) => (
                <div key={f.k} className="bg-black p-8 transition-colors hover:bg-white/[0.03]">
                  <div
                    className="mb-6 inline-flex h-10 w-10 items-center justify-center rounded-full"
                    style={{ backgroundColor: "#7e22ce" }}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      width="18"
                      height="18"
                      fill="none"
                      stroke="#ffffff"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      {f.icon}
                    </svg>
                  </div>
                  <p className="text-[17px] font-medium tracking-[-0.01em]">{f.k}</p>
                  <p className="mt-2 text-[13.5px] leading-[1.6] text-white/55">{f.v}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Bottom stats row */}
          <div className="mt-16 grid gap-8 border-t border-white/10 pt-10 sm:grid-cols-3">
            {[
              { k: "0%", v: "Brokerage for seekers" },
              { k: "In-app", v: "Owner messaging" },
              { k: "Pune", v: "Where we're starting" },
            ].map((s) => (
              <div key={s.v}>
                <p className="text-[40px] font-medium tracking-[-0.03em] leading-none">{s.k}</p>
                <p className="mt-2 text-[11px] uppercase tracking-[0.24em] text-white/50">{s.v}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
