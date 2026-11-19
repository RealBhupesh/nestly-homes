import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  // has_role() lives in the private schema (not exposed via PostgREST).
  // Read the caller's own user_roles rows — RLS allows users to read their own.
  const { data, error } = await ctx.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", ctx.userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}

async function logAudit(
  admin: any,
  actorId: string,
  action: string,
  entityType: string,
  entityId?: string | null,
  metadata: Record<string, any> = {},
) {
  try {
    await admin.from("admin_audit_log").insert({
      actor_id: actorId,
      action,
      entity_type: entityType,
      entity_id: entityId ?? null,
      metadata,
    });
  } catch {
    // never fail the action because logging failed
  }
}

export const getIsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    return { isAdmin: Boolean(data) };
  });

export const getAdminOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [listingsAll, published, drafts, archived, reviews, photos, users] = await Promise.all([
      supabaseAdmin.from("listings").select("*", { count: "exact", head: true }),
      supabaseAdmin
        .from("listings")
        .select("*", { count: "exact", head: true })
        .eq("status", "published"),
      supabaseAdmin
        .from("listings")
        .select("*", { count: "exact", head: true })
        .eq("status", "draft"),
      supabaseAdmin
        .from("listings")
        .select("*", { count: "exact", head: true })
        .eq("status", "archived"),
      supabaseAdmin.from("listing_reviews").select("*", { count: "exact", head: true }),
      supabaseAdmin.from("listing_photos").select("*", { count: "exact", head: true }),
      supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1 }),
    ]);

    const { data: recent } = await supabaseAdmin
      .from("listings")
      .select("id, title, status, mode, city, price_amount, updated_at, owner_id")
      .order("updated_at", { ascending: false })
      .limit(6);

    const { data: byCity } = await supabaseAdmin.from("listings").select("city").limit(1000);
    const cityCounts: Record<string, number> = {};
    for (const r of byCity ?? []) {
      const c = (r as any).city ?? "Unknown";
      cityCounts[c] = (cityCounts[c] ?? 0) + 1;
    }
    const topCities = Object.entries(cityCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([city, count]) => ({ city, count }));

    return {
      counts: {
        listings: listingsAll.count ?? 0,
        published: published.count ?? 0,
        drafts: drafts.count ?? 0,
        archived: archived.count ?? 0,
        reviews: reviews.count ?? 0,
        photos: photos.count ?? 0,
        users: (users.data as any)?.total ?? users.data?.users?.length ?? 0,
      },
      recent: recent ?? [],
      topCities,
    };
  });

export const listAllListings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        status: z.enum(["all", "draft", "published", "archived"]).default("all"),
        q: z.string().optional().default(""),
      })
      .parse(i),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("listings")
      .select(
        "id, title, status, mode, city, price_amount, cover_photo_url, updated_at, created_at, owner_id, is_featured, property_type, bedrooms",
      )
      .order("updated_at", { ascending: false })
      .limit(200);
    if (data.status !== "all") q = q.eq("status", data.status);
    if (data.q) q = q.ilike("title", `%${data.q}%`);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const setListingStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["draft", "published", "archived"]),
      })
      .parse(i),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("listings")
      .update({ status: data.status })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await logAudit(supabaseAdmin, context.userId, "listing.status", "listing", data.id, {
      status: data.status,
    });
    return { ok: true };
  });

export const deleteListingAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("listings").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await logAudit(supabaseAdmin, context.userId, "listing.delete", "listing", data.id);
    return { ok: true };
  });

export const bulkSetListingStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        ids: z.array(z.string().uuid()).min(1).max(500),
        status: z.enum(["draft", "published", "archived"]),
      })
      .parse(i),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("listings")
      .update({ status: data.status })
      .in("id", data.ids);
    if (error) throw new Error(error.message);
    await logAudit(supabaseAdmin, context.userId, "listing.bulk_status", "listing", null, {
      status: data.status,
      count: data.ids.length,
    });
    return { ok: true, count: data.ids.length };
  });

