// Server-only notification helpers: email notifications for messages and tour
// bookings, and "booking" system messages posted into the inbox thread.
//
// Everything here uses the service-role client and is best-effort: functions
// catch their own errors and never throw to the caller.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { absoluteSiteUrl, escapeHtml, renderEmail, sendEmail } from "@/lib/email";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: string | null | undefined): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

/* ------------------------------------------------------------------ */
/* Lookups                                                            */
/* ------------------------------------------------------------------ */

export interface DbListingSummary {
  id: string;
  owner_id: string;
  title: string;
  status: string;
  cover_photo_url: string | null;
  contact_name: string | null;
  contact_phone: string | null;
}

/** Load a real listing by id (service role). Returns null for seed / unknown ids. */
export async function getDbListing(listingId: string): Promise<DbListingSummary | null> {
  if (!isUuid(listingId)) return null;
  const { data, error } = await supabaseAdmin
    .from("listings")
    .select("id, owner_id, title, status, cover_photo_url, contact_name, contact_phone")
    .eq("id", listingId)
    .maybeSingle();
  if (error) {
    console.error("[notify] listing lookup failed:", error.message);
    return null;
  }
  return (data as DbListingSummary | null) ?? null;
}

export async function getDisplayName(userId: string | null | undefined): Promise<string | null> {
  if (!isUuid(userId ?? "")) return null;
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("display_name")
    .eq("id", userId!)
    .maybeSingle();
  return data?.display_name ?? null;
}

async function getUserContact(
  userId: string | null | undefined,
): Promise<{ email: string | null; name: string | null }> {
  if (!userId || !isUuid(userId)) return { email: null, name: null };
  try {
    const [{ data: u }, name] = await Promise.all([
      supabaseAdmin.auth.admin.getUserById(userId),
      getDisplayName(userId),
    ]);
    return { email: u?.user?.email ?? null, name };
  } catch (err) {
    console.error("[notify] user lookup failed:", (err as Error).message);
    return { email: null, name: null };
  }
}

const fmtWhen = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
});

export function formatTourTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : `${fmtWhen.format(d)} IST`;
}

/* ------------------------------------------------------------------ */
/* New message email (throttled per conversation + recipient)         */
/* ------------------------------------------------------------------ */

const MESSAGE_EMAIL_COOLDOWN_MS = 15 * 60_000;
const lastMessageEmail = new Map<string, number>();

function throttled(key: string): boolean {
  const now = Date.now();
  const last = lastMessageEmail.get(key);
  if (last && now - last < MESSAGE_EMAIL_COOLDOWN_MS) return true;
  if (lastMessageEmail.size > 5000) {
    for (const [k, t] of lastMessageEmail)
      if (now - t >= MESSAGE_EMAIL_COOLDOWN_MS) lastMessageEmail.delete(k);
  }
  lastMessageEmail.set(key, now);
  return false;
}

export async function notifyNewMessage(opts: {
  conversationId: string;
  senderId: string;
  body: string;
}): Promise<void> {
  try {
    const { data: conv } = await supabaseAdmin
      .from("conversations")
      .select("id, seeker_id, owner_id, listing_title")
      .eq("id", opts.conversationId)
      .maybeSingle();
    if (!conv) return;
    const recipientId = conv.seeker_id === opts.senderId ? conv.owner_id : conv.seeker_id;
    if (!recipientId || recipientId === opts.senderId || !isUuid(recipientId)) return;
    if (throttled(`${conv.id}:${recipientId}`)) return;

    const [recipient, senderName] = await Promise.all([
      getUserContact(recipientId),
      getDisplayName(opts.senderId),
    ]);
    if (!recipient.email) return;

    const who = senderName || "Someone";
    const about = conv.listing_title ? ` about “${conv.listing_title}”` : "";
    const preview = opts.body.length > 400 ? `${opts.body.slice(0, 400)}…` : opts.body;
    const url = absoluteSiteUrl("/dashboard/inbox");
    await sendEmail({
      to: recipient.email,
      subject:
        `New message from ${who}${conv.listing_title ? ` · ${conv.listing_title}` : ""}`.slice(
          0,
          150,
        ),
      html: renderEmail({
        heading: `${who} sent you a message${about}`,
        bodyHtml: `<blockquote style="margin:0;padding:12px 14px;background:#f3f4f6;border-radius:8px;white-space:pre-wrap">${escapeHtml(preview)}</blockquote>`,
        cta: { label: "Reply on Nestly", url },
      }),
      text: `${who} sent you a message${about}:\n\n${preview}\n\nReply: ${url}`,
    });
  } catch (err) {
    console.error("[notify] new-message email failed:", (err as Error).message);
  }
}

/* ------------------------------------------------------------------ */
/* Booking messages in the inbox thread                               */
/* ------------------------------------------------------------------ */

/**
 * Post a `kind: 'booking'` message into the listing+seeker conversation,
 * creating the conversation if needed. Only for real (DB) listings.
 */
