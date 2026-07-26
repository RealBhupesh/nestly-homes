import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  listAllListings,
  setListingStatus,
  deleteListingAdmin,
  bulkSetListingStatus,
  bulkDeleteListings,
  setListingFeatured,
  bulkSetListingFeatured,
} from "@/lib/admin.functions";
import { toCSV, downloadCSV } from "@/lib/csv";
import {
  Trash2,
  ExternalLink,
  X,
  Download,
  Search,
  SlidersHorizontal,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Star,
  StarOff,
} from "lucide-react";
import { useRealtimeRefresh } from "@/hooks/use-realtime-refresh";
import { LiveIndicator } from "@/components/nestly/LiveIndicator";

export const Route = createFileRoute("/_authenticated/admin/listings")({
  component: AdminListings,
});

type Row = Awaited<ReturnType<typeof listAllListings>>[number];
type SortKey = "title" | "city" | "price_amount" | "status" | "updated_at" | "is_featured";
type SortDir = "asc" | "desc";

const STATUS_META: Record<string, { label: string; dot: string; text: string }> = {
  published: { label: "Live", dot: "bg-emerald-500", text: "text-emerald-700" },
  draft: { label: "Draft", dot: "bg-amber-500", text: "text-amber-700" },
  archived: { label: "Archived", dot: "bg-zinc-400", text: "text-zinc-600" },
};

function useDebounced<T>(value: T, delay = 250) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

