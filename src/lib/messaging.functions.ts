import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface ConversationRow {
  id: string;
  listing_id: string;
  listing_title: string | null;
  listing_photo: string | null;
  seeker_id: string;
  owner_id: string | null;
  owner_name: string | null;
  owner_phone: string | null;
  phone_revealed: boolean;
  last_message_at: string;
  last_message_preview: string | null;
  unread_seeker: number;
  unread_owner: number;
  created_at: string;
}

export interface MessageRow {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  kind: "text" | "system" | "booking";
  read_at: string | null;
  created_at: string;
}

export const listConversations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("conversations")
      .select(
        "id, listing_id, listing_title, listing_photo, seeker_id, owner_id, owner_name, owner_phone, phone_revealed, last_message_at, last_message_preview, unread_seeker, unread_owner, created_at",
      )
      .order("last_message_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as ConversationRow[];
  });

export const getUnreadCount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const uid = context.userId;
    const { data, error } = await context.supabase
      .from("conversations")
      .select("unread_seeker, unread_owner, seeker_id, owner_id");
    if (error) throw new Error(error.message);
    let total = 0;
    for (const row of data ?? []) {
      if (row.seeker_id === uid) total += row.unread_seeker ?? 0;
      else if (row.owner_id === uid) total += row.unread_owner ?? 0;
    }
    return { count: total };
  });

// Client-supplied listing/owner fields are accepted for backwards compatibility
// but IGNORED: owner_id, owner_name, owner_phone, title and photo are always
// derived server-side from the listings table so nobody can route a
// conversation to an arbitrary user.
const openSchema = z.object({
  listingId: z.string().min(1).max(200),
  listingTitle: z.string().max(300).optional(),
  listingPhoto: z.string().max(2000).optional(),
  ownerId: z.string().max(200).optional(),
  ownerName: z.string().max(200).optional(),
  ownerPhone: z.string().max(40).optional(),
});

export const openConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => openSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { getDbListing, getDisplayName } = await import("@/lib/notify.server");
    const listing = await getDbListing(data.listingId);
    if (!listing || (listing.status !== "published" && listing.owner_id !== context.userId)) {
      throw new Error("This listing isn't accepting messages right now.");
    }
    if (listing.owner_id === context.userId) {
      throw new Error("This is your own listing.");
    }

    // upsert-like: return existing or create
    const { data: existing } = await context.supabase
      .from("conversations")
      .select("id, owner_id")
      .eq("listing_id", listing.id)
      .eq("seeker_id", context.userId)
      .maybeSingle();
    if (existing) {
      if (existing.owner_id !== listing.owner_id) {
        // Repair threads created before owner_id was derived server-side.
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        await supabaseAdmin
          .from("conversations")
          .update({ owner_id: listing.owner_id })
          .eq("id", existing.id);
      }
      return { id: existing.id, created: false };
    }

    const ownerName = listing.contact_name?.trim() || (await getDisplayName(listing.owner_id));
    const { data: row, error } = await context.supabase
      .from("conversations")
      .insert({
        listing_id: listing.id,
        seeker_id: context.userId,
        owner_id: listing.owner_id,
        listing_title: listing.title,
        listing_photo: listing.cover_photo_url,
        owner_name: ownerName,
        owner_phone: listing.contact_phone,
      })
      .select("id")
      .single();
    if (error) {
      // Concurrent open from another tab: return the row that won.
      const { data: again } = await context.supabase
        .from("conversations")
        .select("id")
        .eq("listing_id", listing.id)
        .eq("seeker_id", context.userId)
        .maybeSingle();
      if (again) return { id: again.id, created: false };
      throw new Error(error.message);
    }
    return { id: row.id, created: true };
  });

export const listMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { conversationId: string }) => ({
    conversationId: z.string().uuid().parse(input.conversationId),
  }))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("messages")
      .select("id, conversation_id, sender_id, body, kind, read_at, created_at")
      .eq("conversation_id", data.conversationId)
      .order("created_at", { ascending: true })
      .limit(500);
    if (error) throw new Error(error.message);
    return (rows ?? []) as MessageRow[];
  });

// Users can only send plain text. 'system' / 'booking' messages are written
// by the server (service role) — see notify.server.ts.
const sendSchema = z.object({
  conversationId: z.string().uuid(),
  body: z.string().trim().min(1).max(4000),
  kind: z.literal("text").default("text"),
});

export const sendMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => sendSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { enforceRateLimit } = await import("@/lib/rate-limit");
    await enforceRateLimit(
      `msg:${context.userId}`,
      30,
      60,
      "You're sending messages too quickly. Please slow down.",
    );

    const { data: row, error } = await context.supabase
      .from("messages")
      .insert({
        conversation_id: data.conversationId,
        sender_id: context.userId,
        body: data.body,
        kind: "text",
      })
      .select("id, conversation_id, sender_id, body, kind, read_at, created_at")
      .single();
    if (error) throw new Error(error.message);

    const { notifyNewMessage } = await import("@/lib/notify.server");
    await notifyNewMessage({
      conversationId: data.conversationId,
      senderId: context.userId,
      body: data.body,
    });
    return row as MessageRow;
  });

export const markConversationRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { conversationId: string }) => ({
    conversationId: z.string().uuid().parse(input.conversationId),
  }))
  .handler(async ({ data, context }) => {
    // Zero the counter for whichever side this user is on
    const { data: conv } = await context.supabase
      .from("conversations")
      .select("seeker_id, owner_id")
      .eq("id", data.conversationId)
      .maybeSingle();
    if (!conv) return { ok: false };
    const isSeeker = conv.seeker_id === context.userId;
    const isOwner = conv.owner_id === context.userId;
    if (!isSeeker && !isOwner) return { ok: false };
    const { error } = await context.supabase
      .from("conversations")
      .update(isSeeker ? { unread_seeker: 0 } : { unread_owner: 0 })
      .eq("id", data.conversationId);
    if (error) throw new Error(error.message);
    await context.supabase
      .from("messages")
      .update({ read_at: new Date().toISOString() })
      .eq("conversation_id", data.conversationId)
      .is("read_at", null)
      .neq("sender_id", context.userId);
    return { ok: true };
  });

export const setPhoneRevealed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { conversationId: string; revealed: boolean }) => ({
    conversationId: z.string().uuid().parse(input.conversationId),
    revealed: z.boolean().parse(input.revealed),
  }))
  .handler(async ({ data, context }) => {
    // Only the owner can toggle reveal
    const { data: conv } = await context.supabase
      .from("conversations")
      .select("owner_id")
      .eq("id", data.conversationId)
      .maybeSingle();
    if (!conv || conv.owner_id !== context.userId)
      throw new Error("Only the owner can reveal contact");
    const { error } = await context.supabase
      .from("conversations")
      .update({ phone_revealed: data.revealed })
      .eq("id", data.conversationId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
