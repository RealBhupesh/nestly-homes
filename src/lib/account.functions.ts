import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * DPDP Act 2023 data-principal rights: access (export) and erasure (delete).
 * Both run on the server with the service-role client, always scoped to the
 * caller's verified user id from the auth middleware — never a client-supplied id.
 */

export const exportMyData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const uid = context.userId;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [
      authUser,
      profile,
      listings,
      savedSearches,
      convos,
      tours,
      reviews,
      likes,
      verification,
    ] = await Promise.all([
      supabaseAdmin.auth.admin.getUserById(uid),
      supabaseAdmin.from("profiles").select("*").eq("id", uid).maybeSingle(),
      supabaseAdmin.from("listings").select("*").eq("owner_id", uid),
      supabaseAdmin.from("saved_searches").select("*").eq("user_id", uid),
      supabaseAdmin.from("conversations").select("*").or(`seeker_id.eq.${uid},owner_id.eq.${uid}`),
      supabaseAdmin.from("tour_bookings").select("*").or(`seeker_id.eq.${uid},owner_id.eq.${uid}`),
      supabaseAdmin.from("listing_reviews").select("*").eq("user_id", uid),
      supabaseAdmin.from("listing_likes").select("*").eq("user_id", uid),
      supabaseAdmin
        .from("owner_verifications")
        .select("full_name, phone, status, review_note, reviewed_at, created_at, document_path")
        .eq("user_id", uid)
        .maybeSingle(),
    ]);

    const listingIds = (listings.data ?? []).map((l) => l.id);
    const conversationIds = (convos.data ?? []).map((c) => c.id);

    const [photos, messages] = await Promise.all([
      listingIds.length
        ? supabaseAdmin.from("listing_photos").select("*").in("listing_id", listingIds)
        : Promise.resolve({ data: [] }),
      conversationIds.length
        ? supabaseAdmin
            .from("messages")
            .select("*")
            .in("conversation_id", conversationIds)
            .order("created_at", { ascending: true })
        : Promise.resolve({ data: [] }),
    ]);

    const u = authUser.data.user;
    return {
      exported_at: new Date().toISOString(),
      notice:
        "This file contains the personal data Nestly holds about you, provided under India's Digital Personal Data Protection Act, 2023.",
      account: u
        ? {
            id: u.id,
            email: u.email ?? null,
            phone: u.phone || null,
            created_at: u.created_at,
            last_sign_in_at: u.last_sign_in_at ?? null,
            email_confirmed_at: u.email_confirmed_at ?? null,
            phone_confirmed_at: u.phone_confirmed_at ?? null,
            providers: u.app_metadata?.providers ?? [],
            user_metadata: u.user_metadata ?? {},
          }
        : { id: uid },
      profile: profile.data ?? null,
      listings: listings.data ?? [],
      listing_photos: photos.data ?? [],
      saved_searches: savedSearches.data ?? [],
      conversations: convos.data ?? [],
      messages: messages.data ?? [],
      tour_bookings: tours.data ?? [],
      reviews: reviews.data ?? [],
      liked_listings: likes.data ?? [],
      owner_verification: verification.data ?? null,
    };
  });

const deleteSchema = z.object({ confirm: z.literal("DELETE") });

export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => deleteSchema.parse(input))
  .handler(async ({ context }) => {
    const uid = context.userId;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1. Take the user's listings off the market immediately.
    const { error: archiveErr } = await supabaseAdmin
      .from("listings")
      .update({ status: "archived" })
      .eq("owner_id", uid);
    if (archiveErr) throw new Error("Could not archive your listings. Please try again.");

    // 2. Best-effort removal of files the user uploaded (photos + ID documents).
    try {
      const { data: photos } = await supabaseAdmin
        .from("listing_photos")
        .select("storage_path")
        .eq("owner_id", uid);
      const paths = (photos ?? []).map((p) => p.storage_path).filter(Boolean);
      for (let i = 0; i < paths.length; i += 100) {
        await supabaseAdmin.storage.from("listing-photos").remove(paths.slice(i, i + 100));
      }
      const { data: docs } = await supabaseAdmin.storage
        .from("verification-docs")
        .list(uid, { limit: 1000 });
      if (docs?.length) {
        await supabaseAdmin.storage
          .from("verification-docs")
          .remove(docs.map((d) => `${uid}/${d.name}`));
      }
    } catch (e) {
      console.error("[deleteMyAccount] storage cleanup failed", e);
    }

    // 3. Delete the auth user. Rows referencing auth.users cascade.
    const { error } = await supabaseAdmin.auth.admin.deleteUser(uid);
    if (error) {
      console.error("[deleteMyAccount] deleteUser failed", error);
      throw new Error("We couldn't delete your account. Please contact support.");
    }
    return { ok: true };
  });