export async function postBookingMessage(opts: {
  listingId: string;
  seekerId: string;
  senderId: string;
  body: string;
}): Promise<void> {
  try {
    const listing = await getDbListing(opts.listingId);
    if (!listing || listing.owner_id === opts.seekerId) return;

    let conversationId: string | null = null;
    const { data: existing } = await supabaseAdmin
      .from("conversations")
      .select("id, owner_id")
      .eq("listing_id", listing.id)
      .eq("seeker_id", opts.seekerId)
      .maybeSingle();
    if (existing) {
      conversationId = existing.id;
      if (existing.owner_id !== listing.owner_id) {
        await supabaseAdmin
          .from("conversations")
          .update({ owner_id: listing.owner_id })
          .eq("id", existing.id);
      }
    } else {
      const ownerName = listing.contact_name?.trim() || (await getDisplayName(listing.owner_id));
      const { data: created, error } = await supabaseAdmin
        .from("conversations")
        .insert({
          listing_id: listing.id,
          seeker_id: opts.seekerId,
          owner_id: listing.owner_id,
          owner_name: ownerName,
          owner_phone: listing.contact_phone,
          listing_title: listing.title,
          listing_photo: listing.cover_photo_url,
        })
        .select("id")
        .single();
      if (error) {
        // Lost a race with a concurrent insert: re-read.
        const { data: again } = await supabaseAdmin
          .from("conversations")
          .select("id")
          .eq("listing_id", listing.id)
          .eq("seeker_id", opts.seekerId)
          .maybeSingle();
        conversationId = again?.id ?? null;
      } else {
        conversationId = created.id;
      }
    }
    if (!conversationId) return;

    const { error: mErr } = await supabaseAdmin.from("messages").insert({
      conversation_id: conversationId,
      sender_id: opts.senderId,
      body: opts.body.slice(0, 4000),
      kind: "booking",
    });
    if (mErr) console.error("[notify] booking message insert failed:", mErr.message);
  } catch (err) {
    console.error("[notify] booking message failed:", (err as Error).message);
  }
}

/* ------------------------------------------------------------------ */
/* Tour booking emails                                                */
/* ------------------------------------------------------------------ */

export type TourEvent = "requested" | "confirmed" | "declined" | "cancelled" | "completed";

export interface TourBookingInfo {
  id: string;
  listing_id: string;
  listing_title: string | null;
  owner_id: string | null;
  seeker_id: string;
  seeker_name: string | null;
  party_size: number;
  note: string | null;
  proposed_at: string | null;
  slot_starts_at?: string | null;
}

export function tourMessageBody(event: TourEvent, b: TourBookingInfo): string {
  const when = formatTourTime(b.slot_starts_at ?? b.proposed_at);
  const at = when ? ` for ${when}` : "";
  switch (event) {
    case "requested": {
      const party = b.party_size > 1 ? ` (${b.party_size} people)` : "";
      const note = b.note ? `\nNote: ${b.note}` : "";
      return `📅 Tour requested${at}${party}.${note}`;
    }
    case "confirmed":
      return `✅ Tour confirmed${at}.`;
    case "declined":
      return `❌ Tour request declined${at}.`;
    case "cancelled":
      return `🚫 Tour cancelled${at}.`;
    case "completed":
      return `🏠 Tour marked as completed.`;
  }
}

/** Email the other party about a tour event. `actorId` is who caused it. */
export async function notifyTourEvent(opts: {
  event: TourEvent;
  booking: TourBookingInfo;
  actorId: string;
}): Promise<void> {
  try {
    const { event, booking } = opts;
    if (event === "completed") return;
    const recipientId = opts.actorId === booking.seeker_id ? booking.owner_id : booking.seeker_id;
    if (!recipientId || recipientId === opts.actorId) return;

    const recipient = await getUserContact(recipientId);
    if (!recipient.email) return;
    const actorName =
      opts.actorId === booking.seeker_id
        ? booking.seeker_name || (await getDisplayName(opts.actorId)) || "A renter"
        : (await getDisplayName(opts.actorId)) || "The owner";

    const title = booking.listing_title || "your listing";
    const when = formatTourTime(booking.slot_starts_at ?? booking.proposed_at);
    const whenHtml = when ? `<p><strong>When:</strong> ${escapeHtml(when)}</p>` : "";
    const url = absoluteSiteUrl("/dashboard/tours");

    const subjects: Record<Exclude<TourEvent, "completed">, string> = {
      requested: `New tour request for ${title}`,
      confirmed: `Your tour of ${title} is confirmed`,
      declined: `Your tour request for ${title} was declined`,
      cancelled: `Tour of ${title} was cancelled`,
    };
    const headings: Record<Exclude<TourEvent, "completed">, string> = {
      requested: `${actorName} wants to visit ${title}`,
      confirmed: `${actorName} confirmed your visit to ${title}`,
      declined: `${actorName} couldn't host your visit to ${title}`,
      cancelled: `${actorName} cancelled the visit to ${title}`,
    };
    const extra =
      event === "requested" && booking.note
        ? `<p><strong>Note:</strong> ${escapeHtml(booking.note)}</p>`
        : "";
    const party =
      event === "requested" ? `<p><strong>People:</strong> ${booking.party_size}</p>` : "";

    await sendEmail({
      to: recipient.email,
      subject: subjects[event].slice(0, 150),
      html: renderEmail({
        heading: headings[event],
        bodyHtml: `${whenHtml}${party}${extra}`,
        cta: {
          label: event === "requested" ? "Review the request" : "View your tours",
          url,
        },
      }),
      text: `${headings[event]}${when ? `\nWhen: ${when}` : ""}\n\n${url}`,
    });
  } catch (err) {
    console.error("[notify] tour email failed:", (err as Error).message);
  }
}
