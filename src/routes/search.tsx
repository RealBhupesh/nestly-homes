import { createFileRoute, Link, useRouterState } from "@tanstack/react-router";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { lazy, Suspense, useMemo, useRef, useState } from "react";
import { useEffect } from "react";
import { Clock, X } from "lucide-react";
import { VirtualListingGrid } from "@/components/nestly/VirtualListingGrid";
import { SaveSearchButton } from "@/components/nestly/SaveSearchButton";
import { ShareSearchButton } from "@/components/nestly/ShareSearchButton";
import { NaturalSearchBar } from "@/components/nestly/NaturalSearchBar";
import { CommuteFilter } from "@/components/nestly/CommuteFilter";
import { useInfiniteQuery, keepPreviousData } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  commuteMinutes,
  getDest,
  haversineKm,
  isCommuteMode,
  COMMUTE_DESTS,
  type CommuteMode,
} from "@/lib/commute";
import {
  formatMoney,
  hasCoords,
  parsePropertyTypes,
  PROPERTY_TYPE_LABEL,
  PROPERTY_TYPES,
  PROPERTY_TYPE_ICON,
  searchParamsToFilters,
  type Listing,
} from "@/lib/listings-data";
import { searchListings } from "@/lib/public-listings.functions";
import { useAuth } from "@/hooks/use-auth";
import { pageHead } from "@/lib/site";
import {
  PlaceAutocomplete,
  PUNE_NEIGHBORHOODS,
  geocode,
  type GeocodeHit,
  type PickedPlace,
} from "@/components/nestly/PlaceAutocomplete";

type RecentTarget = {
  label: string;
  lat: number;
  lng: number;
  zoom?: number;
  radiusKm: number;
  ts: number;
};
const RECENT_KEY = "nestly:recent-targets";
const RECENT_MAX = 6;
function loadRecents(): RecentTarget[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as RecentTarget[]).slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}
function persistRecents(list: RecentTarget[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}
function saveRecent(prev: RecentTarget[], r: RecentTarget): RecentTarget[] {
  const dedup = prev.filter((p) => p.label.toLowerCase() !== r.label.toLowerCase());
  const next = [r, ...dedup].slice(0, RECENT_MAX);
  persistRecents(next);
  return next;
}

const ListingsMap = lazy(() =>
  import("@/components/nestly/ListingsMap").then((m) => ({ default: m.ListingsMap })),
);

const PAGE_SIZE = 24;
const DEFAULT_RADIUS_KM = 4;

const searchSchema = z.object({
  mode: fallback(z.string(), "rent").default("rent"),
  q: fallback(z.string(), "").default(""),
  // "any", a DB property type, or a comma list ("room,pg"). Legacy "flat" → apartment.
  type: fallback(z.string(), "any").default("any"),
  min: fallback(z.number(), 0).default(0),
  max: fallback(z.number(), 0).default(0),
  beds: fallback(z.number(), 0).default(0),
  furn: fallback(z.string(), "any").default("any"),
  sort: fallback(z.string(), "fresh").default("fresh"),
  view: fallback(z.string(), "split").default("split"), // split | list | map (mobile)
  dest: fallback(z.string(), "").default(""),
  cmode: fallback(z.string(), "bike").default("bike"),
  cmax: fallback(z.number(), 0).default(0),
  // Search radius (km) around the selected place.
  radius: fallback(z.number(), 0).default(0),
  // Selected/geocoded place — persisted so shared links preserve the pin.
  lat: fallback(z.number(), 0).default(0),
  lng: fallback(z.number(), 0).default(0),
  zoom: fallback(z.number(), 0).default(0),
  label: fallback(z.string(), "").default(""),
});

export const Route = createFileRoute("/search")({
  validateSearch: zodValidator(searchSchema),
  head: () =>
    pageHead({
      title: "Search rooms, flats & homes in Pune — Nestly",
      description:
        "Filter rentals and homes for sale in Pune by price, type and furnishing. Direct from owners, no brokers.",
      path: "/search",
    }),
  component: SearchPage,
});

type Bounds = { west: number; south: number; east: number; north: number };

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  const key = JSON.stringify(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ms]);
  return v;
}

/** Square bbox of `km` around a point. */
function bboxAround(p: { lat: number; lng: number }, km: number): Bounds {
  const dLat = km / 111;
  const dLng = km / (111 * Math.max(0.2, Math.cos((p.lat * Math.PI) / 180)));
  return { west: p.lng - dLng, east: p.lng + dLng, south: p.lat - dLat, north: p.lat + dLat };
}

function roundBounds(b: Bounds): Bounds {
  const r = (n: number) => Math.round(n * 1000) / 1000;
  return { west: r(b.west), south: r(b.south), east: r(b.east), north: r(b.north) };
}

/** Normalise an AI/NL patch to our URL params. */
function normalizePatch(patch: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...patch };
  if ("type" in out) {
    const t = parsePropertyTypes(
      typeof out.type === "string" ? out.type : Array.isArray(out.type) ? out.type.join(",") : "",
    );
    out.type = t.length ? t.join(",") : "any";
  }
  if ("sort" in out && !["fresh", "price-asc", "price-desc", "distance"].includes(String(out.sort)))
    delete out.sort;
  return out;
}

function SearchPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const { user, loading: authLoading } = useAuth();
  const href = useRouterState({ select: (s) => s.location.href });
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [searchInArea, setSearchInArea] = useState(false);
  const [recents, setRecents] = useState<RecentTarget[]>(() => loadRecents());
  const listScrollRef = useRef<HTMLElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const update = (patch: Record<string, unknown>) =>
    navigate({ search: (prev: Record<string, unknown>) => ({ ...prev, ...patch }) });

  // Radius + fly-to target live in the URL so shared links preserve them.
  const radiusKm = search.radius > 0 ? search.radius : DEFAULT_RADIUS_KM;
  const flyTo = useMemo(
    () =>
      search.lat !== 0 && search.lng !== 0
        ? {
            lat: search.lat,
            lng: search.lng,
            zoom: search.zoom > 0 ? search.zoom : undefined,
            label: search.label || undefined,
          }
        : null,
    [search.lat, search.lng, search.zoom, search.label],
  );
  const setRadiusKm = (r: number) => update({ radius: r });
  const setFlyTo = (t: { lat: number; lng: number; zoom?: number; label?: string } | null) => {
    if (!t) {
      update({ lat: 0, lng: 0, zoom: 0, label: "" });
      return;
    }
    update({ lat: t.lat, lng: t.lng, zoom: t.zoom ?? 0, label: t.label ?? "" });
  };

  // "Place mode": the query IS a picked place (autocomplete / recent / known
  // neighbourhood). Then we search by distance around it instead of by text.
  const placeMode = Boolean(
    flyTo &&
    search.label &&
    search.q.trim() &&
    search.label.trim().toLowerCase() === search.q.trim().toLowerCase(),
  );
  const dest = search.dest ? getDest(search.dest) : undefined;
  const cmode: CommuteMode = isCommuteMode(search.cmode) ? search.cmode : "bike";
  const commuteActive = Boolean(dest && search.cmax > 0);

  const serverInput = useMemo(() => {
    const f = searchParamsToFilters(search);
    let bbox: Bounds | undefined;
    let requireCoords = false;
    if (placeMode && flyTo) {
      bbox = roundBounds(bboxAround(flyTo, radiusKm));
      requireCoords = true;
    } else if (searchInArea && bounds && search.view !== "list") {
      bbox = roundBounds(bounds);
    } else if (commuteActive && dest) {
      // Generous box (≤30 km/h); exact commute filter runs client-side.
      bbox = roundBounds(bboxAround(dest, (search.cmax / 60) * 30));
      requireCoords = true;
    }
    return {
      ...f,
      q: placeMode ? undefined : f.q,
      sort: f.sort,
      bbox,
      requireCoords: requireCoords || undefined,
    };
  }, [search, placeMode, flyTo, radiusKm, searchInArea, bounds, commuteActive, dest]);
  const debouncedInput = useDebounced(serverInput, 300);

  const fetchSearch = useServerFn(searchListings);
  const query = useInfiniteQuery({
    queryKey: ["search-listings", debouncedInput],
    queryFn: ({ pageParam }) =>
      fetchSearch({ data: { ...debouncedInput, limit: PAGE_SIZE, offset: pageParam } }),
    initialPageParam: 0,
    getNextPageParam: (last) => (last.hasMore ? last.offset + last.items.length : undefined),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
  const loaded = useMemo(() => query.data?.pages.flatMap((p) => p.items) ?? [], [query.data]);
  const serverTotal = query.data?.pages[0]?.total ?? 0;

  // Anchor for distances: the picked place, else the commute destination.
  const anchor = flyTo ?? (dest ? { lat: dest.lat, lng: dest.lng, label: dest.label } : null);
  const distances = useMemo(() => {
    if (!anchor) return null;
    const m = new Map<string, number>();
    for (const l of loaded)
      if (hasCoords(l)) m.set(l.id, haversineKm({ lat: l.lat, lng: l.lng }, anchor));
    return m;
  }, [loaded, anchor?.lat, anchor?.lng]);

  const results = useMemo(() => {
    let out: Listing[] = loaded;
    if (placeMode && distances)
      out = out.filter((l) => (distances.get(l.id) ?? Infinity) <= radiusKm);
    if (commuteActive && dest) {
      out = out
        .filter(hasCoords)
        .map((l) => ({ l, m: commuteMinutes({ lat: l.lat, lng: l.lng }, dest, cmode) }))
        .filter((x) => x.m <= search.cmax)
        .sort((a, b) => a.m - b.m)
        .map((x) => x.l);
    } else if (search.sort === "distance" && distances) {
      out = out
        .slice()
        .sort((a, b) => (distances.get(a.id) ?? Infinity) - (distances.get(b.id) ?? Infinity));
    }
    return out;
  }, [
    loaded,
    placeMode,
    distances,
    radiusKm,
    commuteActive,
    dest,
    cmode,
    search.cmax,
    search.sort,
  ]);
  const clientFiltered = placeMode || commuteActive;
  const count = clientFiltered ? results.length : serverTotal;
  const hasMore = Boolean(query.hasNextPage);

  const fitKey = useMemo(
    () =>
      [
        search.mode,
        search.q,
        search.type,
        search.furn,
        search.min,
        search.max,
        search.beds,
        search.dest,
        search.cmode,
        search.cmax,
      ].join("|"),
    [
      search.mode,
      search.q,
      search.type,
      search.furn,
      search.min,
      search.max,
      search.beds,
      search.dest,
      search.cmode,
      search.cmax,
    ],
  );

  // Infinite scroll: load the next page when the sentinel scrolls into view.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && !query.isFetchingNextPage)
          void query.fetchNextPage();
      },
      { rootMargin: "600px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMore, query.isFetchingNextPage, results.length]);

  // Derive the map's rough center + zoom from its current bounds so the
  // autocomplete can rank suggestions by distance to what the user is
  // looking at, and widen its effective radius as they zoom out.
  const viewport = useMemo(() => {
    if (!bounds)
      return { center: null as { lat: number; lng: number } | null, zoom: null as number | null };
    const center = {
      lat: (bounds.north + bounds.south) / 2,
      lng: (bounds.east + bounds.west) / 2,
    };
    const lngSpan = Math.max(0.0001, Math.abs(bounds.east - bounds.west));
    const zoom = Math.log2(360 / lngSpan); // approximation good enough for weighting
    return { center, zoom };
  }, [bounds]);

  // Geocode the free-text query so the map jumps to colleges / landmarks
  // even when no listing text matches. Curated Pune spots resolve instantly;
  // anything else goes through our cached geocoding proxy (debounced).
  useEffect(() => {
    const q = search.q.trim();
    if (q.length < 2) {
      if (search.lat !== 0 || search.lng !== 0) setFlyTo(null);
      return;
    }
    // Already resolved (picked from autocomplete / recents) — keep that pin.
    if (search.label && search.label.toLowerCase() === q.toLowerCase() && search.lat !== 0) return;
    const lower = q.toLowerCase();
    const destHit = COMMUTE_DESTS.find((d) => d.label.toLowerCase().includes(lower));
    if (destHit) {
      setFlyTo({ lat: destHit.lat, lng: destHit.lng, zoom: 14.5, label: destHit.label });
      return;
    }
    const hood = PUNE_NEIGHBORHOODS.find((n) => n.label.toLowerCase() === lower);
    if (hood) {
      setFlyTo({ lat: hood.lat, lng: hood.lng, zoom: 14, label: hood.label });
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const data = await geocode(q, 5, ctrl.signal);
        if (!data.length) return;
        // Prefer hits inside Pune; otherwise take the top result.
        const inPune = (h: GeocodeHit) => {
          const la = Number(h.lat),
            lo = Number(h.lon);
          return la >= 18.42 && la <= 18.65 && lo >= 73.7 && lo <= 73.99;
        };
        const pick = data.find(inPune) ?? data[0];
        setFlyTo({
          lat: Number(pick.lat),
          lng: Number(pick.lon),
          zoom: 15,
          label: pick.name || pick.display_name.split(",")[0],
        });
      } catch {
        /* ignore */
      }
    }, 500);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.q]);

  // Persist any labelled fly-to target so seekers can re-run it in one tap.
  useEffect(() => {
    if (!flyTo?.label) return;
    setRecents((prev) => {
      const next = saveRecent(prev, {
        label: flyTo.label!,
        lat: flyTo.lat,
        lng: flyTo.lng,
        zoom: flyTo.zoom,
        radiusKm,
        ts: Date.now(),
      });
      return next;
    });
    // Only key off place identity — radius updates shouldn't spam saves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyTo?.label, flyTo?.lat, flyTo?.lng]);

  function applyRecent(r: RecentTarget) {
    update({
      q: r.label,
      lat: r.lat,
      lng: r.lng,
      zoom: r.zoom ?? 14.5,
      label: r.label,
      radius: r.radiusKm,
    });
  }
  function pickPlace(p: PickedPlace) {
    if (typeof p.lat === "number" && typeof p.lng === "number") {
      update({ q: p.label, lat: p.lat, lng: p.lng, zoom: p.zoom ?? 15, label: p.label });
    } else {
      update({ q: p.label });
    }
  }
  function removeRecent(label: string) {
    setRecents((prev) => {
      const next = prev.filter((r) => r.label !== label);
      persistRecents(next);
      return next;
    });
  }

  // Listings within the radius of the fly-to target — highlighted on the map.
  const nearIds = useMemo(() => {
    if (!flyTo || !distances) return null;
    const set = new Set<string>();
    for (const l of results) if ((distances.get(l.id) ?? Infinity) <= radiusKm) set.add(l.id);
    return set;
  }, [flyTo, distances, results, radiusKm]);

  const filtersActive =
    Boolean(search.q.trim()) ||
    search.type !== "any" ||
    search.furn !== "any" ||
    search.min > 0 ||
    search.max > 0 ||
    search.beds > 0 ||
    commuteActive ||
    (searchInArea && Boolean(bounds));
  const resetFilters = () => {
    setSearchInArea(false);
    navigate({ search: { mode: search.mode } as never });
  };
  const authLink = authLoading ? null : (
    <Link
      to={user ? "/dashboard" : "/auth"}
      search={(user ? undefined : { redirect: href }) as never}
      className="inline-flex shrink-0 items-center rounded-full border border-border bg-card px-3 py-1.5 text-[12px] font-semibold text-ink transition hover:-translate-y-0.5 hover:shadow-tactile"
    >
      {user ? "Dashboard" : "Sign in"}
    </Link>
  );

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <NaturalSearchBar onApply={(patch) => update(normalizePatch(patch))} />
      <FiltersBar
        search={search}
        onChange={update}
        count={count}
        countApprox={clientFiltered && hasMore}
        canSortByDistance={Boolean(anchor)}
        authLink={authLink}
        onPickPlace={pickPlace}
        center={viewport.center}
        zoom={viewport.zoom}
        radiusKm={radiusKm}
        bounds={bounds}
      />
      {recents.length > 0 && !flyTo && (
        <RecentTargetsRow recents={recents} onPick={applyRecent} onRemove={removeRecent} />
      )}

      {/* Desktop view switcher + search-in-area toggle */}
      <div className="pointer-events-none sticky top-[57px] z-20 hidden justify-center gap-2 px-4 lg:flex">
        <div className="pointer-events-auto -mb-4 mt-3 inline-flex items-center gap-1 rounded-full border border-border bg-card p-1 text-xs font-semibold text-ink shadow-tactile">
          {(
            [
              ["list", "List only"],
              ["split", "Split"],
              ["map", "Map only"],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => update({ view: v })}
              className={`rounded-full px-3 py-1 transition ${
                search.view === v ? "bg-ink text-cream" : "text-ink/60 hover:text-ink"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {search.view !== "list" && (
          <label className="pointer-events-auto -mb-4 mt-3 inline-flex cursor-pointer items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5 text-xs font-semibold text-ink shadow-tactile">
            <input
              type="checkbox"
              checked={searchInArea}
              onChange={(e) => setSearchInArea(e.target.checked)}
              className="h-3.5 w-3.5 accent-primary"
            />
            Search as I move the map
          </label>
        )}
        {search.view !== "list" && flyTo && (
          <div className="pointer-events-auto -mb-4 mt-3 inline-flex items-center gap-1 rounded-full border border-border bg-card px-1.5 py-1 text-xs font-semibold text-ink shadow-tactile">
            <span className="pl-2 pr-1 text-ink/60">Radius</span>
            {[1, 2, 4, 6, 10].map((km) => (
              <button
                key={km}
                type="button"
                onClick={() => setRadiusKm(km)}
                aria-pressed={radiusKm === km}
                className={`tabular rounded-full px-2.5 py-1 transition ${
                  radiusKm === km ? "bg-ink text-cream" : "text-ink/70 hover:bg-muted"
                }`}
              >
                {km} km
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Mobile view switcher */}
      <div className="sticky top-0 z-20 flex items-center justify-center gap-1 border-b border-border/60 bg-background/95 px-4 py-2 backdrop-blur lg:hidden">
        {(["list", "map"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => update({ view: v })}
            className={`rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-wide transition ${
              search.view === v || (search.view === "split" && v === "list")
                ? "bg-ink text-cream"
                : "text-ink/60"
            }`}
          >
            {v}
          </button>
        ))}
      </div>

      {/* Mobile filters */}
      <div className="border-b border-border/60 bg-background/95 lg:hidden">
        <div className="px-4 pt-2.5">
          <PlaceAutocomplete
            value={search.q}
            onChange={(v) => update({ q: v })}
            onPick={pickPlace}
            compact
            center={viewport.center}
            zoom={viewport.zoom}
            radiusKm={radiusKm}
            bounds={bounds}
          />
        </div>
        {flyTo && (
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide px-4 pt-2 text-[11px] font-semibold text-ink">
            <span className="shrink-0 text-ink/60">Radius</span>
            {[1, 2, 4, 6, 10].map((km) => (
              <button
                key={km}
                type="button"
                onClick={() => setRadiusKm(km)}
                aria-pressed={radiusKm === km}
                className={`tabular shrink-0 rounded-full px-2.5 py-1 transition ${
                  radiusKm === km ? "bg-ink text-cream" : "bg-muted text-ink/70"
                }`}
              >
                {km} km
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide px-4 py-2.5">
          <div className="inline-flex shrink-0 rounded-full bg-muted p-1 text-[11px] font-semibold">
            {(["rent", "sale"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => update({ mode: m })}
                className={`rounded-full px-3 py-1 transition ${
                  search.mode === m ? "bg-card text-ink shadow-tactile" : "text-ink/60"
                }`}
              >
                {m === "rent" ? "Rent" : "Sale"}
              </button>
            ))}
          </div>
          <label className="flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs">
            <span className="text-ink/50">Type</span>
            <select
              value={typeValue(search.type)}
              onChange={(e) => update({ type: e.target.value })}
              className="cursor-pointer bg-transparent font-medium text-ink focus:outline-none"
            >
              {typeOptions(search.type, true).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs">
            <span className="text-ink/50">Furn</span>
            <select
              value={search.furn}
              onChange={(e) => update({ furn: e.target.value })}
              className="cursor-pointer bg-transparent font-medium text-ink focus:outline-none"
            >
              {[
                ["any", "Any"],
                ["furnished", "Furnished"],
                ["semi", "Semi"],
                ["unfurnished", "Unfurn"],
              ].map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <input
            value={search.max || ""}
            onChange={(e) => update({ max: Number(e.target.value) || 0 })}
            inputMode="numeric"
            placeholder={search.mode === "rent" ? "Max ₹/mo" : "Max ₹"}
            className="tabular w-24 shrink-0 rounded-full border border-border bg-card px-3 py-1.5 text-xs placeholder:text-ink/40 focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <label className="flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs">
            <span className="text-ink/50">Sort</span>
            <select
              value={search.sort}
              onChange={(e) => update({ sort: e.target.value })}
              className="cursor-pointer bg-transparent font-medium text-ink focus:outline-none"
            >
              {sortOptions(Boolean(anchor)).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs">
            <span className="text-ink/50">Beds</span>
            <select
              value={String(search.beds || 0)}
              onChange={(e) => update({ beds: Number(e.target.value) })}
              className="cursor-pointer bg-transparent font-medium text-ink focus:outline-none"
            >
              {BEDS_OPTIONS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <span className="ml-1 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-ink/50">
            {count}
            {clientFiltered && hasMore ? "+" : ""} {count === 1 ? "home" : "homes"}
          </span>
          {authLink}
        </div>
      </div>

      <div
        className={`flex flex-1 min-h-0 flex-col lg:grid ${
          search.view === "list"
            ? "lg:grid-cols-1"
            : search.view === "map"
              ? "lg:grid-cols-1"
              : "lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]"
        }`}
      >
        {/* List side */}
        <section
          ref={listScrollRef}
          className={`min-h-0 overflow-y-auto ${search.view === "map" ? "hidden" : "block"}`}
        >
          <div
            className={`mx-auto px-4 py-6 sm:px-6 ${search.view === "list" ? "max-w-6xl" : "max-w-3xl"}`}
          >
            <ListYourPlaceBanner />
            {query.isError && !query.data ? (
              <div className="rounded-3xl border border-dashed border-border bg-card p-10 text-center">
                <h2 className="font-display text-2xl font-semibold text-ink">
                  We couldn't load listings.
                </h2>
                <p className="mt-2 text-sm text-ink/60">Check your connection and try again.</p>
                <button
                  type="button"
                  onClick={() => void query.refetch()}
                  className="mt-5 inline-flex rounded-full bg-ink px-5 py-2 text-sm font-semibold text-cream shadow-tactile hover:-translate-y-0.5 hover:shadow-lift"
                >
                  Try again
                </button>
              </div>
            ) : query.isLoading && !query.data ? (
              <ResultsSkeleton />
            ) : results.length === 0 && !hasMore ? (
              <EmptyState filtersActive={filtersActive} onReset={resetFilters} />
            ) : (
              <>
                {query.isFetching && !query.isFetchingNextPage && (
                  <div
                    className="mb-3 h-0.5 w-full overflow-hidden rounded-full bg-muted"
                    aria-hidden
                  >
                    <div className="h-full w-1/3 animate-pulse rounded-full bg-primary/60" />
                  </div>
                )}
                <VirtualListingGrid
                  listings={results}
                  hoveredId={hoveredId}
                  onHover={setHoveredId}
                  selectedId={selectedId}
                  onSelect={(id) => {
                    setSelectedId(id);
                    setHoveredId(id);
                  }}
                  scrollRef={listScrollRef}
                  distances={distances}
                  distanceLabel={anchor?.label ? anchor.label.split(",")[0] : undefined}
                />
                <div ref={sentinelRef} className="flex justify-center py-6">
                  {hasMore ? (
                    <button
                      type="button"
                      onClick={() => void query.fetchNextPage()}
                      disabled={query.isFetchingNextPage}
                      className="rounded-full border border-border bg-card px-5 py-2 text-sm font-semibold text-ink shadow-tactile disabled:opacity-60"
                    >
                      {query.isFetchingNextPage ? "Loading more…" : "Load more"}
                    </button>
                  ) : results.length > PAGE_SIZE ? (
                    <span className="text-xs text-ink/45">
                      You've seen all {results.length} homes
                    </span>
                  ) : null}
                </div>
              </>
            )}
          </div>
        </section>

        {/* Map side */}
        <aside
          className={`lg:sticky lg:top-0 lg:h-[100svh] min-h-0 border-l border-border/60 bg-muted ${
            search.view === "map"
              ? "block h-[calc(100svh-41px)] lg:h-[100svh]"
              : search.view === "list"
                ? "hidden"
                : "hidden lg:block"
          }`}
        >
          <div className="relative h-full">
            <Suspense
              fallback={
                <div className="grid h-full place-items-center text-sm text-ink/50">
                  Loading map…
                </div>
              }
            >
              <ListingsMap
                listings={results}
                hoveredId={selectedId ?? hoveredId}
                onHover={setHoveredId}
                onSelect={(id) => {
                  setSelectedId(id);
                  setHoveredId(id);
                }}
                onBoundsChange={setBounds}
                fitKey={fitKey}
                flyTo={flyTo}
                nearIds={nearIds}
                radiusKm={radiusKm}
              />
            </Suspense>
            {selectedId &&
              (() => {
                const l = results.find((x) => x.id === selectedId);
                if (!l) return null;
                const isRent = l.listingType === "rent";
                return (
                  <div
                    className={`pointer-events-auto absolute left-3 right-3 z-20 mx-auto max-w-md rounded-2xl border border-border/70 bg-card/95 p-3 shadow-tactile backdrop-blur sm:left-4 sm:right-auto sm:mx-0 sm:w-[22rem] sm:max-w-none ${flyTo ? "top-32 sm:top-28" : "top-4"}`}
                  >
                    <div className="flex gap-3">
                      {l.photo ? (
                        <img
                          src={l.photo}
                          alt=""
                          loading="lazy"
                          className="h-20 w-24 flex-none rounded-xl object-cover"
                        />
                      ) : (
                        <span
                          className="grid h-20 w-24 flex-none place-items-center rounded-xl bg-muted text-3xl"
                          aria-hidden
                        >
                          {PROPERTY_TYPE_ICON[l.propertyType]}
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">
                              {l.neighborhood} · {l.city}
                            </div>
                            <div className="mt-0.5 truncate text-sm font-semibold text-ink">
                              {l.title}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setSelectedId(null)}
                            aria-label="Close preview"
                            className="-mr-1 -mt-1 rounded-full px-2 py-1 text-lg leading-none text-ink/50 hover:bg-muted hover:text-ink"
                          >
                            ×
                          </button>
                        </div>
                        <div className="tabular mt-1 text-[12px] text-ink/60">
                          {l.beds} bd · {l.baths} ba{l.areaSqft ? ` · ${l.areaSqft} sqft` : ""}
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <div className="tabular text-sm font-semibold text-ink">
                            {formatMoney(l.price)}
                            {isRent && (
                              <span className="text-[11px] font-medium text-ink/50">/mo</span>
                            )}
                          </div>
                          <Link
                            to="/listing/$id"
                            params={{ id: l.id }}
                            className="rounded-full bg-ink px-3 py-1.5 text-[11px] font-semibold text-background hover:bg-ink/90"
                          >
                            View details →
                          </Link>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}
            {flyTo && (
              <div className="pointer-events-auto absolute left-4 top-4 z-10 w-[min(20rem,calc(100%-2rem))] rounded-2xl border border-border/70 bg-card/95 p-4 shadow-tactile backdrop-blur">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">
                      Searched location
                    </div>
                    <div className="mt-1 truncate text-sm font-semibold text-ink">
                      {flyTo.label ?? "Selected place"}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFlyTo(null)}
                    className="-mr-1 -mt-1 rounded-full px-2 py-1 text-lg leading-none text-ink/50 hover:bg-muted hover:text-ink"
                    aria-label="Clear searched location"
                  >
                    ×
                  </button>
                </div>
                <dl className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
                  <div className="rounded-lg bg-muted/70 p-2">
                    <dt className="text-ink/50">{placeMode ? "Within" : "Nearby"}</dt>
                    <dd className="tabular mt-0.5 text-sm font-semibold text-ink">
                      {nearIds?.size ?? 0}
                    </dd>
                  </div>
                  <div className="rounded-lg bg-muted/70 p-2">
                    <dt className="text-ink/50">Radius</dt>
                    <dd className="tabular mt-0.5 text-sm font-semibold text-ink">
                      {radiusKm.toFixed(1)} km
                    </dd>
                  </div>
                  <div className="rounded-lg bg-muted/70 p-2">
                    <dt className="text-ink/50">Total</dt>
                    <dd className="tabular mt-0.5 text-sm font-semibold text-ink">{count}</dd>
                  </div>
                </dl>
                <div className="tabular mt-3 flex items-center justify-between text-[11px] text-ink/60">
                  <span>
                    {flyTo.lat.toFixed(4)}°, {flyTo.lng.toFixed(4)}°
                  </span>
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${flyTo.lat},${flyTo.lng}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-primary hover:underline"
                  >
                    Directions →
                  </a>
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function RecentTargetsRow({
  recents,
  onPick,
  onRemove,
}: {
  recents: RecentTarget[];
  onPick: (r: RecentTarget) => void;
  onRemove: (label: string) => void;
}) {
  return (
    <div className="border-b border-border/60 bg-background/95 backdrop-blur">
      <div className="mx-auto flex max-w-[100rem] items-center gap-2 overflow-x-auto scrollbar-hide px-4 py-2 sm:px-6">
        <span className="inline-flex shrink-0 items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink/50">
          <Clock className="h-3 w-3" /> Recent
        </span>
        {recents.map((r) => (
          <span
            key={r.label}
            className="group inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-card pl-3 pr-1 py-1 text-[12px] font-semibold text-ink shadow-tactile transition hover:-translate-y-0.5"
          >
            <button
              type="button"
              onClick={() => onPick(r)}
              className="inline-flex items-center gap-1.5"
              title={`Re-run ${r.label} · ${r.radiusKm.toFixed(1)} km`}
            >
              <span className="max-w-[10rem] truncate">{r.label}</span>
              <span className="tabular text-[10px] font-medium text-ink/50">
                {r.radiusKm.toFixed(1)} km
              </span>
            </button>
            <button
              type="button"
              onClick={() => onRemove(r.label)}
              aria-label={`Remove ${r.label} from recents`}
              className="ml-0.5 rounded-full p-1 text-ink/40 hover:bg-muted hover:text-ink"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}

function FiltersBar({
  search,
  onChange,
  count,
  countApprox,
  canSortByDistance,
  authLink,
  onPickPlace,
  center,
  zoom,
  radiusKm,
  bounds,
}: {
  search: z.infer<typeof searchSchema>;
  onChange: (patch: Record<string, unknown>) => void;
  count: number;
  countApprox: boolean;
  canSortByDistance: boolean;
  authLink: React.ReactNode;
  onPickPlace: (p: PickedPlace) => void;
  center: { lat: number; lng: number } | null;
  zoom: number | null;
  radiusKm: number;
  bounds: { west: number; south: number; east: number; north: number } | null;
}) {
  return (
    <div className="sticky top-0 z-30 border-b border-border/60 bg-background/95 backdrop-blur hidden lg:block">
      <div className="mx-auto flex max-w-[100rem] flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
        <div className="inline-flex rounded-full bg-muted p-1 text-xs font-semibold">
          {(["rent", "sale"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onChange({ mode: m })}
              className={`rounded-full px-3 py-1.5 transition ${
                search.mode === m ? "bg-card text-ink shadow-tactile" : "text-ink/60"
              }`}
            >
              {m === "rent" ? "For rent" : "For sale"}
            </button>
          ))}
        </div>

        <PlaceAutocomplete
          className="min-w-[240px] flex-1"
          value={search.q}
          onChange={(v) => onChange({ q: v })}
          onPick={onPickPlace}
          center={center}
          zoom={zoom}
          radiusKm={radiusKm}
          bounds={bounds}
        />

        <Select
          value={typeValue(search.type)}
          onChange={(v) => onChange({ type: v })}
          label="Type"
          options={typeOptions(search.type, false)}
        />
        <Select
          value={String(search.beds || 0)}
          onChange={(v) => onChange({ beds: Number(v) })}
          label="Bedrooms"
          options={BEDS_OPTIONS}
        />
        <Select
          value={search.furn}
          onChange={(v) => onChange({ furn: v })}
          label="Furnishing"
          options={[
            ["any", "Any"],
            ["furnished", "Furnished"],
            ["semi", "Semi"],
            ["unfurnished", "Unfurnished"],
          ]}
        />
        <input
          value={search.max || ""}
          onChange={(e) => onChange({ max: Number(e.target.value) || 0 })}
          inputMode="numeric"
          placeholder={search.mode === "rent" ? "Max ₹/mo" : "Max ₹"}
          className="tabular w-32 rounded-full border border-border bg-card px-4 py-2 text-sm placeholder:text-ink/40 focus:outline-none focus:ring-2 focus:ring-primary"
        />

        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-ink/50">
            {count}
            {countApprox ? "+" : ""} {count === 1 ? "home" : "homes"}
          </span>
          <CommuteFilter
            destKey={search.dest}
            mode={search.cmode}
            minutes={search.cmax}
            onChange={onChange}
          />
          <SaveSearchButton params={search} resultCount={count} />
          <ShareSearchButton />
          <Select
            value={search.sort}
            onChange={(v) => onChange({ sort: v })}
            label="Sort"
            options={sortOptions(canSortByDistance)}
          />
          {authLink}
        </div>
      </div>
    </div>
  );
}

function Select({
  value,
  onChange,
  label,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  options: [string, string][];
}) {
  return (
    <label className="relative inline-flex items-center rounded-full border border-border bg-card px-3 py-2 text-sm">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="cursor-pointer bg-transparent pr-5 text-ink focus:outline-none"
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

const BEDS_OPTIONS: [string, string][] = [
  ["0", "Any beds"],
  ["1", "1+ bed"],
  ["2", "2+ beds"],
  ["3", "3+ beds"],
  ["4", "4+ beds"],
];

function typeValue(raw: string): string {
  const t = parsePropertyTypes(raw);
  return t.length ? t.join(",") : "any";
}

function typeOptions(raw: string, short: boolean): [string, string][] {
  const opts: [string, string][] = [
    ["any", short ? "Any" : "Any type"],
    ...PROPERTY_TYPES.map((t) => [t, PROPERTY_TYPE_LABEL[t]] as [string, string]),
  ];
  const t = parsePropertyTypes(raw);
  if (t.length > 1) opts.push([t.join(","), t.map((x) => PROPERTY_TYPE_LABEL[x]).join(" + ")]);
  return opts;
}

function sortOptions(withDistance: boolean): [string, string][] {
  const opts: [string, string][] = [
    ["fresh", "Newest"],
    ["price-asc", "Price ↑"],
    ["price-desc", "Price ↓"],
  ];
  if (withDistance) opts.push(["distance", "Closest to place"]);
  return opts;
}

function ResultsSkeleton() {
  return (
    <div className="grid gap-5 sm:grid-cols-2" aria-busy="true" aria-label="Loading listings">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="overflow-hidden rounded-3xl border border-border bg-card">
          <div className="aspect-[4/3] animate-pulse bg-muted" />
          <div className="space-y-2 p-4">
            <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ filtersActive, onReset }: { filtersActive: boolean; onReset: () => void }) {
  if (!filtersActive) {
    return (
      <div className="rounded-3xl border border-dashed border-border bg-card p-10 text-center">
        <h2 className="font-display text-2xl font-semibold text-ink">No homes listed here yet.</h2>
        <p className="mt-2 text-sm text-ink/60">
          Nestly is just getting started in Pune. Check back soon — or if you have a place, be one
          of the first owners to list it.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Link
            to="/dashboard/new"
            className="inline-flex rounded-full bg-ink px-5 py-2 text-sm font-semibold text-cream shadow-tactile hover:-translate-y-0.5 hover:shadow-lift"
          >
            List your place
          </Link>
          <Link
            to="/search"
            search={{ mode: "sale" } as never}
            className="inline-flex rounded-full border border-border px-5 py-2 text-sm font-semibold text-ink"
          >
            Try homes for sale
          </Link>
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-3xl border border-dashed border-border bg-card p-10 text-center">
      <h2 className="font-display text-2xl font-semibold text-ink">No matches — yet.</h2>
      <p className="mt-2 text-sm text-ink/60">
        Try widening your budget, a bigger radius, or clearing a filter.
      </p>
      <button
        type="button"
        onClick={onReset}
        className="mt-5 inline-flex rounded-full bg-ink px-5 py-2 text-sm font-semibold text-cream shadow-tactile hover:-translate-y-0.5 hover:shadow-lift"
      >
        Clear filters
      </button>
    </div>
  );
}

function ListYourPlaceBanner() {
  return (
    <Link
      to="/dashboard/new"
      className="group relative mb-5 flex items-center gap-4 overflow-hidden rounded-3xl border border-ink/10 bg-gradient-to-br from-ink via-[hsl(260_35%_18%)] to-[hsl(280_45%_22%)] p-4 text-white shadow-lift transition hover:-translate-y-0.5 sm:p-5"
    >
      <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-coral/30 blur-3xl transition group-hover:bg-coral/50" />
      <div className="pointer-events-none absolute -bottom-24 -left-10 h-56 w-56 rounded-full bg-teal/20 blur-3xl" />
      <div className="relative grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white/10 backdrop-blur ring-1 ring-white/20 sm:h-16 sm:w-16">
        <svg
          viewBox="0 0 24 24"
          className="h-7 w-7 sm:h-8 sm:w-8"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 11 12 4l9 7" />
          <path d="M5 10v10h14V10" />
          <path d="M12 14v5" />
          <path d="M9.5 16.5h5" />
        </svg>
      </div>
      <div className="relative min-w-0 flex-1">
        <div className="mb-1 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white/90 ring-1 ring-white/15">
          <span className="h-1.5 w-1.5 rounded-full bg-teal" />
          0% broker fees
        </div>
        <h3 className="font-display text-base font-bold leading-tight sm:text-lg">
          List your place on Nestly — rent or sell in minutes
        </h3>
        <p className="mt-0.5 truncate text-xs text-white/70 sm:text-sm">
          Photos, AI-assisted details, live preview. Free to list, no brokerage.
        </p>
      </div>
      <div className="relative hidden shrink-0 items-center gap-2 rounded-full bg-coral px-4 py-2 text-sm font-semibold text-primary-foreground shadow-tactile transition group-hover:translate-x-0.5 sm:inline-flex">
        Upload property
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M5 12h14" />
          <path d="m13 5 7 7-7 7" />
        </svg>
      </div>
      <div className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full bg-coral text-primary-foreground shadow-tactile sm:hidden">
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M5 12h14" />
          <path d="m13 5 7 7-7 7" />
        </svg>
      </div>
    </Link>
  );
}
