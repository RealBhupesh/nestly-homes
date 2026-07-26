import { Link, useRouterState } from "@tanstack/react-router";
import { clearCompare, removeCompare, useCompareIds } from "@/lib/compare-store";
import { getListingById } from "@/lib/listings-data";

export function CompareTray() {
  const ids = useCompareIds();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // Hide on the compare page itself and on auth screens.
  if (pathname.startsWith("/compare") || pathname.startsWith("/auth")) return null;
  if (ids.length === 0) return null;

  const items = ids
    .map((id) => getListingById(id))
    .filter((l): l is NonNullable<ReturnType<typeof getListingById>> => Boolean(l));

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
      <div className="pointer-events-auto flex w-full max-w-3xl items-center gap-3 rounded-2xl border border-border/70 bg-card/95 p-2.5 pl-4 shadow-lift backdrop-blur-md">
        <div className="hidden text-[11px] font-semibold uppercase tracking-wider text-ink/60 sm:block">
          Compare
          <span className="ml-1 text-ink">{ids.length}</span>
        </div>
        <ul className="flex flex-1 items-center gap-2 overflow-x-auto">
          {items.map((l) => (
            <li key={l.id} className="group relative shrink-0">
              <img
                src={l.photo.replace("w=1200", "w=160")}
                alt={l.title}
                loading="lazy"
                className="h-11 w-14 rounded-lg object-cover ring-1 ring-border"
              />
              <button
                type="button"
                onClick={() => removeCompare(l.id)}
                aria-label={`Remove ${l.title}`}
                className="absolute -right-1.5 -top-1.5 grid h-4 w-4 place-items-center rounded-full bg-ink text-[10px] text-cream shadow-tactile transition hover:scale-110"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={clearCompare}
          className="hidden rounded-full px-3 py-1.5 text-xs font-medium text-ink/60 transition hover:text-ink sm:inline-flex"
        >
          Clear
        </button>
        {items.length < 2 ? (
          <span
            aria-disabled="true"
            title="Add at least 2 to compare"
            className="inline-flex items-center gap-1.5 rounded-full bg-muted px-4 py-2 text-sm font-semibold text-ink/40"
          >
            Compare
          </span>
        ) : (
          <Link
            to="/compare"
            className="inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-sm font-semibold text-cream shadow-tactile transition hover:-translate-y-0.5 hover:shadow-lift"
          >
            Compare
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 6 6 6-6 6"/></svg>
          </Link>
        )}
      </div>
    </div>
  );
}