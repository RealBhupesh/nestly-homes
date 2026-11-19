import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Pencil,
  Trash2,
  ImageIcon,
  ArrowUpRight,
  Share2,
  Search,
  Plus,
  Eye,
  EyeOff,
  Building2,
  CheckCircle2,
  FileEdit,
  Sparkles,
  MapPin,
  Heart,
  MessageSquare,
} from "lucide-react";
import { ShareDialog } from "@/components/nestly/ShareDialog";
import { fetchOwnerListingStats, type ListingStats } from "@/lib/listing-engagement";

export const Route = createFileRoute("/_authenticated/dashboard/")({
  component: MyListings,
});

interface Row {
  id: string;
  title: string;
  status: "draft" | "published" | "archived";
  mode: "rent" | "sale";
  city: string;
  price_amount: number;
  cover_photo_url: string | null;
  updated_at: string;
}

function MyListings() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [shareRow, setShareRow] = useState<Row | null>(null);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"all" | "published" | "draft" | "archived">("all");
  const [stats, setStats] = useState<Record<string, ListingStats>>({});

  async function load() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { data, error } = await supabase
      .from("listings")
      .select("id, title, status, mode, city, price_amount, cover_photo_url, updated_at")
      .eq("owner_id", user.id)
      .order("updated_at", { ascending: false });
    if (error) toast.error(error.message);
    else {
      const list = data as Row[];
      setRows(list);
      fetchOwnerListingStats(list.map((r) => r.id))
        .then(setStats)
        .catch(() => {});
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function toggleStatus(r: Row) {
    const next = r.status === "published" ? "draft" : "published";
    const { error } = await supabase.from("listings").update({ status: next }).eq("id", r.id);
    if (error) return toast.error(error.message);
    toast.success(next === "published" ? "Published" : "Unpublished");
    load();
  }

  async function remove(r: Row) {
    if (!confirm(`Delete "${r.title}"? This cannot be undone.`)) return;
    const { error } = await supabase.from("listings").delete().eq("id", r.id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    load();
  }

  const summary = useMemo(() => {
    const list = rows ?? [];
    let views = 0,
      likes = 0,
      messages = 0;
    for (const r of list) {
      const s = stats[r.id];
      if (s) {
        views += s.views;
        likes += s.likes;
        messages += s.messages;
      }
    }
    return {
      total: list.length,
      published: list.filter((r) => r.status === "published").length,
      drafts: list.filter((r) => r.status !== "published").length,
      archived: list.filter((r) => r.status === "archived").length,
      views,
      likes,
      messages,
    };
  }, [rows, stats]);

  const filtered = useMemo(() => {
    const list = rows ?? [];
    const q = query.trim().toLowerCase();
    return list.filter((r) => {
      if (tab !== "all" && r.status !== tab) return false;
      if (!q) return true;
      return (r.title + " " + r.city).toLowerCase().includes(q);
    });
  }, [rows, query, tab]);

  return (
    <div className="space-y-8">
      {shareRow && (
        <ShareDialog
          open={!!shareRow}
          onClose={() => setShareRow(null)}
          listingId={shareRow.id}
          title={shareRow.title}
          city={shareRow.city}
          price={shareRow.price_amount}
          mode={shareRow.mode}
        />
      )}

      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl border border-border/60 bg-ink text-cream shadow-tactile">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-primary/40 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-32 -left-10 h-64 w-64 rounded-full bg-primary/20 blur-3xl"
        />
        <div className="relative grid gap-8 p-6 sm:p-10 lg:grid-cols-[1.4fr_1fr] lg:items-end">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-cream/20 bg-cream/10 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-cream/80">
              <Sparkles className="h-3 w-3" /> Owner workspace
            </span>
            <h1 className="mt-4 text-3xl font-medium tracking-tight sm:text-4xl">
              Your listings, at a glance.
            </h1>
            <p className="mt-3 max-w-lg text-[13px] leading-relaxed text-cream/70">
              Publish, edit and share every property from one calm dashboard. No brokers, no clutter
              — just the essentials.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-2">
              <Link
                to="/dashboard/new"
                className="inline-flex items-center gap-1.5 rounded-full bg-cream px-4 py-2 text-[13px] font-medium text-ink transition hover:bg-white"
              >
                <Plus className="h-3.5 w-3.5" /> New listing
              </Link>
              <Link
                to="/dashboard/saved"
                className="inline-flex items-center gap-1.5 rounded-full border border-cream/25 px-4 py-2 text-[13px] text-cream/85 hover:border-cream hover:text-cream"
              >
                Saved searches <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 sm:gap-4">
            <HeroStat icon={Eye} label="Views" value={summary.views} accent />
            <HeroStat icon={Heart} label="Likes" value={summary.likes} />
            <HeroStat icon={MessageSquare} label="Msgs" value={summary.messages} />
          </div>
        </div>
      </section>

      {/* Controls */}
      <section className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {(["all", "published", "draft", "archived"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-full px-3.5 py-1.5 text-[12px] font-medium capitalize transition ${
                tab === t
                  ? "bg-ink text-cream"
                  : "bg-card text-ink/60 border border-border/60 hover:border-ink hover:text-ink"
              }`}
            >
              {t === "all"
                ? "All"
                : t === "published"
                  ? "Live"
                  : t === "draft"
                    ? "Pending"
                    : "Offline"}
              <span className={`ml-1.5 text-[10px] ${tab === t ? "text-cream/60" : "text-ink/40"}`}>
                {t === "all"
                  ? summary.total
                  : t === "published"
                    ? summary.published
                    : t === "draft"
                      ? summary.drafts - summary.archived
                      : summary.archived}
              </span>
            </button>
          ))}
        </div>
        <label className="relative flex items-center sm:w-72">
          <Search className="pointer-events-none absolute left-3 h-3.5 w-3.5 text-ink/40" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search title or city…"
            className="h-9 w-full rounded-full border border-border/60 bg-card pl-9 pr-3 text-[12px] text-ink placeholder:text-ink/40 focus:border-ink focus:outline-none"
          />
        </label>
      </section>

      {/* Grid */}
      <section>
        {rows === null && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-64 animate-pulse rounded-2xl border border-border/60 bg-card"
              />
            ))}
          </div>
        )}

        {rows && rows.length === 0 && (
          <div className="rounded-3xl border border-dashed border-border bg-card px-6 py-20 text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-muted text-ink/60">
              <Building2 className="h-5 w-5" />
            </div>
            <p className="mt-4 text-base font-medium text-ink">No listings yet</p>
            <p className="mt-1 text-sm text-ink/55">
              Post your first place in about three minutes.
            </p>
            <Link
              to="/dashboard/new"
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-[13px] font-medium text-cream hover:bg-ink/85"
            >
              <Plus className="h-3.5 w-3.5" /> Create listing
            </Link>
          </div>
        )}

        {rows && rows.length > 0 && filtered.length === 0 && (
          <p className="rounded-2xl border border-dashed border-border bg-card px-6 py-16 text-center text-sm text-ink/55">
            Nothing matches this filter.
          </p>
        )}

        {filtered.length > 0 && (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((r) => (
              <li key={r.id}>
                <ListingCard
                  row={r}
                  stats={stats[r.id]}
                  onShare={() => setShareRow(r)}
                  onToggle={() => toggleStatus(r)}
                  onRemove={() => remove(r)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function HeroStat({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: any;
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-3 sm:p-4 ${
        accent ? "border-primary/40 bg-primary/15" : "border-cream/15 bg-cream/5"
      }`}
    >
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-cream/70">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <p className="mt-2 tabular text-2xl font-medium text-cream sm:text-3xl">{value}</p>
    </div>
  );
}

function ListingCard({
  row: r,
  stats,
  onShare,
  onToggle,
  onRemove,
}: {
  row: Row;
  stats?: ListingStats;
  onShare: () => void;
  onToggle: () => void;
  onRemove: () => void;
}) {
  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-2xl border border-border/60 bg-card shadow-tactile transition hover:-translate-y-0.5 hover:border-ink/30">
      <div className="relative aspect-[4/3] overflow-hidden bg-muted">
        {r.cover_photo_url ? (
          <img
            src={r.cover_photo_url}
            alt=""
            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-ink/25">
            <ImageIcon className="h-6 w-6" />
          </div>
        )}
        <div className="absolute left-3 top-3 flex items-center gap-1.5">
          <StatusBadge status={r.status} />
          <span className="rounded-full border border-white/60 bg-white/85 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-ink/70 backdrop-blur">
            {r.mode}
          </span>
        </div>
        <Link
          to="/listing/$id"
          params={{ id: r.id }}
          className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-white/85 text-ink shadow-tactile opacity-0 backdrop-blur transition group-hover:opacity-100 hover:bg-white"
          aria-label="View public page"
        >
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="min-w-0">
          <h3 className="truncate text-[15px] font-medium text-ink">{r.title}</h3>
          <p className="mt-0.5 flex items-center gap-1 truncate text-[12px] text-ink/55">
            <MapPin className="h-3 w-3" /> {r.city}
          </p>
        </div>

        {/* Engagement */}
        <div className="flex items-center gap-3 text-[11.5px] text-ink/60">
          <span className="inline-flex items-center gap-1">
            <Eye className="h-3 w-3" />{" "}
            <span className="tabular text-ink/85">{stats?.views ?? 0}</span> views
          </span>
          <span className="inline-flex items-center gap-1">
            <Heart className="h-3 w-3" />{" "}
            <span className="tabular text-ink/85">{stats?.likes ?? 0}</span> likes
          </span>
          <span className="inline-flex items-center gap-1">
            <MessageSquare className="h-3 w-3" />{" "}
            <span className="tabular text-ink/85">{stats?.messages ?? 0}</span> msgs
          </span>
        </div>

        <div className="flex items-end justify-between">
          <p className="tabular text-[16px] font-medium text-ink">
            ₹{r.price_amount.toLocaleString("en-IN")}
            <span className="text-[11px] font-normal text-ink/45">
              {r.mode === "rent" ? "/mo" : ""}
            </span>
          </p>
          <p className="text-[10px] text-ink/45" title={new Date(r.updated_at).toLocaleString()}>
            {statusVerb(r.status)} · {timeAgo(r.updated_at)}
          </p>
        </div>

        <div className="mt-1 flex items-center gap-1.5 border-t border-border/60 pt-3">
          <button
            type="button"
            onClick={onToggle}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full bg-ink/5 px-3 py-1.5 text-[12px] font-medium text-ink transition hover:bg-ink hover:text-cream"
          >
            {r.status === "published" ? (
              <>
                <EyeOff className="h-3.5 w-3.5" /> Unpublish
              </>
            ) : (
              <>
                <Eye className="h-3.5 w-3.5" /> Publish
              </>
            )}
          </button>
          {r.status === "published" && (
            <button
              type="button"
              onClick={onShare}
              aria-label="Share"
              className="grid h-8 w-8 place-items-center rounded-full text-ink/60 hover:bg-muted hover:text-ink"
            >
              <Share2 className="h-3.5 w-3.5" />
            </button>
          )}
          <Link
            to="/dashboard/$id/edit"
            params={{ id: r.id }}
            aria-label="Edit"
            className="grid h-8 w-8 place-items-center rounded-full text-ink/60 hover:bg-muted hover:text-ink"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Link>
          <button
            type="button"
            onClick={onRemove}
            aria-label="Delete"
            className="grid h-8 w-8 place-items-center rounded-full text-ink/50 hover:bg-muted hover:text-red-600"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </article>
  );
}

function StatusBadge({ status }: { status: "draft" | "published" | "archived" }) {
  const map = {
    published: {
      label: "Live",
      dot: "bg-emerald-500",
      cls: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
    },
    draft: {
      label: "Pending",
      dot: "bg-amber-500",
      cls: "bg-amber-50 text-amber-700 ring-amber-600/20",
    },
    archived: {
      label: "Offline",
      dot: "bg-ink/40",
      cls: "bg-muted text-ink/60 ring-ink/10",
    },
  } as const;
  const s = map[status] ?? map.draft;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ring-1 ring-inset ${s.cls}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

function statusVerb(status: string) {
  if (status === "published") return "Published";
  if (status === "archived") return "Archived";
  return "Updated";
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
