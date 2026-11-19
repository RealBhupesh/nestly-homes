import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Content reports (listing / review / user / message) → public.content_reports.
// The table may be missing in older environments; errors are surfaced as a
// friendly message instead of a raw Postgres error.

export const REPORT_TARGETS = ["listing", "review", "user", "message"] as const;
export type ReportTarget = (typeof REPORT_TARGETS)[number];
export const REPORT_STATUSES = ["open", "reviewing", "resolved", "dismissed"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export interface ContentReportRow {
  id: string;
  target_type: ReportTarget;
  target_id: string;
  reason: string;
  reporter_id: string;
  status: ReportStatus;
  created_at: string;
  updated_at?: string | null;
}

// Regenerated DB types lag behind migrations; access the table untyped.
type Untyped = { from: (t: string) => any };

async function getAdmin(): Promise<Untyped> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Untyped;
}

function friendly(err: { message?: string; code?: string } | null | undefined): Error {
  const msg = err?.message ?? "";
  if (err?.code === "42P01" || /content_reports/.test(msg) || /schema cache/i.test(msg)) {
    return new Error("Reporting isn't available yet. Please try again later.");
  }
  return new Error("Could not submit the report. Please try again.");
}

const reportSchema = z.object({
  targetType: z.enum(REPORT_TARGETS),
  targetId: z.string().trim().min(1).max(200),
  reason: z.string().trim().min(3, "Tell us a bit more (at least 3 characters)").max(1000),
});

export const submitReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => reportSchema.parse(input))
  .handler(async ({ data, context }) => {
    const admin = await getAdmin();

    // Light abuse guard: at most 20 reports per user per hour.
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const recent = await admin
      .from("content_reports")
      .select("id", { count: "exact", head: true })
      .eq("reporter_id", context.userId)
      .gte("created_at", since);
    if (recent.error) throw friendly(recent.error);
    if ((recent.count ?? 0) >= 20) {
      throw new Error("You've sent a lot of reports recently. Please try again later.");
    }

    // Don't duplicate an open report from the same user on the same target.
    const dup = await admin
      .from("content_reports")
      .select("id")
      .eq("reporter_id", context.userId)
      .eq("target_type", data.targetType)
      .eq("target_id", data.targetId)
      .in("status", ["open", "reviewing"])
      .limit(1);
    if (dup.error) throw friendly(dup.error);
    if ((dup.data ?? []).length > 0) return { ok: true as const, duplicate: true };

    const { error } = await admin.from("content_reports").insert({
      target_type: data.targetType,
      target_id: data.targetId,
      reason: data.reason,
      reporter_id: context.userId,
    });
    if (error) throw friendly(error);
    return { ok: true as const, duplicate: false };
  });

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", ctx.userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}

export interface AdminReport extends ContentReportRow {
  reporter_name: string | null;
  target_label: string | null;
  /** Listing that the target belongs to (listing itself, or a review's listing). */
  target_listing_id: string | null;
}

export const listReportsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        status: z.enum([...REPORT_STATUSES, "all"] as [string, ...string[]]).default("open"),
        limit: z.number().int().min(1).max(200).default(100),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<{ reports: AdminReport[]; available: boolean }> => {
    await assertAdmin(context);
    const admin = await getAdmin();
    let q = admin
      .from("content_reports")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.status !== "all") q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) {
      if (friendly(error).message.startsWith("Reporting isn't available"))
        return { reports: [], available: false };
      throw new Error(error.message);
    }
    const reports = (rows ?? []) as ContentReportRow[];

    // Resolve reporter names + listing titles for context.
    const reporterIds = [...new Set(reports.map((r) => r.reporter_id).filter(Boolean))];
    const listingIds = [
      ...new Set(reports.filter((r) => r.target_type === "listing").map((r) => r.target_id)),
    ];
    const reviewIds = [
      ...new Set(reports.filter((r) => r.target_type === "review").map((r) => r.target_id)),
    ];
    const uuid = /^[0-9a-f-]{36}$/i;
    const [profiles, listings, reviews] = await Promise.all([
      reporterIds.length
        ? admin.from("profiles").select("id,display_name").in("id", reporterIds)
        : Promise.resolve({ data: [] }),
      listingIds.filter((x) => uuid.test(x)).length
        ? admin
            .from("listings")
            .select("id,title")
            .in(
              "id",
              listingIds.filter((x) => uuid.test(x)),
            )
        : Promise.resolve({ data: [] }),
      reviewIds.filter((x) => uuid.test(x)).length
        ? admin
            .from("listing_reviews")
            .select("id,title,body,listing_id")
            .in(
              "id",
              reviewIds.filter((x) => uuid.test(x)),
            )
        : Promise.resolve({ data: [] }),
    ]);
    const nameBy = new Map<string, string | null>(
      ((profiles.data ?? []) as { id: string; display_name: string | null }[]).map((p) => [
        p.id,
        p.display_name,
      ]),
    );
    const listingBy = new Map<string, string>(
      ((listings.data ?? []) as { id: string; title: string }[]).map((l) => [l.id, l.title]),
    );
    const reviewBy = new Map<string, { label: string; listingId: string }>(
      (
        (reviews.data ?? []) as {
          id: string;
          title: string | null;
          body: string;
          listing_id: string;
        }[]
      ).map((r) => [
        r.id,
        {
          label: `${r.title ? `${r.title}: ` : ""}${r.body.slice(0, 120)}`,
          listingId: r.listing_id,
        },
      ]),
    );
    return {
      available: true,
      reports: reports.map((r) => ({
        ...r,
        reporter_name: nameBy.get(r.reporter_id) ?? null,
        target_label:
          r.target_type === "listing"
            ? (listingBy.get(r.target_id) ?? null)
            : r.target_type === "review"
              ? (reviewBy.get(r.target_id)?.label ?? null)
              : null,
        target_listing_id:
          r.target_type === "listing"
            ? r.target_id
            : r.target_type === "review"
              ? (reviewBy.get(r.target_id)?.listingId ?? null)
              : null,
      })),
    };
  });

export const setReportStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), status: z.enum(REPORT_STATUSES) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const admin = await getAdmin();
    const { error } = await admin
      .from("content_reports")
      .update({ status: data.status })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    try {
      await admin.from("admin_audit_log").insert({
        actor_id: context.userId,
        action: "report.status",
        entity_type: "content_report",
        entity_id: data.id,
        metadata: { status: data.status },
      });
    } catch {
      // never fail the action because logging failed
    }
    return { ok: true };
  });
