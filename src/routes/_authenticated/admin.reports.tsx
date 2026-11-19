import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Flag, Loader2 } from "lucide-react";
import {
  listReportsAdmin,
  setReportStatus,
  REPORT_STATUSES,
  type AdminReport,
  type ReportStatus,
} from "@/lib/reports.functions";

export const Route = createFileRoute("/_authenticated/admin/reports")({
  component: AdminReports,
});

type Filter = ReportStatus | "all";

const STATUS_STYLE: Record<ReportStatus, string> = {
  open: "bg-coral/15 text-coral",
  reviewing: "bg-amber-100 text-amber-800",
  resolved: "bg-teal/15 text-teal",
  dismissed: "bg-muted text-ink/60",
};

function AdminReports() {
  const list = useServerFn(listReportsAdmin);
  const setStatus = useServerFn(setReportStatus);
  const [filter, setFilter] = useState<Filter>("open");
  const [rows, setRows] = useState<AdminReport[] | null>(null);
  const [available, setAvailable] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load(f: Filter) {
    setRows(null);
    try {
      const res = await list({ data: { status: f } });
      setAvailable(res.available);
      setRows(res.reports);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load reports");
      setRows([]);
    }
  }

  useEffect(() => {
    void load(filter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  async function change(r: AdminReport, status: ReportStatus) {
    if (r.status === status) return;
    setBusyId(r.id);
    try {
      await setStatus({ data: { id: r.id, status } });
      setRows((prev) =>
        (prev ?? [])
          .map((x) => (x.id === r.id ? { ...x, status } : x))
          .filter((x) => filter === "all" || x.status === filter),
      );
      toast.success(`Marked ${status}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.2em] text-ink/45">Moderation</p>
          <h1 className="mt-1 text-2xl font-medium tracking-tight text-ink sm:text-3xl">Reports</h1>
          <p className="mt-1 text-[13px] text-ink/55">
            Listings, reviews, users and messages flagged by the community.
          </p>
        </div>
        <div className="-mx-1 flex items-center gap-1 overflow-x-auto rounded-full border border-border/70 bg-background p-1 text-[12px] scrollbar-hide sm:mx-0">
          {(["open", "reviewing", "resolved", "dismissed", "all"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`shrink-0 rounded-full px-3 py-1 capitalize ${filter === f ? "bg-ink text-cream" : "text-ink/70 hover:text-ink"}`}
            >
              {f}
            </button>
          ))}
        </div>
      </header>

      {!available && (
        <p className="rounded-2xl border border-dashed border-border/70 p-6 text-center text-sm text-ink/60">
          The <code>content_reports</code> table isn't in this database yet. Apply the latest
          migrations to enable reporting.
        </p>
      )}

      {rows === null && <p className="text-sm text-ink/50">Loading…</p>}
      {available && rows?.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border/70 p-8 text-center text-sm text-ink/50">
          <Flag className="mx-auto mb-2 h-5 w-5 text-ink/30" />
          No {filter === "all" ? "" : filter} reports.
        </div>
      )}

      <ul className="grid gap-3">
        {rows?.map((r) => (
          <li key={r.id} className="rounded-2xl border border-border/70 bg-card p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-[12px] text-ink/60">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${STATUS_STYLE[r.status] ?? "bg-muted"}`}
                  >
                    {r.status}
                  </span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold capitalize text-ink">
                    {r.target_type}
                  </span>
                  <span>{new Date(r.created_at).toLocaleString("en-IN")}</span>
                  <span>·</span>
                  <span>by {r.reporter_name || r.reporter_id.slice(0, 8)}</span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-[14px] text-ink">{r.reason}</p>
                <TargetLink r={r} />
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {busyId === r.id && <Loader2 className="h-4 w-4 animate-spin text-ink/50" />}
                <select
                  value={r.status}
                  disabled={busyId === r.id}
                  onChange={(e) => change(r, e.target.value as ReportStatus)}
                  aria-label="Report status"
                  className="rounded-full border border-border/70 bg-background px-3 py-1.5 text-[12px] capitalize text-ink"
                >
                  {REPORT_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TargetLink({ r }: { r: AdminReport }) {
  const cls =
    "mt-2 inline-flex max-w-full truncate text-[12px] font-medium text-primary hover:underline";
  if (r.target_type === "user") {
    return (
      <Link
        to={"/admin/users/$userId" as never}
        params={{ userId: r.target_id } as never}
        className={cls}
      >
        View user {r.target_id.slice(0, 8)} →
      </Link>
    );
  }
  if (r.target_listing_id) {
    const label =
      r.target_type === "listing"
        ? `Listing: ${r.target_label ?? r.target_id}`
        : `Review: ${r.target_label ?? r.target_id}`;
    return (
      <Link to="/listing/$id" params={{ id: r.target_listing_id }} target="_blank" className={cls}>
        {label} →
      </Link>
    );
  }
  return <p className="mt-2 truncate text-[12px] text-ink/50">Target: {r.target_id}</p>;
}
