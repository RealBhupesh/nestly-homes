import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CalendarPlus, Check, Loader2, Plus, Trash2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  createTourSlots,
  deleteTourSlot,
  listMyBookings,
  listOwnerSlots,
  setBookingStatus,
  type TourBookingWithTime,
  type TourSlotRow,
} from "@/lib/tours.functions";
import { buildIcs, downloadIcs } from "@/lib/ics";

export const Route = createFileRoute("/_authenticated/dashboard/tours")({
  component: ToursPage,
  head: () => ({
    meta: [
      { title: "Tours · Nestly" },
      { name: "description", content: "Manage viewing availability and tour requests for your Nestly listings." },
    ],
  }),
});

type Tab = "requests" | "availability";

const STATUS_STYLE: Record<string, string> = {
  requested: "bg-amber-500/12 text-amber-700",
  confirmed: "bg-emerald-500/12 text-emerald-700",
  declined: "bg-ink/[0.06] text-ink/55",
  cancelled: "bg-ink/[0.06] text-ink/55",
  completed: "bg-ink/[0.08] text-ink/70",
};

function when(b: TourBookingWithTime) {
  const iso = b.slot_starts_at ?? b.proposed_at;
  if (!iso) return "Time to confirm";
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

function ToursPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("requests");
  const [bookings, setBookings] = useState<TourBookingWithTime[]>([]);
  const [slots, setSlots] = useState<TourSlotRow[]>([]);
  const [listings, setListings] = useState<{ id: string; title: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const fetchBookings = useServerFn(listMyBookings);
  const fetchSlots = useServerFn(listOwnerSlots);
  const addSlots = useServerFn(createTourSlots);
  const removeSlot = useServerFn(deleteTourSlot);
  const changeStatus = useServerFn(setBookingStatus);

  // new-slot form
  const [listingId, setListingId] = useState("");
  const [date, setDate] = useState("");
  const [times, setTimes] = useState<string[]>(["10:00"]);
  const [capacity, setCapacity] = useState(1);
  const [saving, setSaving] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const [b, s] = await Promise.all([fetchBookings(), fetchSlots()]);
      setBookings(b);
      setSlots(s);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("listings")
      .select("id, title")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        const rows = (data ?? []) as { id: string; title: string }[];
        setListings(rows);
        setListingId((prev) => prev || rows[0]?.id || "");
      });
  }, [user?.id]);

  const incoming = useMemo(() => bookings.filter((b) => b.owner_id === user?.id), [bookings, user?.id]);
  const mine = useMemo(() => bookings.filter((b) => b.seeker_id === user?.id), [bookings, user?.id]);
  const titleFor = (id: string) => listings.find((l) => l.id === id)?.title ?? "Listing";

  async function act(id: string, status: "confirmed" | "declined" | "completed" | "cancelled") {
    setBusyId(id);
    try {
      await changeStatus({ data: { bookingId: id, status } });
      setBookings((prev) => prev.map((b) => (b.id === id ? { ...b, status } : b)));
      toast.success(`Tour ${status}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update");
    } finally {
      setBusyId(null);
    }
  }

  function calendarFor(b: TourBookingWithTime) {
    const iso = b.slot_starts_at ?? b.proposed_at;
    if (!iso) return;
    const start = new Date(iso);
    const end = b.slot_ends_at ? new Date(b.slot_ends_at) : new Date(start.getTime() + 30 * 60000);
    downloadIcs(
      `nestly-tour-${b.id.slice(0, 8)}`,
      buildIcs({
        uid: b.id,
        title: `Property visit — ${b.listing_title ?? titleFor(b.listing_id)}`,
        description: b.note ?? "Visit arranged through Nestly.",
        start,
        end,
      }),
    );
  }

  async function saveSlots(e: React.FormEvent) {
    e.preventDefault();
    if (!listingId) return toast.error("Pick a listing first.");
    if (!date) return toast.error("Choose a date.");
    const valid = times.filter(Boolean);
    if (!valid.length) return toast.error("Add at least one time.");
    setSaving(true);
    try {
      await addSlots({
        data: {
          listingId,
          slots: valid.map((t) => {
            const start = new Date(`${date}T${t}`);
            return {
              startsAt: start.toISOString(),
              endsAt: new Date(start.getTime() + 30 * 60000).toISOString(),
              capacity,
            };
          }),
        },
      });
      toast.success("Availability published");
      setTimes(["10:00"]);
      const s = await fetchSlots();
      setSlots(s);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save slots");
    } finally {
      setSaving(false);
    }
  }

  const upcomingSlots = useMemo(
    () => slots.filter((s) => new Date(s.starts_at).getTime() > Date.now() - 3600_000),
    [slots],
  );

  return (
    <div className="mx-auto max-w-[980px] px-4 py-8 sm:px-6 lg:py-12">
      <header className="mb-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink/45">Scheduling</p>
        <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">Tours</h1>
        <p className="mt-2 max-w-lg text-[14px] text-ink/60">
          Publish viewing windows once — seekers book themselves, and you approve with a tap.
        </p>
      </header>

      <div className="mb-6 inline-flex rounded-full border border-ink/10 bg-card p-1">
        {(["requests", "availability"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`h-9 rounded-full px-4 text-[13px] font-medium capitalize transition ${
              tab === t ? "bg-ink text-background" : "text-ink/60 hover:text-ink"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center text-ink/40">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : tab === "requests" ? (
        <div className="space-y-8">
          <section>
            <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-wider text-ink/45">
              Requests for your places ({incoming.length})
            </h2>
            {incoming.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-ink/12 p-6 text-center text-[13.5px] text-ink/55">
                No tour requests yet.
              </p>
            ) : (
              <ul className="space-y-3">
                {incoming.map((b) => (
                  <li key={b.id} className="rounded-2xl border border-ink/[0.08] bg-card p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-[14px] font-semibold text-ink">
                          {b.listing_title ?? titleFor(b.listing_id)}
                        </p>
                        <p className="mt-0.5 text-[13px] text-ink/60">
                          {when(b)} · {b.party_size} {b.party_size === 1 ? "person" : "people"}
                        </p>
                        {b.seeker_phone && <p className="mt-0.5 text-[12.5px] text-ink/55">{b.seeker_phone}</p>}
                        {b.note && <p className="mt-2 text-[13px] text-ink/70">“{b.note}”</p>}
                      </div>
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider ${STATUS_STYLE[b.status]}`}>
                        {b.status}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {b.status === "requested" && (
                        <>
                          <button
                            type="button"
                            disabled={busyId === b.id}
                            onClick={() => act(b.id, "confirmed")}
                            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-ink px-3.5 text-[12.5px] font-semibold text-background hover:brightness-110 disabled:opacity-60"
                          >
                            <Check className="h-3.5 w-3.5" /> Confirm
                          </button>
                          <button
                            type="button"
                            disabled={busyId === b.id}
                            onClick={() => act(b.id, "declined")}
                            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-ink/12 px-3.5 text-[12.5px] font-medium text-ink hover:bg-ink/[0.04] disabled:opacity-60"
                          >
                            <X className="h-3.5 w-3.5" /> Decline
                          </button>
                        </>
                      )}
                      {b.status === "confirmed" && (
                        <>
                          <button type="button" onClick={() => calendarFor(b)} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-ink/12 px-3.5 text-[12.5px] font-medium text-ink hover:bg-ink/[0.04]">
                            <CalendarPlus className="h-3.5 w-3.5" /> Add to calendar
                          </button>
                          <button type="button" disabled={busyId === b.id} onClick={() => act(b.id, "completed")} className="inline-flex h-9 items-center rounded-full border border-ink/12 px-3.5 text-[12.5px] font-medium text-ink hover:bg-ink/[0.04]">
                            Mark visited
                          </button>
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-wider text-ink/45">
              Tours you booked ({mine.length})
            </h2>
            {mine.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-ink/12 p-6 text-center text-[13.5px] text-ink/55">
                You haven't booked any visits yet.
              </p>
            ) : (
              <ul className="space-y-3">
                {mine.map((b) => (
                  <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-ink/[0.08] bg-card p-4">
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-semibold text-ink">{b.listing_title ?? "Listing"}</p>
                      <p className="mt-0.5 text-[13px] text-ink/60">{when(b)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider ${STATUS_STYLE[b.status]}`}>
                        {b.status}
                      </span>
                      {b.status === "confirmed" && (
                        <button type="button" onClick={() => calendarFor(b)} aria-label="Add to calendar" className="grid h-9 w-9 place-items-center rounded-full border border-ink/12 text-ink hover:bg-ink/[0.04]">
                          <CalendarPlus className="h-4 w-4" />
                        </button>
                      )}
                      {(b.status === "requested" || b.status === "confirmed") && (
                        <button type="button" disabled={busyId === b.id} onClick={() => act(b.id, "cancelled")} className="h-9 rounded-full border border-ink/12 px-3.5 text-[12.5px] font-medium text-ink hover:bg-ink/[0.04]">
                          Cancel
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
          <form onSubmit={saveSlots} className="h-fit space-y-4 rounded-2xl border border-ink/[0.08] bg-card p-5">
            <h2 className="text-[14px] font-semibold text-ink">Add viewing windows</h2>
            <label className="block">
              <span className="text-[12px] font-semibold uppercase tracking-wider text-ink/45">Listing</span>
              <select
                value={listingId}
                onChange={(e) => setListingId(e.target.value)}
                className="mt-1 h-11 w-full rounded-xl border border-ink/10 bg-background px-3 text-[14px] text-ink outline-none focus:border-ink/40"
              >
                {listings.length === 0 && <option value="">No listings yet</option>}
                {listings.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-[12px] font-semibold uppercase tracking-wider text-ink/45">Date</span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="mt-1 h-11 w-full rounded-xl border border-ink/10 bg-background px-3 text-[14px] text-ink outline-none focus:border-ink/40"
              />
            </label>
            <div>
              <span className="text-[12px] font-semibold uppercase tracking-wider text-ink/45">Times (30 min each)</span>
              <div className="mt-1 space-y-2">
                {times.map((t, i) => (
                  <div key={i} className="flex gap-2">
                    <input
                      type="time"
                      value={t}
                      onChange={(e) => setTimes((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))}
                      className="h-11 flex-1 rounded-xl border border-ink/10 bg-background px-3 text-[14px] text-ink outline-none focus:border-ink/40"
                    />
                    {times.length > 1 && (
                      <button type="button" aria-label="Remove time" onClick={() => setTimes((p) => p.filter((_, j) => j !== i))} className="grid h-11 w-11 place-items-center rounded-xl border border-ink/10 text-ink/50 hover:text-ink">
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => setTimes((p) => [...p, "16:00"])} className="mt-2 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-ink/65 hover:text-ink">
                <Plus className="h-3.5 w-3.5" /> Add another time
              </button>
            </div>
            <label className="block">
              <span className="text-[12px] font-semibold uppercase tracking-wider text-ink/45">Capacity per slot</span>
              <input
                type="number"
                min={1}
                max={20}
                value={capacity}
                onChange={(e) => setCapacity(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
                className="mt-1 h-11 w-full rounded-xl border border-ink/10 bg-background px-3 text-[14px] text-ink outline-none focus:border-ink/40"
              />
            </label>
            <button
              type="submit"
              disabled={saving || !listings.length}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-ink text-[13.5px] font-semibold text-background hover:brightness-110 disabled:opacity-60"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} Publish availability
            </button>
          </form>

          <section>
            <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-wider text-ink/45">
              Upcoming slots ({upcomingSlots.length})
            </h2>
            {upcomingSlots.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-ink/12 p-6 text-center text-[13.5px] text-ink/55">
                Nothing published yet.
              </p>
            ) : (
              <ul className="divide-y divide-ink/[0.06] rounded-2xl border border-ink/[0.08] bg-card">
                {upcomingSlots.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <p className="text-[13.5px] font-medium text-ink">
                        {new Date(s.starts_at).toLocaleString(undefined, {
                          weekday: "short",
                          day: "numeric",
                          month: "short",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </p>
                      <p className="truncate text-[12.5px] text-ink/55">
                        {titleFor(s.listing_id)} · up to {s.capacity}
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-label="Delete slot"
                      onClick={async () => {
                        try {
                          await removeSlot({ data: { slotId: s.id } });
                          setSlots((p) => p.filter((x) => x.id !== s.id));
                        } catch {
                          toast.error("Could not delete");
                        }
                      }}
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink/45 hover:bg-ink/[0.05] hover:text-ink"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
