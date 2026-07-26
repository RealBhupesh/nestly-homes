import { useEffect, useMemo, useRef, useState } from "react";
import { Search, MapPin, X, Building2, Coffee, TramFront, GraduationCap, Landmark } from "lucide-react";
import { COMMUTE_DESTS } from "@/lib/commute";
import { LISTINGS } from "@/lib/listings-data";

export type PickedPlace = {
  label: string;
  lat?: number;
  lng?: number;
  zoom?: number;
};

type Suggestion = {
  id: string;
  label: string;
  sub?: string;
  kind: "campus" | "neighborhood" | "landmark" | "cafe" | "transit" | "shop" | "hospital" | "address" | "place";
  lat?: number;
  lng?: number;
  zoom?: number;
};

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

const KIND_ICON: Record<Suggestion["kind"], React.ComponentType<{ className?: string }>> = {
  campus: GraduationCap,
  neighborhood: MapPin,
  landmark: Landmark,
  cafe: Coffee,
  transit: TramFront,
  shop: Building2,
  hospital: Landmark,
  address: MapPin,
  place: MapPin,
};

function classifyOsm(cls?: string, type?: string): Suggestion["kind"] {
  if (cls === "amenity") {
    if (type === "cafe" || type === "restaurant" || type === "fast_food" || type === "bar") return "cafe";
    if (type === "hospital" || type === "clinic") return "hospital";
    if (type === "university" || type === "college" || type === "school") return "campus";
    return "landmark";
  }
  if (cls === "railway" || cls === "public_transport" || type === "station" || type === "bus_stop") return "transit";
  if (cls === "shop" || type === "mall") return "shop";
  if (cls === "tourism" || cls === "historic") return "landmark";
  if (cls === "highway" || cls === "place" || cls === "building") return "address";
  return "place";
}

function localSuggestions(query: string): Suggestion[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const out: Suggestion[] = [];
  for (const d of COMMUTE_DESTS) {
    if (d.label.toLowerCase().includes(q)) {
      out.push({ id: `dest:${d.label}`, label: d.label, sub: "Campus / hub", kind: "campus", lat: d.lat, lng: d.lng, zoom: 14.5 });
    }
  }
  const seen = new Set<string>();
  for (const l of LISTINGS) {
    const hood = l.neighborhood;
    if (hood && hood.toLowerCase().includes(q) && !seen.has(hood.toLowerCase())) {
      seen.add(hood.toLowerCase());
      out.push({ id: `hood:${hood}`, label: hood, sub: "Neighborhood in Pune", kind: "neighborhood", lat: l.lat, lng: l.lng, zoom: 14 });
    }
    const lm = l.landmark;
    if (lm && lm.toLowerCase().includes(q) && !seen.has(`lm:${lm.toLowerCase()}`)) {
      seen.add(`lm:${lm.toLowerCase()}`);
      out.push({ id: `lm:${lm}`, label: lm, sub: `Near ${l.neighborhood}`, kind: "landmark", lat: l.lat, lng: l.lng, zoom: 15 });
    }
    if (out.length > 12) break;
  }
  return out.slice(0, 6);
}

