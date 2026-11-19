import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Bookmark, Trash2, ArrowUpRight, Loader2, Bell } from "lucide-react";
import { toast } from "sonner";
import {
  listSavedSearches,
  deleteSavedSearch,
  touchSavedSearch,
  setSavedSearchAlert,
  type AlertFrequency,
  type SavedSearchRow,
} from "@/lib/saved-searches.functions";
import { useQuery } from "@tanstack/react-query";
import { searchListings } from "@/lib/public-listings.functions";
import {
  PROPERTY_TYPE_LABEL,
  parsePropertyTypes,
  searchParamsToFilters,
} from "@/lib/listings-data";

export const Route = createFileRoute("/_authenticated/dashboard/saved")({
  component: SavedPage,
});

function SavedPage() {
  const list = useServerFn(listSavedSearches);
  const del = useServerFn(deleteSavedSearch);
  const touch = useServerFn(touchSavedSearch);
  const setAlert = useServerFn(setSavedSearchAlert);
  const [rows, setRows] = useState<SavedSearchRow[] | null>(null);
  const navigate = useNavigate();

  async function load() {
    try {
      setRows(await list());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function open(r: SavedSearchRow) {
    try {
      await touch({ data: { id: r.id } });
    } catch {
      // best-effort "last viewed" bump; navigate regardless
    }
    navigate({ to: "/search", search: { ...r.params } as never });
  }

  async function remove(r: SavedSearchRow) {
    if (!confirm(`Delete "${r.name}"?`)) return;
    try {
      await del({ data: { id: r.id } });
      setRows((prev) => prev?.filter((x) => x.id !== r.id) ?? null);
      toast.success("Deleted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }

  async function changeAlert(r: SavedSearchRow, frequency: AlertFrequency) {
    const prev = r.alert_frequency;
    setRows(
      (rs) => rs?.map((x) => (x.id === r.id ? { ...x, alert_frequency: frequency } : x)) ?? null,
    );
    try {
      await setAlert({ data: { id: r.id, frequency } });
      toast.success(
        frequency === "off"
          ? "Alerts off"
          : frequency === "instant"
            ? "Instant alerts on"
            : "Daily digest on",
      );
    } catch (e) {
      setRows(
        (rs) => rs?.map((x) => (x.id === r.id ? { ...x, alert_frequency: prev } : x)) ?? null,
      );
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }

  return (
    <div className="space-y-8 sm:space-y-12">
      <div className="border-b border-border/70 pb-6 sm:pb-8">
        <p className="text-[11px] tracking-wide text-ink/50">Watchlist</p>
        <h1 className="mt-2 text-2xl font-medium tracking-tight text-ink sm:text-4xl">
          Saved searches
        </h1>
        <p className="mt-2 max-w-lg text-[13px] text-ink/55">
          Pin the filter combos you keep re-typing. We'll flag any homes that appeared since you
          last checked.
        </p>
      </div>

      {rows === null && <p className="py-10 text-center text-sm text-ink/40">Loading…</p>}

      {rows && rows.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-16 text-center">
          <div className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-muted text-ink/60">
            <Bookmark className="h-4 w-4" />
          </div>
          <p className="mt-4 text-base text-ink">Nothing saved yet.</p>
          <p className="mt-1 text-sm text-ink/55">Run a search and tap "Save search" to add one.</p>
          <button
            onClick={() => navigate({ to: "/search" })}
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-[13px] font-medium text-background hover:bg-ink/85"
          >
            Browse homes <ArrowUpRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <ul className="divide-y divide-border/70">
        {rows?.map((r) => {
          return (
            <li key={r.id} className="group py-5">
              <div className="flex items-start gap-4">
                <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-muted text-ink/60">
                  <Bookmark className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-[15px] font-medium text-ink">{r.name}</h3>
                    <NewBadge r={r} />
                  </div>
                  <p className="mt-1 truncate text-[12px] text-ink/55">
                    {summarize(r)} · <MatchCount r={r} />
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-ink/40">
                      <Bell className="h-3 w-3" /> Alerts
                    </span>
                    <div className="inline-flex rounded-full border border-border bg-card p-0.5">
                      {(["off", "instant", "daily"] as const).map((f) => (
                        <button
                          key={f}
                          type="button"
                          onClick={() => changeAlert(r, f)}
                          className={`rounded-full px-2.5 py-1 text-[11px] font-medium capitalize transition ${
                            r.alert_frequency === f
                              ? "bg-ink text-background"
                              : "text-ink/55 hover:text-ink"
                          }`}
                        >
                          {f}
                        </button>
                      ))}
                    </div>
                    {r.last_notified_at && (
                      <span className="text-[11px] text-ink/45">
                        Last alert {new Date(r.last_notified_at).toLocaleDateString()}
                        {r.last_match_count > 0 ? ` · ${r.last_match_count} new` : ""}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => open(r)}
                    className="rounded-full bg-ink px-3.5 py-1.5 text-[12px] font-medium text-background hover:bg-ink/85"
                  >
                    Open
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(r)}
                    aria-label="Delete"
                    className="rounded-md p-1.5 text-ink/50 hover:bg-muted hover:text-red-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function useMatchCount(r: SavedSearchRow, postedAfter?: string) {
  const search = useServerFn(searchListings);
  return useQuery({
    queryKey: ["saved-search-count", r.id, JSON.stringify(r.params), postedAfter ?? null],
    queryFn: async () => {
      const filters = searchParamsToFilters(r.params);
      const res = await search({ data: { ...filters, postedAfter, limit: 1, offset: 0 } });
      return res.total;
    },
    staleTime: 60_000,
    retry: 1,
  });
}

function MatchCount({ r }: { r: SavedSearchRow }) {
  const { data, isLoading, isError } = useMatchCount(r);
  if (isLoading) return <Loader2 className="inline h-3 w-3 animate-spin align-[-2px]" />;
  if (isError || data == null) return <span>match count unavailable</span>;
  return (
    <span>
      {data} match{data === 1 ? "" : "es"}
    </span>
  );
}

function NewBadge({ r }: { r: SavedSearchRow }) {
  const { data } = useMatchCount(r, new Date(r.last_seen_at).toISOString());
  if (!data) return null;
  return (
    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
      {data} new
    </span>
  );
}

function summarize(r: SavedSearchRow): string {
  const p = r.params;
  const parts: string[] = [p.mode === "sale" ? "Sale" : "Rent"];
  const types = parsePropertyTypes(p.type);
  if (types.length) parts.push(types.map((t) => PROPERTY_TYPE_LABEL[t]).join("/"));
  if (p.q) parts.push(`"${p.q}"`);
  if (p.max && p.max > 0) parts.push(`≤ ₹${p.max.toLocaleString("en-IN")}`);
  if (p.furn && p.furn !== "any") parts.push(p.furn);
  return parts.join(" · ");
}
