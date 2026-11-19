import { useEffect, useMemo, useRef } from "react";
import Supercluster from "supercluster";
import type { GeoListing, Listing } from "@/lib/listings-data";
import { formatMoney, hasCoords } from "@/lib/listings-data";

interface Props {
  listings: Listing[];
  hoveredId: string | null;
  onHover: (id: string | null) => void;
  onSelect?: (id: string) => void;
  variant?: "price" | "dot";
  interactive?: boolean;
  onBoundsChange?: (bounds: { west: number; south: number; east: number; north: number }) => void;
  /** When this key changes, the map refits its viewport to current listings. */
  fitKey?: string;
  /** Optional target the map should ease to (e.g. geocoded search query). */
  flyTo?: { lat: number; lng: number; zoom?: number; label?: string } | null;
  /** IDs of listings considered "near" the current fly-to target. */
  nearIds?: Set<string> | null;
  /** Highlight radius (km) drawn around the fly-to target. */
  radiusKm?: number;
}

// Client-only MapLibre wrapper. Dynamically imports maplibre-gl and its CSS
// inside useEffect so the module never enters the SSR bundle.
export function ListingsMap({
  listings: allListings,
  hoveredId,
  onHover,
  onSelect,
  variant = "price",
  interactive = true,
  onBoundsChange,
  fitKey,
  flyTo,
  nearIds,
  radiusKm = 1.5,
}: Props) {
  // Listings without coordinates can't be placed on the map — skip them.
  const listings = useMemo(() => allListings.filter(hasCoords), [allListings]);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<Map<string, any>>(new Map());
  const clusterMarkersRef = useRef<any[]>([]);
  const flyMarkerRef = useRef<any>(null);
  const superRef = useRef<Supercluster<{ id: string; listing: GeoListing }> | null>(null);
  const listingsRef = useRef(listings);
  listingsRef.current = listings;
  const onBoundsChangeRef = useRef(onBoundsChange);
  onBoundsChangeRef.current = onBoundsChange;

  // Group listings by mode so rent and sale scale independently.
  const priceStats = useMemo(() => {
    const byMode: Record<string, number[]> = { rent: [], sale: [] };
    for (const l of listings) byMode[l.listingType]?.push(l.price);
    const stat = (arr: number[]) => {
      if (arr.length === 0) return { min: 0, max: 1 };
      const sorted = arr.slice().sort((a, b) => a - b);
      // Clamp to 5th/95th percentile so outliers don't wash out the ramp.
      const lo = sorted[Math.floor(sorted.length * 0.05)];
      const hi = sorted[Math.ceil(sorted.length * 0.95) - 1];
      return { min: lo, max: Math.max(hi, lo + 1) };
    };
    return { rent: stat(byMode.rent), sale: stat(byMode.sale) };
  }, [listings]);
  const priceStatsRef = useRef(priceStats);
  priceStatsRef.current = priceStats;

  // Rebuild the supercluster index whenever the listings change.
  useEffect(() => {
    const index = new Supercluster<{ id: string; listing: GeoListing }>({
      // Clustering disabled — every listing renders as its own pin so the map
      // never shows a numeric "N homes here" bubble.
      radius: 0,
      maxZoom: 16,
      minPoints: Number.MAX_SAFE_INTEGER,
    });
    index.load(
      listings.map((l) => ({
        type: "Feature" as const,
        properties: { id: l.id, listing: l },
        geometry: { type: "Point" as const, coordinates: [l.lng, l.lat] },
      })),
    );
    superRef.current = index;
    if (mapRef.current) {
      // Re-render with the new index synchronously via next microtask.
      (async () => {
        const maplibregl = (await import("maplibre-gl")).default;
        renderMarkers(maplibregl);
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listings, variant]);

  // init once
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const maplibregl = (await import("maplibre-gl")).default;
      await import("maplibre-gl/dist/maplibre-gl.css");
      if (cancelled || !containerRef.current) return;

      const map = new maplibregl.Map({
        container: containerRef.current,
        style: "https://tiles.openfreemap.org/styles/positron",
        center: [73.8475, 18.5308],
        zoom: 12.2,
        attributionControl: { compact: true },
        interactive,
      });
      if (interactive) {
        // Google-Maps-style control cluster
        map.addControl(
          new maplibregl.NavigationControl({
            showCompass: true,
            showZoom: true,
            visualizePitch: true,
          }),
          "top-right",
        );
        map.addControl(
          new maplibregl.GeolocateControl({
            positionOptions: { enableHighAccuracy: true },
            trackUserLocation: true,
          }),
          "top-right",
        );
        map.addControl(new maplibregl.FullscreenControl(), "top-right");
        map.addControl(
          new maplibregl.ScaleControl({ maxWidth: 120, unit: "metric" }),
          "bottom-left",
        );
      }
      mapRef.current = map;

      map.on("load", () => {
        renderMarkers(maplibregl);
        fitToListings(map);
        emitBounds(map);
      });

      const emit = () => {
        emitBounds(map);
        renderMarkers(maplibregl);
      };
      map.on("moveend", emit);
      map.on("zoomend", emit);
    })();
    return () => {
      cancelled = true;
      markersRef.current.forEach((m) => m.remove());
      markersRef.current.clear();
      clusterMarkersRef.current.forEach((m) => m.remove());
      clusterMarkersRef.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // re-render markers when listings change
  useEffect(() => {
    if (!mapRef.current) return;
    (async () => {
      const maplibregl = (await import("maplibre-gl")).default;
      renderMarkers(maplibregl);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listings, priceStats]);

  // Refit viewport whenever the caller's filter signature changes.
  useEffect(() => {
    if (!mapRef.current || fitKey === undefined) return;
    fitToListings(mapRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);

  // Ease to an external target (geocoded query) and drop a soft pin.
  useEffect(() => {
    if (!mapRef.current) return;
    (async () => {
      const maplibregl = (await import("maplibre-gl")).default;
      const map = mapRef.current;
      if (flyMarkerRef.current) {
        flyMarkerRef.current.remove();
        flyMarkerRef.current = null;
      }
      const ensureLayers = () => {
        if (!map.getSource("nestly-radius")) {
          map.addSource("nestly-radius", {
            type: "geojson",
            data: { type: "FeatureCollection", features: [] },
          });
          map.addLayer({
            id: "nestly-radius-fill",
            type: "fill",
            source: "nestly-radius",
            paint: { "fill-color": "#7e22ce", "fill-opacity": 0.08 },
          });
          map.addLayer({
            id: "nestly-radius-line",
            type: "line",
            source: "nestly-radius",
            paint: {
              "line-color": "#7e22ce",
              "line-width": 1.5,
              "line-opacity": 0.55,
              "line-dasharray": [2, 2],
            },
          });
        }
      };
      if (!flyTo) {
        if (map.getSource("nestly-radius")) {
          (map.getSource("nestly-radius") as any).setData({
            type: "FeatureCollection",
            features: [],
          });
        }
        return;
      }
      ensureLayers();
      // Build a 64-point polygon approximating a geodesic circle.
      const coords: [number, number][] = [];
      const steps = 64;
      const latRad = (flyTo.lat * Math.PI) / 180;
      const kmPerDegLat = 110.574;
      const kmPerDegLng = 111.32 * Math.cos(latRad);
      for (let i = 0; i <= steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        const dx = (radiusKm * Math.cos(a)) / kmPerDegLng;
        const dy = (radiusKm * Math.sin(a)) / kmPerDegLat;
        coords.push([flyTo.lng + dx, flyTo.lat + dy]);
      }
      (map.getSource("nestly-radius") as any).setData({
        type: "Feature",
        properties: {},
        geometry: { type: "Polygon", coordinates: [coords] },
      });
      map.easeTo({ center: [flyTo.lng, flyTo.lat], zoom: flyTo.zoom ?? 14.5, duration: 700 });
      const el = document.createElement("div");
      el.className = "nestly-pin nestly-pin--target";
      el.setAttribute("aria-label", flyTo.label ?? "Search location");
      if (flyTo.label) {
        const label = document.createElement("span");
        label.className = "nestly-pin__label";
        label.textContent = flyTo.label;
        el.appendChild(label);
      }
      flyMarkerRef.current = new maplibregl.Marker({ element: el, anchor: "center" })
        .setLngLat([flyTo.lng, flyTo.lat])
        .addTo(map);
    })();
  }, [flyTo?.lat, flyTo?.lng, flyTo?.zoom, flyTo?.label, radiusKm]);

  // reflect hoveredId
  useEffect(() => {
    markersRef.current.forEach((marker, id) => {
      const el = marker.getElement() as HTMLElement;
      if (id === hoveredId) {
        el.dataset.hover = "true";
        el.style.zIndex = "5";
      } else {
        delete el.dataset.hover;
        el.style.zIndex = "1";
      }
    });
    // Intentionally do not recenter the map on hover/select — keeps the
    // viewport stable so clicking a pin never yanks the map.
  }, [hoveredId]);

  // Reflect proximity: near markers stand out, far ones dim.
  useEffect(() => {
    markersRef.current.forEach((marker, id) => {
      const el = marker.getElement() as HTMLElement;
      if (!nearIds || nearIds.size === 0) {
        delete el.dataset.near;
        delete el.dataset.far;
      } else if (nearIds.has(id)) {
        el.dataset.near = "true";
        delete el.dataset.far;
      } else {
        el.dataset.far = "true";
        delete el.dataset.near;
      }
    });
  }, [nearIds, listings]);

  function renderMarkers(maplibregl: any) {
    const map = mapRef.current;
    const index = superRef.current;
    if (!map || !index) return;

    const b = map.getBounds();
    const bbox: [number, number, number, number] = [
      b.getWest(),
      b.getSouth(),
      b.getEast(),
      b.getNorth(),
    ];
    const zoom = Math.floor(map.getZoom());
    const features = index.getClusters(bbox, zoom);

    // Recreate cluster bubbles each pass (small count, cheap).
    clusterMarkersRef.current.forEach((m) => m.remove());
    clusterMarkersRef.current = [];

    const seen = new Set<string>();
    for (const f of features) {
      const [lng, lat] = f.geometry.coordinates as [number, number];
      const props = f.properties as any;

      if (props.cluster) {
        const count = props.point_count as number;
        const el = document.createElement("button");
        el.type = "button";
        el.className = "nestly-pin nestly-pin--cluster";
        el.textContent = props.point_count_abbreviated ?? String(count);
        el.setAttribute("aria-label", `${count} homes in this area`);
        const size = Math.min(60, 30 + Math.round(Math.log2(count) * 6));
        el.style.width = `${size}px`;
        el.style.height = `${size}px`;
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          const clusterId = props.cluster_id as number;
          const targetZoom = Math.min(index.getClusterExpansionZoom(clusterId), 18);
          map.easeTo({ center: [lng, lat], zoom: targetZoom, duration: 450 });
        });
        const marker = new maplibregl.Marker({ element: el, anchor: "center" })
          .setLngLat([lng, lat])
          .addTo(map);
        clusterMarkersRef.current.push(marker);
        continue;
      }

      const l: GeoListing = props.listing;
      seen.add(l.id);
      const existing = markersRef.current.get(l.id);
      if (existing) {
        // Recolor in place when the price scale shifts (new bounds/filters).
        if (variant !== "dot") applyPriceColor(existing.getElement(), l);
        continue;
      }
      const el = document.createElement("button");
      el.type = "button";
      el.className = variant === "dot" ? "nestly-pin nestly-pin--dot" : "nestly-pin";
      el.textContent = variant === "dot" ? "" : shortPrice(l.price, l.listingType === "rent");
      if (variant === "dot") el.setAttribute("aria-label", l.title);
      else applyPriceColor(el, l);
      el.addEventListener("mouseenter", () => onHover(l.id));
      el.addEventListener("mouseleave", () => onHover(null));
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        onSelect?.(l.id);
      });
      const marker = new maplibregl.Marker({ element: el, anchor: "bottom" })
        .setLngLat([l.lng, l.lat])
        .addTo(map);
      markersRef.current.set(l.id, marker);
    }
    // Remove markers no longer visible / now inside a cluster.
    for (const [id, m] of markersRef.current) {
      if (!seen.has(id)) {
        m.remove();
        markersRef.current.delete(id);
      }
    }
  }

  function applyPriceColor(el: HTMLElement, l: GeoListing) {
    const { min, max } = priceStatsRef.current[l.listingType] ?? { min: 0, max: 1 };
    const t = Math.max(0, Math.min(1, (l.price - min) / (max - min)));
    el.style.setProperty("--pin-dot", priceRamp(t));
  }

  function fitToListings(map: any) {
    if (!map || listingsRef.current.length === 0) return;
    // simple bounds
    let minLat = 90,
      maxLat = -90,
      minLng = 180,
      maxLng = -180;
    for (const l of listingsRef.current) {
      if (l.lat < minLat) minLat = l.lat;
      if (l.lat > maxLat) maxLat = l.lat;
      if (l.lng < minLng) minLng = l.lng;
      if (l.lng > maxLng) maxLng = l.lng;
    }
    map.fitBounds(
      [
        [minLng, minLat],
        [maxLng, maxLat],
      ],
      { padding: 60, duration: 400, maxZoom: 14 },
    );
  }

  function emitBounds(map: any) {
    const cb = onBoundsChangeRef.current;
    if (!cb || !map) return;
    const b = map.getBounds();
    cb({ west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() });
  }

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" aria-label="Map of listings" />
      {variant !== "dot" && interactive && listings.length > 0 && (
        <div className="pointer-events-none absolute bottom-4 right-3 z-10 rounded-full border border-ink/10 bg-card/95 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-ink shadow-tactile backdrop-blur">
          <div className="flex items-center gap-2">
            <span>Cheaper</span>
            <span
              className="h-1.5 w-24 rounded-full"
              style={{
                background:
                  "linear-gradient(to right, hsl(145 55% 45%), hsl(45 92% 52%), hsl(8 78% 50%))",
              }}
            />
            <span>Pricier</span>
          </div>
        </div>
      )}
    </div>
  );
}

function shortPrice(n: number, isRent: boolean): string {
  if (isRent) {
    if (n >= 1000) return `₹${Math.round(n / 100) / 10}k`;
    return `₹${n}`;
  }
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(1)}Cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  return formatMoney(n);
}

// Green (cheap) → amber (mid) → red (expensive) heatmap ramp.
function priceRamp(t: number): string {
  // Perceptually-uniform stops in HSL: 145° green, 45° amber, 8° red.
  const stops = [
    { h: 145, s: 55, l: 45 }, // affordable
    { h: 45, s: 92, l: 52 }, // mid
    { h: 8, s: 78, l: 50 }, // premium
  ];
  const seg = t < 0.5 ? 0 : 1;
  const localT = t < 0.5 ? t / 0.5 : (t - 0.5) / 0.5;
  const a = stops[seg];
  const b = stops[seg + 1];
  const h = a.h + (b.h - a.h) * localT;
  const s = a.s + (b.s - a.s) * localT;
  const l = a.l + (b.l - a.l) * localT;
  return `hsl(${h} ${s}% ${l}%)`;
}
