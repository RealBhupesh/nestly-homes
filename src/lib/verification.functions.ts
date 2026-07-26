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
      context.supabase.from("owner_verifications").select(COLS).eq("user_id", context.userId).maybeSingle(),
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
  phone: z
    .string()
    .trim()
    .min(6)
    .max(24)
    .regex(/^[+0-9 ()-]+$/, "Enter a valid phone number"),
  documentPath: z.string().trim().max(500).optional(),
});

export const submitVerification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => submitSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: existing } = await context.supabase
      .from("owner_verifications")
      .select("id, status")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (existing && existing.status !== "rejected") {
      throw new Error(
        existing.status === "approved" ? "You're already verified." : "Your request is already under review.",
      );
    }
    if (existing) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error } = await supabaseAdmin
        .from("owner_verifications")
        .update({
          full_name: data.fullName,
          phone: data.phone,
          document_path: data.documentPath ?? null,
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
    const { error } = await context.supabase.from("owner_verifications").insert({
      user_id: context.userId,
      full_name: data.fullName,
      phone: data.phone,
      document_path: data.documentPath ?? null,
      status: "pending",
    });
    if (error) throw new Error(error.message);
    return { ok: true, resubmitted: false };
  });

export const listVerifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { status?: string } | undefined) => ({
    status: z.enum(["all", "pending", "approved", "rejected"]).default("pending").parse(input?.status ?? "pending"),
  }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin.from("owner_verifications").select(COLS).order("created_at", { ascending: false }).limit(200);
    if (data.status !== "all") q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const list = (rows ?? []) as VerificationRow[];
    const ids = list.map((r) => r.user_id);
    const names = new Map<string, string | null>();
    if (ids.length) {
      const { data: profiles } = await supabaseAdmin.from("profiles").select("id, display_name").in("id", ids);
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
