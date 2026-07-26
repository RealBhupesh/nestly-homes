import { useEffect, useRef, useState } from "react";
import { Loader2, MapPin, Search } from "lucide-react";

interface Coords { lat: number; lng: number }

interface Props {
  value: Coords | null;
  onChange: (coords: Coords, address?: {
    address_line?: string; city?: string; state?: string; postal_code?: string; country?: string;
  }) => void;
  initialCenter?: Coords;
}

// Drop a pin on the map to set coordinates. Uses Nominatim (OpenStreetMap)
// for reverse & forward geocoding — free, no key, rate-limited (be gentle).
export function AddressPicker({ value, onChange, initialCenter }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const maplibregl = (await import("maplibre-gl")).default;
      await import("maplibre-gl/dist/maplibre-gl.css");
      if (cancelled || !containerRef.current) return;

      const center: [number, number] = value
        ? [value.lng, value.lat]
        : initialCenter
          ? [initialCenter.lng, initialCenter.lat]
          : [73.8567, 18.5204]; // Pune default

      const map = new maplibregl.Map({
        container: containerRef.current,
        style: "https://tiles.openfreemap.org/styles/positron",
        center,
        zoom: value ? 15 : 12,
        attributionControl: { compact: true },
      });
      map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), "top-right");
      map.addControl(new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: false,
        showUserLocation: true,
      }), "top-right");

      mapRef.current = map;

      const placeMarker = (lng: number, lat: number) => {
        if (markerRef.current) markerRef.current.remove();
        const el = document.createElement("div");
        el.className = "nestly-address-pin";
        markerRef.current = new maplibregl.Marker({ element: el, draggable: true, anchor: "bottom" })
          .setLngLat([lng, lat])
          .addTo(map);
        markerRef.current.on("dragend", () => {
          const p = markerRef.current.getLngLat();
          void reverseGeocode(p.lat, p.lng);
        });
      };

      if (value) placeMarker(value.lng, value.lat);

      map.on("click", (e: any) => {
        placeMarker(e.lngLat.lng, e.lngLat.lat);
        void reverseGeocode(e.lngLat.lat, e.lngLat.lng);
      });
    })();
    return () => { cancelled = true; mapRef.current?.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function reverseGeocode(lat: number, lng: number) {
    setLoading(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&addressdetails=1`,
        { headers: { "Accept-Language": "en" } },
      );
      if (!res.ok) throw new Error("Lookup failed");
      const data = await res.json();
      const a = data.address ?? {};
      const addressLine = [a.house_number, a.road].filter(Boolean).join(" ") ||
        [a.neighbourhood, a.suburb].filter(Boolean).join(", ") ||
        data.display_name?.split(",").slice(0, 2).join(",");
      onChange({ lat, lng }, {
        address_line: addressLine,
        city: a.city ?? a.town ?? a.village ?? a.municipality ?? a.county,
        state: a.state,
        postal_code: a.postcode,
        country: a.country,
      });
    } catch {
      onChange({ lat, lng });
    } finally {
      setLoading(false);
    }
  }

  async function forwardSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`,
        { headers: { "Accept-Language": "en" } },
      );
      const results = await res.json();
      const hit = results?.[0];
      if (!hit) return;
      const lat = Number(hit.lat), lng = Number(hit.lon);
      mapRef.current?.flyTo({ center: [lng, lat], zoom: 16 });
      // Simulate a click so we drop a marker + reverse geocode for structured fields
      if (mapRef.current) {
        const maplibregl = (await import("maplibre-gl")).default;
        if (markerRef.current) markerRef.current.remove();
        const el = document.createElement("div");
        el.className = "nestly-address-pin";
        markerRef.current = new maplibregl.Marker({ element: el, draggable: true, anchor: "bottom" })
          .setLngLat([lng, lat]).addTo(mapRef.current);
      }
      await reverseGeocode(lat, lng);
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="space-y-3">
      <form onSubmit={forwardSearch} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink/35" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search an address, landmark or area"
            className="w-full rounded-md border border-border bg-background py-2 pl-9 pr-3 text-[13px] outline-none placeholder:text-ink/35 focus:border-ink/30"
          />
        </div>
        <button
          type="submit"
          disabled={searching}
          className="rounded-md bg-ink px-3 py-2 text-[12px] font-medium text-background hover:bg-ink/85 disabled:opacity-50"
        >
          {searching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Find"}
        </button>
      </form>

      <div className="relative h-72 overflow-hidden rounded-lg border border-border/70 bg-muted">
        <div ref={containerRef} className="absolute inset-0" />
        {loading && (
          <div className="pointer-events-none absolute bottom-2 left-2 inline-flex items-center gap-1.5 rounded-full bg-background/90 px-2.5 py-1 text-[11px] text-ink/70 shadow-sm">
            <Loader2 className="h-3 w-3 animate-spin" /> Looking up address…
          </div>
        )}
      </div>

      <p className="flex items-start gap-1.5 text-[11px] text-ink/50">
        <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
        Tap anywhere on the map to drop a pin. Drag it to fine-tune. We'll auto-fill city, state and postal code.
      </p>
    </div>
  );
}