export const bulkDeleteListings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ ids: z.array(z.string().uuid()).min(1).max(500) }).parse(i))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("listings").delete().in("id", data.ids);
    if (error) throw new Error(error.message);
    await logAudit(supabaseAdmin, context.userId, "listing.bulk_delete", "listing", null, {
      count: data.ids.length,
    });
    return { ok: true, count: data.ids.length };
  });

export const setListingFeatured = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid(), featured: z.boolean() }).parse(i))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("listings")
      .update({ is_featured: data.featured })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await logAudit(supabaseAdmin, context.userId, "listing.featured", "listing", data.id, {
      featured: data.featured,
    });
    return { ok: true };
  });

export const bulkSetListingFeatured = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        ids: z.array(z.string().uuid()).min(1).max(500),
        featured: z.boolean(),
      })
      .parse(i),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("listings")
      .update({ is_featured: data.featured })
      .in("id", data.ids);
    if (error) throw new Error(error.message);
    await logAudit(supabaseAdmin, context.userId, "listing.bulk_featured", "listing", null, {
      featured: data.featured,
      count: data.ids.length,
    });
    return { ok: true, count: data.ids.length };
  });

export const listAllReviews = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("listing_reviews")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const deleteReviewAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("listing_reviews").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await logAudit(supabaseAdmin, context.userId, "review.delete", "review", data.id);
    return { ok: true };
  });

export const listAllUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ q: z.string().optional().default("") }).parse(i))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: users, error } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    if (error) throw new Error(error.message);
    const { data: roles } = await supabaseAdmin.from("user_roles").select("user_id, role");
    const rolesByUser = new Map<string, string[]>();
    for (const r of roles ?? []) {
      const list = rolesByUser.get((r as any).user_id) ?? [];
      list.push((r as any).role);
      rolesByUser.set((r as any).user_id, list);
    }
    const q = data.q.trim().toLowerCase();
    return (users.users ?? [])
      .filter((u) => !q || (u.email ?? "").toLowerCase().includes(q))
      .map((u) => ({
        id: u.id,
        email: u.email ?? "",
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at ?? null,
        roles: rolesByUser.get(u.id) ?? [],
      }));
  });

export const setUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        userId: z.string().uuid(),
        role: z.enum(["admin", "moderator", "user"]),
        grant: z.boolean(),
      })
      .parse(i),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    if (!data.grant && data.userId === context.userId && data.role === "admin") {
      throw new Error("You cannot revoke your own admin role.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.grant) {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: data.userId, role: data.role });
      if (error && !String(error.message).includes("duplicate")) throw new Error(error.message);
      await logAudit(supabaseAdmin, context.userId, "role.grant", "user", data.userId, {
        role: data.role,
      });
    } else {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq("user_id", data.userId)
        .eq("role", data.role);
      if (error) throw new Error(error.message);
      await logAudit(supabaseAdmin, context.userId, "role.revoke", "user", data.userId, {
        role: data.role,
      });
    }
    return { ok: true };
  });

// ==========================================================================
// Time-series + analytics
// ==========================================================================

export const getAdminTimeseries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ days: z.number().int().min(7).max(90).default(30) }).parse(i))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since = new Date(Date.now() - data.days * 24 * 60 * 60 * 1000);
    const sinceIso = since.toISOString();

    const [listings, reviews, users] = await Promise.all([
      supabaseAdmin.from("listings").select("created_at").gte("created_at", sinceIso),
      supabaseAdmin.from("listing_reviews").select("created_at").gte("created_at", sinceIso),
      supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    ]);

    const bucket = (rows: { created_at: string }[]) => {
      const map = new Map<string, number>();
      for (const r of rows) {
        const d = new Date(r.created_at).toISOString().slice(0, 10);
        map.set(d, (map.get(d) ?? 0) + 1);
      }
      return map;
    };
    const lMap = bucket(listings.data ?? []);
    const rMap = bucket(reviews.data ?? []);
    const uMap = bucket(
      (users.data?.users ?? [])
        .filter((u: any) => u.created_at >= sinceIso)
        .map((u: any) => ({ created_at: u.created_at })),
    );

    const series: Array<{ date: string; listings: number; reviews: number; users: number }> = [];
    for (let i = data.days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      series.push({
        date: d,
        listings: lMap.get(d) ?? 0,
        reviews: rMap.get(d) ?? 0,
        users: uMap.get(d) ?? 0,
      });
    }
    return series;
  });