function AdminListings() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [status, setStatus] = useState<"all" | "draft" | "published" | "archived">("all");
  const [q, setQ] = useState("");
  const dq = useDebounced(q, 300);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // advanced filters
  const [showFilters, setShowFilters] = useState(false);
  const [mode, setMode] = useState<"all" | "rent" | "sale">("all");
  const [propType, setPropType] = useState<string>("all");
  const [minPrice, setMinPrice] = useState<string>("");
  const [maxPrice, setMaxPrice] = useState<string>("");
  const [featuredOnly, setFeaturedOnly] = useState(false);

  // sorting
  const [sortKey, setSortKey] = useState<SortKey>("updated_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  async function load() {
    setRows(null);
    setSelected(new Set());
    try {
      const data = await listAllListings({ data: { status, q: "" } });
      setRows(data);
      setLastUpdated(new Date());
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  useRealtimeRefresh(["listings"], load, { channelName: "admin-listings" });

  const propertyTypes = useMemo(() => {
    const s = new Set<string>();
    rows?.forEach((r: any) => r.property_type && s.add(r.property_type));
    return Array.from(s).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    if (!rows) return null;
    const term = dq.trim().toLowerCase();
    const min = minPrice ? Number(minPrice) : null;
    const max = maxPrice ? Number(maxPrice) : null;
    let out = rows.filter((r: any) => {
      if (term) {
        const hay = `${r.title ?? ""} ${r.city ?? ""}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      if (mode !== "all" && r.mode !== mode) return false;
      if (propType !== "all" && r.property_type !== propType) return false;
      if (min !== null && Number(r.price_amount) < min) return false;
      if (max !== null && Number(r.price_amount) > max) return false;
      if (featuredOnly && !r.is_featured) return false;
      return true;
    });
    const dir = sortDir === "asc" ? 1 : -1;
    out = [...out].sort((a: any, b: any) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      if (typeof av === "boolean") return (Number(av) - Number(bv)) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
    return out;
  }, [rows, dq, mode, propType, minPrice, maxPrice, featuredOnly, sortKey, sortDir]);

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir(k === "updated_at" || k === "price_amount" || k === "is_featured" ? "desc" : "asc");
    }
  }

  async function changeStatus(id: string, next: "draft" | "published" | "archived") {
    try {
      await setListingStatus({ data: { id, status: next } });
      toast.success(`Marked ${next}`);
      setRows((r) => r?.map((x) => (x.id === id ? { ...x, status: next } : x)) ?? null);
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function toggleFeatured(id: string, curr: boolean) {
    try {
      await setListingFeatured({ data: { id, featured: !curr } });
      setRows((r) => r?.map((x: any) => (x.id === id ? { ...x, is_featured: !curr } : x)) ?? null);
      toast.success(!curr ? "Featured" : "Unfeatured");
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this listing permanently?")) return;
    try {
      await deleteListingAdmin({ data: { id } });
      setRows((r) => r?.filter((x) => x.id !== id) ?? null);
      setSelected((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
      toast.success("Deleted");
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  const visibleIds = useMemo(() => filtered?.map((r) => r.id) ?? [], [filtered]);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const someSelected = selected.size > 0 && !allSelected;

  function toggleOne(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function toggleAll() {
    setSelected((s) => {
      if (allSelected) {
        const n = new Set(s);
        visibleIds.forEach((id) => n.delete(id));
        return n;
      }
      const n = new Set(s);
      visibleIds.forEach((id) => n.add(id));
      return n;
    });
  }

  async function bulkStatus(next: "draft" | "published" | "archived") {
    const ids = Array.from(selected);
    if (!ids.length) return;
    setBusy(true);
    try {
      await bulkSetListingStatus({ data: { ids, status: next } });
      setRows((r) => r?.map((x) => (selected.has(x.id) ? { ...x, status: next } : x)) ?? null);
      toast.success(`Marked ${ids.length} ${next}`);
      setSelected(new Set());
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function bulkFeature(next: boolean) {
    const ids = Array.from(selected);
    if (!ids.length) return;
    setBusy(true);
    try {
      await bulkSetListingFeatured({ data: { ids, featured: next } });
      setRows((r) => r?.map((x: any) => (selected.has(x.id) ? { ...x, is_featured: next } : x)) ?? null);
      toast.success(`${next ? "Featured" : "Unfeatured"} ${ids.length}`);
      setSelected(new Set());
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function bulkDelete() {
    const ids = Array.from(selected);
    if (!ids.length) return;
    if (!confirm(`Delete ${ids.length} listing${ids.length === 1 ? "" : "s"} permanently?`)) return;
    setBusy(true);
    try {
      await bulkDeleteListings({ data: { ids } });
      const s = new Set(ids);
      setRows((r) => r?.filter((x) => !s.has(x.id)) ?? null);
      toast.success(`Deleted ${ids.length}`);
      setSelected(new Set());
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  function clearFilters() {
    setMode("all");
    setPropType("all");
    setMinPrice("");
    setMaxPrice("");
    setFeaturedOnly(false);
    setQ("");
  }

  const activeAdvCount =
    (mode !== "all" ? 1 : 0) +
    (propType !== "all" ? 1 : 0) +
    (minPrice ? 1 : 0) +
    (maxPrice ? 1 : 0) +
    (featuredOnly ? 1 : 0);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.2em] text-ink/45">Moderation</p>
          <h1 className="mt-1 text-2xl font-medium tracking-tight text-ink sm:text-3xl">All listings</h1>
          <p className="mt-1 text-[13px] text-ink/55">
            {filtered ? `${filtered.length} of ${rows?.length ?? 0}` : "Loading…"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <LiveIndicator lastUpdated={lastUpdated} />
          <button
            onClick={() =>
              filtered &&
              downloadCSV(
                `listings-${Date.now()}.csv`,
                toCSV(
                  filtered.map((r: any) => ({
                    id: r.id,
                    title: r.title,
                    status: r.status,
                    mode: r.mode,
                    property_type: r.property_type,
                    city: r.city,
                    price: r.price_amount,
                    featured: r.is_featured,
                    updated_at: r.updated_at,
                  })),
                  ["id", "title", "status", "mode", "property_type", "city", "price", "featured", "updated_at"],
                )
              )
            }
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border/70 px-3 text-[12px] text-ink hover:bg-muted"
          >
            <Download className="h-3.5 w-3.5" /> Export
          </button>
        </div>
      </header>

      {/* Controls bar */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full min-w-0 sm:flex-1 sm:min-w-[240px] sm:max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink/45" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search title or city…"
              className="h-9 w-full rounded-full border border-border/70 bg-background pl-9 pr-9 text-[13px] outline-none focus:border-ink"
            />
            {q && (
              <button
                onClick={() => setQ("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-ink/50 hover:bg-muted hover:text-ink"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="inline-flex overflow-x-auto rounded-full border border-border/70 bg-background text-[12px] scrollbar-hide max-w-full">
            {(["all", "published", "draft", "archived"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatus(s)}
                className={`h-9 shrink-0 px-3 capitalize transition ${
                  status === s ? "bg-ink text-background" : "text-ink/70 hover:bg-muted"
                }`}
              >
                {s === "all" ? "All" : s}
              </button>
            ))}
          </div>

          <button
            onClick={() => setShowFilters((v) => !v)}
            className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-[12px] transition ${
              showFilters || activeAdvCount > 0
                ? "border-ink bg-ink text-background"
                : "border-border/70 text-ink hover:bg-muted"
            }`}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Filters
            {activeAdvCount > 0 && (
              <span className="ml-1 rounded-full bg-background/20 px-1.5 text-[10px] font-medium">
                {activeAdvCount}
              </span>
            )}
          </button>

          {(activeAdvCount > 0 || q) && (
            <button
              onClick={clearFilters}
              className="h-9 rounded-full px-3 text-[12px] text-ink/60 hover:text-ink"
            >
              Clear
            </button>
          )}
        </div>

        {showFilters && (
          <div className="grid grid-cols-1 gap-3 rounded-2xl border border-border/70 bg-card p-4 sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <label className="mb-1 block text-[11px] uppercase tracking-wider text-ink/50">Mode</label>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as any)}
                className="h-9 w-full rounded-full border border-border/70 bg-background px-3 text-[13px] outline-none focus:border-ink"
              >
                <option value="all">All</option>
                <option value="rent">Rent</option>
                <option value="sale">Sale</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] uppercase tracking-wider text-ink/50">Property type</label>
              <select
                value={propType}
                onChange={(e) => setPropType(e.target.value)}
                className="h-9 w-full rounded-full border border-border/70 bg-background px-3 text-[13px] outline-none focus:border-ink"
              >
                <option value="all">All</option>
                {propertyTypes.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] uppercase tracking-wider text-ink/50">Min price (₹)</label>
              <input
                inputMode="numeric"
                value={minPrice}
                onChange={(e) => setMinPrice(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder="0"
                className="h-9 w-full rounded-full border border-border/70 bg-background px-3 text-[13px] outline-none focus:border-ink"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] uppercase tracking-wider text-ink/50">Max price (₹)</label>
              <input
                inputMode="numeric"
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder="Any"
                className="h-9 w-full rounded-full border border-border/70 bg-background px-3 text-[13px] outline-none focus:border-ink"
              />
            </div>
            <div className="flex items-end">
              <label className="inline-flex h-9 w-full cursor-pointer items-center gap-2 rounded-full border border-border/70 bg-background px-3 text-[13px]">
                <input
                  type="checkbox"
                  checked={featuredOnly}
                  onChange={(e) => setFeaturedOnly(e.target.checked)}
                  className="h-4 w-4 accent-ink"
                />
                Featured only
              </label>
            </div>
          </div>
        )}
      </div>

      {/* Mobile: card list */}
      <ul className="grid gap-3 md:hidden">
        {rows === null && (
          <li className="rounded-2xl border border-border/70 bg-card px-4 py-8 text-center text-[13px] text-ink/50">
            Loading…
          </li>
        )}
        {rows !== null && filtered?.length === 0 && (
          <li className="rounded-2xl border border-dashed border-border/70 bg-card px-4 py-8 text-center text-[13px] text-ink/50">
            No listings match these filters.
          </li>
        )}
        {filtered?.map((r: any) => {
          const meta = STATUS_META[r.status] ?? STATUS_META.draft;
          const isSel = selected.has(r.id);
          return (
            <li
              key={r.id}
              className={`rounded-2xl border bg-card p-3 shadow-sm transition ${
                isSel ? "border-ink" : "border-border/70"
              }`}
            >
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  aria-label={`Select ${r.title}`}
                  checked={isSel}
                  onChange={() => toggleOne(r.id)}
                  className="mt-1 h-4 w-4 shrink-0 accent-ink"
                />
                <div className="h-14 w-20 shrink-0 overflow-hidden rounded-lg bg-muted">
                  {r.cover_photo_url && (
                    <img src={r.cover_photo_url} alt="" className="h-full w-full object-cover" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="truncate text-[13.5px] font-medium text-ink">{r.title}</p>
                    <button
                      onClick={() => toggleFeatured(r.id, !!r.is_featured)}
                      className={`shrink-0 rounded-full p-1 ${
                        r.is_featured ? "text-amber-500" : "text-ink/30 hover:text-ink"
                      }`}
                      aria-label={r.is_featured ? "Unfeature" : "Feature"}
                    >
                      <Star className={`h-4 w-4 ${r.is_featured ? "fill-current" : ""}`} />
                    </button>
                  </div>
                  <p className="mt-0.5 truncate text-[11.5px] text-ink/55 capitalize">
                    {r.city} · {r.mode}
                    {r.property_type ? ` · ${r.property_type}` : ""}
                  </p>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="tabular text-[13px] font-medium text-ink/85">
                      ₹{Number(r.price_amount).toLocaleString("en-IN")}
                    </span>
                    <span className={`inline-flex items-center gap-1.5 text-[11px] ${meta.text}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                      {meta.label}
                    </span>
                  </div>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-1.5 border-t border-border/60 pt-2">
                <select
                  value={r.status}
                  onChange={(e) => changeStatus(r.id, e.target.value as any)}
                  className="h-8 flex-1 rounded-full border border-border/70 bg-background px-2 text-[12px] outline-none focus:border-ink"
                >
                  <option value="published">Published</option>
                  <option value="draft">Draft</option>
                  <option value="archived">Archived</option>
                </select>
                <Link
                  to="/listing/$id"
                  params={{ id: r.id }}
                  className="grid h-8 w-8 place-items-center rounded-full text-ink/60 hover:bg-muted hover:text-ink"
                  aria-label="Open"
                >
                  <ExternalLink className="h-4 w-4" />
                </Link>
                <button
                  onClick={() => remove(r.id)}
                  className="grid h-8 w-8 place-items-center rounded-full text-ink/50 hover:bg-red-50 hover:text-red-600"
                  aria-label="Delete"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {/* Desktop: table */}
      <div className="hidden md:block overflow-x-auto rounded-2xl border border-border/70 bg-card">
        <table className="w-full text-[13px]">
          <thead className="border-b border-border/70 text-left text-[11px] uppercase tracking-wider text-ink/50">
            <tr>
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  aria-label="Select all"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected;
                  }}
                  onChange={toggleAll}
                  className="h-4 w-4 accent-ink"
                />
              </th>
              <SortableTh label="Listing" k="title" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
              <SortableTh label="Location" k="city" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
              <SortableTh label="Price" k="price_amount" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" />
              <SortableTh label="Status" k="status" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
              <SortableTh label="Feat." k="is_featured" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="center" />
              <SortableTh label="Updated" k="updated_at" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border/70">
            {rows === null && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-ink/50">
                  Loading…
                </td>
              </tr>
            )}
            {rows !== null && filtered?.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-ink/50">
                  No listings match these filters.
                </td>
              </tr>
            )}
            {filtered?.map((r: any) => {
              const meta = STATUS_META[r.status] ?? STATUS_META.draft;
              return (
                <tr key={r.id} className={`align-middle ${selected.has(r.id) ? "bg-muted/50" : ""}`}>
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      aria-label={`Select ${r.title}`}
                      checked={selected.has(r.id)}
                      onChange={() => toggleOne(r.id)}
                      className="h-4 w-4 accent-ink"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-14 shrink-0 overflow-hidden rounded-md bg-muted">
                        {r.cover_photo_url && (
                          <img src={r.cover_photo_url} alt="" className="h-full w-full object-cover" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-medium text-ink">{r.title}</p>
                        <p className="text-[11px] text-ink/50 capitalize">
                          {r.mode}
                          {r.property_type ? ` · ${r.property_type}` : ""}
                          {r.bedrooms ? ` · ${r.bedrooms} BR` : ""}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-ink/70">{r.city}</td>
                  <td className="px-4 py-3 text-right font-medium text-ink/80">
                    ₹{Number(r.price_amount).toLocaleString("en-IN")}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className={`inline-block h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                      <select
                        value={r.status}
                        onChange={(e) => changeStatus(r.id, e.target.value as any)}
                        className={`h-8 rounded-full border border-border/70 bg-background px-2 text-[12px] outline-none focus:border-ink ${meta.text}`}
                      >
                        <option value="published">Published</option>
                        <option value="draft">Draft</option>
                        <option value="archived">Archived</option>
                      </select>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => toggleFeatured(r.id, !!r.is_featured)}
                      className={`inline-flex h-8 w-8 items-center justify-center rounded-full transition ${
                        r.is_featured
                          ? "bg-amber-100 text-amber-600 hover:bg-amber-200"
                          : "text-ink/40 hover:bg-muted hover:text-ink"
                      }`}
                      aria-label={r.is_featured ? "Unfeature" : "Feature"}
                      title={r.is_featured ? "Featured" : "Not featured"}
                    >
                      <Star className={`h-4 w-4 ${r.is_featured ? "fill-current" : ""}`} />
                    </button>
                  </td>
                  <td className="px-4 py-3 text-[12px] text-ink/60">
                    {new Date(r.updated_at).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2 text-ink/60">
                      <Link
                        to="/listing/$id"
                        params={{ id: r.id }}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full hover:bg-muted hover:text-ink"
                        aria-label="Open"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Link>
                      <button
                        onClick={() => remove(r.id)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full hover:bg-red-50 hover:text-red-600"
                        aria-label="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selected.size > 0 && (
        <div
          className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-2 sm:bottom-4 sm:px-4"
          style={{ paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom))" }}
        >
          <div className="flex w-full max-w-full items-center gap-2 overflow-x-auto rounded-2xl border border-border/70 bg-card/95 px-3 py-2 shadow-xl backdrop-blur scrollbar-hide sm:w-auto sm:flex-wrap sm:rounded-full sm:overflow-visible">
            <button
              onClick={() => setSelected(new Set())}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full hover:bg-muted"
              aria-label="Clear selection"
            >
              <X className="h-4 w-4" />
            </button>
            <span className="shrink-0 px-2 text-[13px] font-medium text-ink">{selected.size}</span>
            <div className="mx-1 h-5 w-px shrink-0 bg-border/70" />
            <button
              disabled={busy}
              onClick={() => bulkStatus("published")}
              className="h-8 shrink-0 rounded-full px-3 text-[12px] font-medium text-ink hover:bg-muted disabled:opacity-50"
            >
              Publish
            </button>
            <button
              disabled={busy}
              onClick={() => bulkStatus("draft")}
              className="h-8 shrink-0 rounded-full px-3 text-[12px] font-medium text-ink hover:bg-muted disabled:opacity-50"
            >
              Draft
            </button>
            <button
              disabled={busy}
              onClick={() => bulkStatus("archived")}
              className="h-8 shrink-0 rounded-full px-3 text-[12px] font-medium text-ink hover:bg-muted disabled:opacity-50"
            >
              Archive
            </button>
            <div className="mx-1 h-5 w-px shrink-0 bg-border/70" />
            <button
              disabled={busy}
              onClick={() => bulkFeature(true)}
              className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[12px] font-medium text-amber-600 hover:bg-amber-50 disabled:opacity-50"
            >
              <Star className="h-3.5 w-3.5" /> Feature
            </button>
            <button
              disabled={busy}
              onClick={() => bulkFeature(false)}
              className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[12px] font-medium text-ink/70 hover:bg-muted disabled:opacity-50"
            >
              <StarOff className="h-3.5 w-3.5" /> Unfeature
            </button>
            <div className="mx-1 h-5 w-px shrink-0 bg-border/70" />
            <button
              disabled={busy}
              onClick={bulkDelete}
              className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[12px] font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SortableTh({
  label,
  k,
  sortKey,
  sortDir,
  onClick,
  align = "left",
}: {
  label: string;
  k: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onClick: (k: SortKey) => void;
  align?: "left" | "right" | "center";
}) {
  const active = sortKey === k;
  const Icon = !active ? ArrowUpDown : sortDir === "asc" ? ArrowUp : ArrowDown;
  const justify =
    align === "right" ? "justify-end" : align === "center" ? "justify-center" : "justify-start";
  return (
    <th className="px-4 py-3 font-medium">
      <button
        onClick={() => onClick(k)}
        className={`inline-flex w-full items-center gap-1 ${justify} transition ${
          active ? "text-ink" : "text-ink/50 hover:text-ink"
        }`}
      >
        <span>{label}</span>
        <Icon className="h-3 w-3 opacity-70" />
      </button>
    </th>
  );
}
