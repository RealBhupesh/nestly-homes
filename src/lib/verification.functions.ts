import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface VerificationRow {
  id: string;
  user_id: string;
  full_name: string;
  phone: string;
  document_path: string | null;
  status: "pending" | "approved" | "rejected";
  review_note: string | null;
  reviewed_at: string | null;
  created_at: string;
}

const COLS =
  "id, user_id, full_name, phone, document_path, status, review_note, reviewed_at, created_at";

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", ctx.userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Forbidden");
}

export const getMyVerification = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [{ data: req }, { data: profile }] = await Promise.all([
      context.supabase
        .from("owner_verifications")
        .select(COLS)
        .eq("user_id", context.userId)
        .maybeSingle(),
      context.supabase
        .from("profiles")
        .select("is_verified_owner, verified_at")
        .eq("id", context.userId)
        .maybeSingle(),
    ]);
    return {
      request: (req ?? null) as VerificationRow | null,
      isVerified: Boolean(profile?.is_verified_owner),
      verifiedAt: (profile?.verified_at ?? null) as string | null,
    };
  });

const submitSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  // Ignored: the server uses the phone number confirmed via SMS OTP on the auth user.
  phone: z.string().trim().max(24).optional(),
  documentPath: z
    .string()
    .trim()
    .max(500)
    .regex(/^[0-9a-f-]{36}\/[A-Za-z0-9._-]+$/i, "Invalid document path")
    .optional(),
});

export const submitVerification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => submitSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1. Phone must be confirmed by SMS OTP on the auth user itself.
    const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.getUserById(
      context.userId,
    );
    if (authErr || !authData.user)
      throw new Error("Could not load your account. Please sign in again.");
    const confirmedPhone =
      authData.user.phone_confirmed_at && authData.user.phone ? authData.user.phone : null;
    if (!confirmedPhone) throw new Error("Verify your phone number with the SMS code first.");
    const phone = confirmedPhone.startsWith("+") ? confirmedPhone : `+${confirmedPhone}`;

    // 2. Any document must live in the caller's own folder of the private bucket.
    let documentPath: string | null = null;
    if (data.documentPath) {
      const [folder, fileName] = data.documentPath.split("/");
      if (folder !== context.userId || !fileName) throw new Error("Invalid document path");
      const { data: found, error: listErr } = await supabaseAdmin.storage
        .from("verification-docs")
        .list(context.userId, { search: fileName, limit: 5 });
      if (listErr || !found?.some((f) => f.name === fileName)) {
        throw new Error("We couldn't find your uploaded document. Please upload it again.");
      }
      documentPath = data.documentPath;
    }

    const { data: existing } = await supabaseAdmin
      .from("owner_verifications")
      .select("id, status")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (existing && existing.status !== "rejected") {
      throw new Error(
        existing.status === "approved"
          ? "You're already verified."
          : "Your request is already under review.",
      );
    }
    if (existing) {
      const { error } = await supabaseAdmin
        .from("owner_verifications")
        .update({
          full_name: data.fullName,
          phone,
          document_path: documentPath,
          status: "pending",
          review_note: null,
          reviewed_at: null,
          reviewed_by: null,
        })
        .eq("id", existing.id)
        .eq("user_id", context.userId);
      if (error) throw new Error(error.message);
      return { ok: true, resubmitted: true };
    }
    const { error } = await supabaseAdmin.from("owner_verifications").insert({
      user_id: context.userId,
      full_name: data.fullName,
      phone,
      document_path: documentPath,
      status: "pending",
    });
    if (error) throw new Error(error.message);
    return { ok: true, resubmitted: false };
  });

export const listVerifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { status?: string } | undefined) => ({
    status: z
      .enum(["all", "pending", "approved", "rejected"])
      .default("pending")
      .parse(input?.status ?? "pending"),
  }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("owner_verifications")
      .select(COLS)
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.status !== "all") q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const list = (rows ?? []) as VerificationRow[];
    const ids = list.map((r) => r.user_id);
    const names = new Map<string, string | null>();
    if (ids.length) {
      const { data: profiles } = await supabaseAdmin
        .from("profiles")
        .select("id, display_name")
        .in("id", ids);
      for (const p of profiles ?? []) names.set(p.id, p.display_name);
    }
    return list.map((r) => ({ ...r, display_name: names.get(r.user_id) ?? null }));
  });

const decideSchema = z.object({
  id: z.string().uuid(),
  decision: z.enum(["approved", "rejected"]),
  note: z.string().trim().max(500).optional(),
});

export const decideVerification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => decideSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("owner_verifications")
      .update({
        status: data.decision,
        review_note: data.note ?? null,
        reviewed_by: context.userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", data.id)
      .select("user_id")
      .single();
    if (error) throw new Error(error.message);
    await supabaseAdmin
      .from("profiles")
      .update({
        is_verified_owner: data.decision === "approved",
        verified_at: data.decision === "approved" ? new Date().toISOString() : null,
      })
      .eq("id", row.user_id);
    return { ok: true };
  });

export const getVerifiedOwners = createServerFn({ method: "GET" })
  .inputValidator((input: { ids: string[] }) => ({
    ids: z.array(z.string().uuid()).max(100).parse(input.ids),
  }))
  .handler(async ({ data }) => {
    if (!data.ids.length) return [] as string[];
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .in("id", data.ids)
      .eq("is_verified_owner", true);
    return (rows ?? []).map((r) => r.id);
  });

/** Admin-only: short-lived (5 min) signed URL for a request's private ID document. */
export const getVerificationDocumentUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("owner_verifications")
      .select("id, user_id, document_path")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row?.document_path) throw new Error("No document was uploaded with this request.");
    const { data: signed, error: signErr } = await supabaseAdmin.storage
      .from("verification-docs")
      .createSignedUrl(row.document_path, 300);
    if (signErr || !signed?.signedUrl) throw new Error("Could not open the document.");
    try {
      await supabaseAdmin.from("admin_audit_log").insert({
        actor_id: context.userId,
        action: "verification.document_viewed",
        entity_type: "owner_verification",
        entity_id: row.id,
        metadata: { user_id: row.user_id },
      });
    } catch {
      // never block the review because logging failed
    }
    return { url: signed.signedUrl };
  });
