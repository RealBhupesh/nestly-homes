import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface TourSlotRow {
  id: string;
  listing_id: string;
  owner_id: string;
  starts_at: string;
  ends_at: string;
  capacity: number;
  note: string | null;
  created_at: string;
}

export interface TourBookingRow {
  id: string;
  slot_id: string | null;
  listing_id: string;
  listing_title: string | null;
  owner_id: string | null;
  seeker_id: string;
  status: "requested" | "confirmed" | "declined" | "cancelled" | "completed";
  party_size: number;
  note: string | null;
  seeker_name: string | null;
  seeker_phone: string | null;
  proposed_at: string | null;
  created_at: string;
  updated_at: string;
}

const SLOT_COLS = "id, listing_id, owner_id, starts_at, ends_at, capacity, note, created_at";
const BOOKING_COLS =
  "id, slot_id, listing_id, listing_title, owner_id, seeker_id, status, party_size, note, seeker_name, seeker_phone, proposed_at, created_at, updated_at";

const uuid = z.string().uuid();

/* ---------------- Owner: availability ---------------- */

export const listOwnerSlots = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("tour_slots")
      .select(SLOT_COLS)
      .eq("owner_id", context.userId)
      .order("starts_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as TourSlotRow[];
  });

const createSlotsSchema = z.object({
  listingId: uuid,
  slots: z
    .array(
      z.object({
        startsAt: z.string().datetime({ offset: true }),
        endsAt: z.string().datetime({ offset: true }),
        capacity: z.number().int().min(1).max(20).default(1),
        note: z.string().trim().max(200).optional(),
      }),
    )
    .min(1)
    .max(60),
});

export const createTourSlots = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => createSlotsSchema.parse(input))
  .handler(async ({ data, context }) => {
    const rows = data.slots
      .filter((s) => new Date(s.endsAt) > new Date(s.startsAt))
      .map((s) => ({
        listing_id: data.listingId,
        owner_id: context.userId,
        starts_at: s.startsAt,
        ends_at: s.endsAt,
        capacity: s.capacity,
        note: s.note ?? null,
      }));
    if (!rows.length) throw new Error("Each slot needs an end time after its start time.");
    const { data: inserted, error } = await context.supabase
      .from("tour_slots")
      .insert(rows)
      .select(SLOT_COLS);
    if (error) throw new Error(error.message);
    return (inserted ?? []) as TourSlotRow[];
  });

export const deleteTourSlot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { slotId: string }) => ({ slotId: uuid.parse(input.slotId) }))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("tour_slots")
      .delete()
      .eq("id", data.slotId)
      .eq("owner_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ---------------- Public: slots for a listing ---------------- */

export const listSlotsForListing = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { listingId: string }) => ({
    listingId: z.string().min(1).max(200).parse(input.listingId),
  }))
  .handler(async ({ data, context }) => {
    if (!uuid.safeParse(data.listingId).success)
      return [] as Array<TourSlotRow & { taken: number }>;
    const { data: slots, error } = await context.supabase
      .from("tour_slots")
      .select(SLOT_COLS)
      .eq("listing_id", data.listingId)
      .gte("starts_at", new Date().toISOString())
      .order("starts_at", { ascending: true })
      .limit(60);
    if (error) throw new Error(error.message);
    const ids = (slots ?? []).map((s) => s.id);
    const taken = new Map<string, number>();
    if (ids.length) {
      const { data: books } = await context.supabase
        .from("tour_bookings")
        .select("slot_id, status")
        .in("slot_id", ids)
        .in("status", ["requested", "confirmed"]);
      for (const b of books ?? []) {
        if (b.slot_id) taken.set(b.slot_id, (taken.get(b.slot_id) ?? 0) + 1);
      }
    }
    return (slots ?? []).map((s) => ({ ...s, taken: taken.get(s.id) ?? 0 })) as Array<
      TourSlotRow & { taken: number }
    >;
  });

/* ---------------- Bookings ---------------- */

// `ownerId` and `listingTitle` are accepted for backwards compatibility but
// ignored: the owner and title are derived server-side from the listing/slot.
const bookSchema = z.object({
  listingId: z.string().min(1).max(200),
  listingTitle: z.string().max(300).optional(),
  slotId: uuid.optional(),
  proposedAt: z.string().datetime({ offset: true }).optional(),
  ownerId: uuid.optional(),
  partySize: z.number().int().min(1).max(8).default(1),
  note: z.string().trim().max(600).optional(),
  name: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(24).optional(),
});