export const getAdminAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: rows } = await supabaseAdmin
      .from("listings")
      .select("mode, property_type, city, price_amount, bedrooms, owner_id, status")
      .limit(5000);

    const byMode: Record<
      string,
      { count: number; avg: number; sum: number; min: number; max: number }
    > = {};
    const byType: Record<string, number> = {};
    const byBedrooms: Record<string, number> = {};
    const ownerCounts: Record<string, number> = {};
    for (const r of rows ?? []) {
      const m = (r as any).mode as string;
      const price = Number((r as any).price_amount) || 0;
      const bucket = (byMode[m] ??= { count: 0, avg: 0, sum: 0, min: Infinity, max: 0 });
      bucket.count++;
      bucket.sum += price;
      bucket.min = Math.min(bucket.min, price);
      bucket.max = Math.max(bucket.max, price);

      const t = (r as any).property_type as string;
      byType[t] = (byType[t] ?? 0) + 1;

      const b = String((r as any).bedrooms ?? 0);
      byBedrooms[b] = (byBedrooms[b] ?? 0) + 1;

      const oid = (r as any).owner_id as string;
      ownerCounts[oid] = (ownerCounts[oid] ?? 0) + 1;
    }
    for (const k of Object.keys(byMode)) {
      byMode[k].avg = Math.round(byMode[k].sum / Math.max(byMode[k].count, 1));
      if (byMode[k].min === Infinity) byMode[k].min = 0;
    }

    const topOwnerIds = Object.entries(ownerCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    let topOwners: Array<{ id: string; email: string; count: number }> = [];
    if (topOwnerIds.length) {
      const users = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
      const emailById = new Map<string, string>();
      for (const u of users.data?.users ?? []) emailById.set(u.id, u.email ?? "");
      topOwners = topOwnerIds.map(([id, count]) => ({
        id,
        email: emailById.get(id) ?? "—",
        count,
      }));
    }

    return {
      byMode: Object.entries(byMode).map(([mode, v]) => ({ mode, ...v })),
      byType: Object.entries(byType).map(([type, count]) => ({ type, count })),
      byBedrooms: Object.entries(byBedrooms)
        .map(([b, count]) => ({ bedrooms: b, count }))
        .sort((a, b) => Number(a.bedrooms) - Number(b.bedrooms)),
      topOwners,
      total: rows?.length ?? 0,
    };
  });

// ==========================================================================
// Photos
// ==========================================================================

export const listAllPhotos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("listing_photos")
      .select("id, listing_id, owner_id, url, storage_path, position, created_at")
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const deletePhotoAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("listing_photos")
      .select("storage_path")
      .eq("id", data.id)
      .maybeSingle();
    if (row?.storage_path) {
      await supabaseAdmin.storage.from("listing-photos").remove([row.storage_path]);
    }
    const { error } = await supabaseAdmin.from("listing_photos").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await logAudit(supabaseAdmin, context.userId, "photo.delete", "photo", data.id);
    return { ok: true };
  });

// ==========================================================================
// Saved searches
// ==========================================================================

export const listAllSavedSearches = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("saved_searches")
      .select("id, user_id, name, params, last_seen_at, created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);

    const ids = Array.from(new Set((data ?? []).map((r: any) => r.user_id)));
    const emailById = new Map<string, string>();
    if (ids.length) {
      const users = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
      for (const u of users.data?.users ?? []) emailById.set(u.id, u.email ?? "");
    }
    return (data ?? []).map((r: any) => ({ ...r, email: emailById.get(r.user_id) ?? "—" }));
  });

// ==========================================================================
// Reviews bulk
// ==========================================================================

export const bulkDeleteReviews = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ ids: z.array(z.string().uuid()).min(1).max(500) }).parse(i))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("listing_reviews").delete().in("id", data.ids);
    if (error) throw new Error(error.message);
    await logAudit(supabaseAdmin, context.userId, "review.bulk_delete", "review", null, {
      count: data.ids.length,
    });
    return { ok: true };
  });

