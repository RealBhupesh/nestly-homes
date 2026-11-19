import { useVirtualizer, useWindowVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useRef, useState } from "react";
import { ListingCard } from "./ListingCard";
import type { Listing } from "@/lib/listings-data";

type Props = {
  listings: Listing[];
  hoveredId: string | null;
  onHover: (id: string | null) => void;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  /** Scroll parent element ref. Omit to virtualize against the window. */
  scrollRef?: React.RefObject<HTMLElement | null>;
  /** Optional per-listing distance (km) to show on cards, e.g. to a searched place. */
  distances?: Map<string, number> | null;
  distanceLabel?: string;
};

/**
 * Window-virtualized responsive grid. Renders only the rows in view,
 * so scrolling stays smooth even with hundreds of cards.
 */
export function VirtualListingGrid({
  listings,
  hoveredId,
  onHover,
  selectedId,
  onSelect,
  scrollRef,
  distances,
  distanceLabel,
}: Props) {
  const parentRef = useRef<HTMLDivElement | null>(null);
  const [cols, setCols] = useState(2);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(min-width: 640px)");
    const update = () => setCols(mq.matches ? 2 : 1);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const rowCount = Math.ceil(listings.length / cols);
  const useElementVirtualizer = Boolean(scrollRef);
  // Two virtualizers created but only one is active per usage. Hook order is stable.
  const windowV = useWindowVirtualizer({
    count: rowCount,
    estimateSize: () => 420,
    overscan: 4,
    scrollMargin: parentRef.current?.offsetTop ?? 0,
  });
  const elementV = useVirtualizer({
    count: rowCount,
    getScrollElement: () => (scrollRef?.current ?? null) as HTMLElement | null,
    estimateSize: () => 420,
    overscan: 4,
  });
  const rowVirtualizer = useElementVirtualizer ? elementV : windowV;
  const scrollMargin = useElementVirtualizer ? 0 : (windowV.options.scrollMargin ?? 0);

  // Scroll the selected row into view when selection changes from outside (e.g. map marker click).
  useEffect(() => {
    if (!selectedId) return;
    const idx = listings.findIndex((l) => l.id === selectedId);
    if (idx < 0) return;
    const row = Math.floor(idx / cols);
    rowVirtualizer.scrollToIndex(row, { align: "center", behavior: "smooth" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, cols]);

  return (
    <div ref={parentRef} className="relative w-full">
      <div style={{ height: `${rowVirtualizer.getTotalSize()}px` }} className="relative w-full">
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const start = virtualRow.index * cols;
          const rowItems = listings.slice(start, start + cols);
          return (
            <div
              key={virtualRow.key}
              ref={rowVirtualizer.measureElement}
              data-index={virtualRow.index}
              className="absolute left-0 right-0 grid gap-5 sm:grid-cols-2"
              style={{
                transform: `translateY(${virtualRow.start - scrollMargin}px)`,
                paddingBottom: 20,
              }}
            >
              {rowItems.map((l) => (
                <div
                  key={l.id}
                  onMouseEnter={() => onHover(l.id)}
                  onMouseLeave={() => onHover(null)}
                  onFocus={() => onHover(l.id)}
                  onBlur={() => onHover(null)}
                  onPointerDown={() => onSelect?.(l.id)}
                  className={`rounded-3xl transition ${
                    selectedId === l.id
                      ? "-translate-y-0.5 ring-2 ring-ink shadow-lift"
                      : hoveredId === l.id
                        ? "-translate-y-0.5 ring-2 ring-primary/60"
                        : ""
                  }`}
                >
                  <ListingCard
                    listing={l}
                    distanceKm={distances?.get(l.id) ?? null}
                    distanceLabel={distanceLabel}
                  />
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