export const bookTour = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => bookSchema.parse(input))
  .handler(async ({ data, context }) => {
    if (!data.slotId && !data.proposedAt) throw new Error("Pick a time slot or propose a date.");

    const { enforceRateLimit } = await import("@/lib/rate-limit");
    await enforceRateLimit(
      `tour:${context.userId}`,
      10,
      3600,
      "Too many tour requests. Please try again later.",
    );

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const notify = await import("@/lib/notify.server");

    let listingId = data.listingId;
    let slotStartsAt: string | null = null;
    if (data.slotId) {
      const { data: slot } = await supabaseAdmin
        .from("tour_slots")
        .select("owner_id, listing_id, starts_at")
        .eq("id", data.slotId)
        .maybeSingle();
      if (!slot) throw new Error("That slot is no longer available.");
      if (slot.listing_id !== data.listingId)
        throw new Error("That slot belongs to a different listing.");
      listingId = slot.listing_id;
      slotStartsAt = slot.starts_at;
    }

    const listing = await notify.getDbListing(listingId);
    if (!listing || listing.status !== "published") {
      throw new Error("Tours can only be booked for live listings.");
    }
    if (listing.owner_id === context.userId)
      throw new Error("You can't book a tour of your own listing.");

    const { data: row, error } = await context.supabase
      .from("tour_bookings")
      .insert({
        slot_id: data.slotId ?? null,
        listing_id: listing.id,
        listing_title: listing.title,
        owner_id: listing.owner_id,
        seeker_id: context.userId,
        status: "requested",
        proposed_at: data.proposedAt ?? null,
        party_size: data.partySize,
        note: data.note ?? null,
        seeker_name: data.name ?? null,
        seeker_phone: data.phone ?? null,
      })
      .select(BOOKING_COLS)
      .single();
    if (error) throw new Error(error.message);
    const booking = row as TourBookingRow;

    const info = { ...booking, slot_starts_at: slotStartsAt };
    await notify.postBookingMessage({
      listingId: listing.id,
      seekerId: context.userId,
      senderId: context.userId,
      body: notify.tourMessageBody("requested", info),
    });
    await notify.notifyTourEvent({ event: "requested", booking: info, actorId: context.userId });
    return booking;
  });

export const listMyBookings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("tour_bookings")
      .select(BOOKING_COLS)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as TourBookingRow[];
    const slotIds = rows.map((r) => r.slot_id).filter(Boolean) as string[];
    const times = new Map<string, { starts_at: string; ends_at: string }>();
    if (slotIds.length) {
      const { data: slots } = await context.supabase
        .from("tour_slots")
        .select("id, starts_at, ends_at")
        .in("id", slotIds);
      for (const s of slots ?? []) times.set(s.id, { starts_at: s.starts_at, ends_at: s.ends_at });
    }
    return rows.map((r) => ({
      ...r,
      slot_starts_at: r.slot_id ? (times.get(r.slot_id)?.starts_at ?? null) : null,
      slot_ends_at: r.slot_id ? (times.get(r.slot_id)?.ends_at ?? null) : null,
    }));
  });

export type TourBookingWithTime = Awaited<ReturnType<typeof listMyBookings>>[number];

const statusSchema = z.object({
  bookingId: uuid,
  status: z.enum(["requested", "confirmed", "declined", "cancelled", "completed"]),
});

export const setBookingStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => statusSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: booking } = await context.supabase
      .from("tour_bookings")
      .select(BOOKING_COLS)
      .eq("id", data.bookingId)
      .maybeSingle();
    if (!booking) throw new Error("Booking not found.");
    const b = booking as TourBookingRow;
    const isOwner = b.owner_id !== null && b.owner_id === context.userId;
    const isSeeker = b.seeker_id === context.userId;
    if (!isOwner && !isSeeker) throw new Error("Not allowed.");
    if (data.status === "requested") throw new Error("A booking can't be moved back to requested.");
    // Seekers may only cancel; only the owner can confirm/decline/complete.
    if (!isOwner && data.status !== "cancelled") throw new Error("Only the owner can change this.");
    if (b.status === data.status) return { ok: true };

    const { error } = await context.supabase
      .from("tour_bookings")
      .update({ status: data.status })
      .eq("id", data.bookingId);
    if (error) throw new Error(error.message);

    if (data.status === "confirmed" || data.status === "declined" || data.status === "cancelled") {
      const notify = await import("@/lib/notify.server");
      let slotStartsAt: string | null = null;
      if (b.slot_id) {
        const { data: slot } = await context.supabase
          .from("tour_slots")
          .select("starts_at")
          .eq("id", b.slot_id)
          .maybeSingle();
        slotStartsAt = slot?.starts_at ?? null;
      }
      const info = { ...b, status: data.status, slot_starts_at: slotStartsAt };
      await notify.postBookingMessage({
        listingId: b.listing_id,
        seekerId: b.seeker_id,
        senderId: context.userId,
        body: notify.tourMessageBody(data.status, info),
      });
      await notify.notifyTourEvent({ event: data.status, booking: info, actorId: context.userId });
    }
    return { ok: true };
  });