// ==========================================================================
// User detail + moderation
// ==========================================================================

export const getUserDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ userId: z.string().uuid() }).parse(i))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: u }, { data: roles }, listings, reviews, notes] = await Promise.all([
      supabaseAdmin.auth.admin.getUserById(data.userId),
      supabaseAdmin.from("user_roles").select("role").eq("user_id", data.userId),
      supabaseAdmin
        .from("listings")
        .select("id, title, status, mode, city, price_amount, updated_at")
        .eq("owner_id", data.userId)
        .order("updated_at", { ascending: false })
        .limit(100),
      supabaseAdmin
        .from("listing_reviews")
        .select("id, listing_id, rating, title, body, created_at")
        .eq("user_id", data.userId)
        .order("created_at", { ascending: false })
        .limit(100),
      supabaseAdmin
        .from("admin_user_notes")
        .select("id, body, author_id, created_at")
        .eq("user_id", data.userId)
        .order("created_at", { ascending: false }),
    ]);

    if (!u?.user) throw new Error("User not found");
    return {
      user: {
        id: u.user.id,
        email: u.user.email ?? "",
        created_at: u.user.created_at,
        last_sign_in_at: u.user.last_sign_in_at ?? null,
        banned_until: (u.user as any).banned_until ?? null,
        provider: (u.user.app_metadata as any)?.provider ?? "email",
      },
      roles: (roles ?? []).map((r: any) => r.role),
      listings: listings.data ?? [],
      reviews: reviews.data ?? [],
      notes: notes.data ?? [],
    };
  });

export const setUserBan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ userId: z.string().uuid(), ban: z.boolean() }).parse(i))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    if (data.userId === context.userId) throw new Error("You cannot ban yourself.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      ban_duration: data.ban ? "876000h" : "none",
    } as any);
    if (error) throw new Error(error.message);
    await logAudit(
      supabaseAdmin,
      context.userId,
      data.ban ? "user.ban" : "user.unban",
      "user",
      data.userId,
    );
    return { ok: true };
  });

export const deleteUserAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ userId: z.string().uuid() }).parse(i))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    if (data.userId === context.userId) throw new Error("You cannot delete yourself.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    await logAudit(supabaseAdmin, context.userId, "user.delete", "user", data.userId);
    return { ok: true };
  });

export const addUserNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ userId: z.string().uuid(), body: z.string().min(1).max(2000) }).parse(i),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("admin_user_notes")
      .insert({ user_id: data.userId, author_id: context.userId, body: data.body })
      .select("id, body, author_id, created_at")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteUserNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("admin_user_notes").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ==========================================================================
// Audit log
// ==========================================================================

export const listAuditLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        q: z.string().optional().default(""),
        limit: z.number().int().min(10).max(500).default(200),
      })
      .parse(i),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("admin_audit_log")
      .select("id, actor_id, action, entity_type, entity_id, metadata, created_at")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.q) q = q.ilike("action", `%${data.q}%`);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const ids = Array.from(new Set((rows ?? []).map((r: any) => r.actor_id)));
    const emailById = new Map<string, string>();
    if (ids.length) {
      const users = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
      for (const u of users.data?.users ?? []) emailById.set(u.id, u.email ?? "");
    }
    return (rows ?? []).map((r: any) => ({ ...r, actor_email: emailById.get(r.actor_id) ?? "—" }));
  });

// ==========================================================================
// Feature flags
// ==========================================================================

export const listFeatureFlags = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.from("feature_flags").select("*").order("key");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const setFeatureFlag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ key: z.string().min(1).max(64), enabled: z.boolean() }).parse(i),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("feature_flags")
      .update({
        enabled: data.enabled,
        updated_by: context.userId,
        updated_at: new Date().toISOString(),
      })
      .eq("key", data.key);
    if (error) throw new Error(error.message);
    await logAudit(supabaseAdmin, context.userId, "flag.set", "flag", data.key, {
      enabled: data.enabled,
    });
    return { ok: true };
  });