export function PlaceAutocomplete({
  value,
  onChange,
  onPick,
  onClear,
  placeholder = "Search address, café, metro, campus…",
  className,
  compact,
  center,
  zoom,
  radiusKm,
  bounds,
}: {
  value: string;
  onChange: (v: string) => void;
  onPick: (p: PickedPlace) => void;
  onClear?: () => void;
  placeholder?: string;
  className?: string;
  compact?: boolean;
  /** Current map center — enables distance-based ranking of suggestions. */
  center?: { lat: number; lng: number } | null;
  /** Current map zoom — controls how much broader matches are penalised. */
  zoom?: number | null;
  /** Active highlight radius in km — anchor for the "near" band. */
  radiusKm?: number;
  /** Current map bounds — biases remote geocoder toward the visible area. */
  bounds?: { west: number; south: number; east: number; north: number } | null;
}) {
  const [focused, setFocused] = useState(false);
  const [remote, setRemote] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  const local = useMemo(() => localSuggestions(value), [value]);

  useEffect(() => {
    const q = value.trim();
    if (q.length < 2) { setRemote([]); return; }
    const ctrl = new AbortController();
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const url = new URL("https://nominatim.openstreetmap.org/search");
        url.searchParams.set("q", q);
        url.searchParams.set("format", "json");
        url.searchParams.set("limit", "8");
        url.searchParams.set("addressdetails", "1");
        // Bias to the current map viewport when we have one, else Pune.
        const vb = bounds
          ? `${bounds.west},${bounds.north},${bounds.east},${bounds.south}`
          : "73.70,18.65,73.99,18.42";
        url.searchParams.set("viewbox", vb);
        const res = await fetch(url.toString(), { signal: ctrl.signal, headers: { Accept: "application/json" } });
        type Hit = { lat: string; lon: string; display_name: string; name?: string; type?: string; class?: string; place_id: number };
        const data = (await res.json()) as Hit[];
        const seen = new Set(local.map((l) => l.label.toLowerCase()));
        const mapped: Suggestion[] = [];
        for (const h of data) {
          const label = h.name || h.display_name.split(",")[0];
          const key = label.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          const sub = h.display_name.split(",").slice(1, 3).join(",").trim();
          mapped.push({
            id: `osm:${h.place_id}`,
            label,
            sub: sub || undefined,
            kind: classifyOsm(h.class, h.type),
            lat: Number(h.lat),
            lng: Number(h.lon),
            zoom: 15,
          });
        }
        setRemote(mapped.slice(0, 6));
      } catch { /* ignore */ }
      finally { setLoading(false); }
    }, 250);
    return () => { clearTimeout(t); ctrl.abort(); setLoading(false); };
  }, [value, local, bounds?.west, bounds?.south, bounds?.east, bounds?.north]);

  const suggestions = useMemo(() => {
    const merged = [...local, ...remote];
    if (!center) return merged;
    // Effective radius widens as the map zooms out so broader matches surface.
    const z = typeof zoom === "number" ? zoom : 12;
    const baseR = Math.max(0.3, radiusKm ?? 1.5);
    const effR = baseR * Math.pow(2, Math.max(0, 13 - z));
    const scored = merged.map((s, i) => {
      if (typeof s.lat !== "number" || typeof s.lng !== "number") {
        return { s, score: 0.15, order: i };
      }
      const d = haversineKm(center, { lat: s.lat, lng: s.lng });
      // Smooth decay + a bump for items inside the user's active radius.
      const proximity = 1 / (1 + d / effR);
      const inside = d <= baseR ? 0.25 : 0;
      return { s, score: proximity + inside, order: i };
    });
    scored.sort((a, b) => (b.score - a.score) || (a.order - b.order));
    return scored.map((x) => x.s);
  }, [local, remote, center?.lat, center?.lng, zoom, radiusKm]);

  useEffect(() => { setHighlight(0); }, [value]);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setFocused(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  function pick(s: Suggestion) {
    onChange(s.label);
    onPick({ label: s.label, lat: s.lat, lng: s.lng, zoom: s.zoom });
    setFocused(false);
  }

  const open = focused && (value.trim().length > 0);

  return (
    <div ref={wrapRef} className={`relative ${className ?? ""}`}>
      <label className={`flex items-center gap-2 rounded-full border border-border bg-card text-sm ${compact ? "px-3.5 py-2" : "px-4 py-2"}`}>
        <Search className="h-4 w-4 shrink-0 text-ink/50" />
        <input
          value={value}
          onFocus={() => setFocused(true)}
          onChange={(e) => { onChange(e.target.value); setFocused(true); }}
          onKeyDown={(e) => {
            if (!open || suggestions.length === 0) return;
            if (e.key === "ArrowDown") { e.preventDefault(); setHighlight((h) => (h + 1) % suggestions.length); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setHighlight((h) => (h - 1 + suggestions.length) % suggestions.length); }
            else if (e.key === "Enter") { e.preventDefault(); pick(suggestions[highlight]); }
            else if (e.key === "Escape") { setFocused(false); }
          }}
          placeholder={placeholder}
          className="w-full bg-transparent placeholder:text-ink/40 focus:outline-none"
          autoComplete="off"
        />
        {value ? (
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); onChange(""); onClear?.(); }}
            className="rounded-full px-1.5 text-ink/50 hover:text-ink"
            aria-label="Clear search"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </label>

      {open && (suggestions.length > 0 || loading) && (
        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 overflow-hidden rounded-2xl border border-border bg-card shadow-lift">
          {suggestions.length === 0 && loading && (
            <div className="px-4 py-3 text-xs text-ink/50">Searching places…</div>
          )}
          <ul className="max-h-80 overflow-auto py-1">
            {suggestions.map((s, i) => {
              const Icon = KIND_ICON[s.kind] ?? MapPin;
              const active = i === highlight;
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onMouseEnter={() => setHighlight(i)}
                    onMouseDown={(e) => { e.preventDefault(); pick(s); }}
                    className={`flex w-full items-center gap-3 px-3.5 py-2.5 text-left text-sm transition ${active ? "bg-muted" : "hover:bg-muted/60"}`}
                  >
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-muted text-ink/70">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-medium text-ink">{s.label}</span>
                      {s.sub && <span className="block truncate text-[11.5px] text-ink/50">{s.sub}</span>}
                    </span>
                    <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-ink/35">{s.kind}</span>
                  </button>
                </li>
              );
            })}
            {loading && suggestions.length > 0 && (
              <li className="px-4 py-2 text-[11px] text-ink/40">Finding more…</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}