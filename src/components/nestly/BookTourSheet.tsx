import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { CalendarPlus, Check, Clock, Loader2, X } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { bookTour, listSlotsForListing, type TourSlotRow } from "@/lib/tours.functions";
import { buildIcs, downloadIcs } from "@/lib/ics";

type Slot = TourSlotRow & { taken: number };

function fmtDay(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function BookTourSheet({
  open,
  onClose,
  listingId,
  listingTitle,
  listingAddress,
  ownerName,
}: {
  open: boolean;
  onClose: () => void;
  listingId: string;
  listingTitle: string;
  listingAddress?: string;
  ownerName?: string;
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const fetchSlots = useServerFn(listSlotsForListing);
  const book = useServerFn(bookTour);

  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(false);
  const [slotId, setSlotId] = useState<string | null>(null);
  const [proposed, setProposed] = useState("");
  const [party, setParty] = useState(1);
  const [note, setNote] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ start: Date; end: Date } | null>(null);

  useEffect(() => {
    if (!open || !user) return;
    let alive = true;
    setLoading(true);
    fetchSlots({ data: { listingId } })
      .then((r) => alive && setSlots(r as Slot[]))
      .catch(() => {})
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [open, user?.id, listingId]);

  const grouped = useMemo(() => {
    const out = new Map<string, Slot[]>();
    for (const s of slots) {
      if (s.taken >= s.capacity) continue;
      const day = fmtDay(s.starts_at);
      out.set(day, [...(out.get(day) ?? []), s]);
    }
    return [...out.entries()];
  }, [slots]);

  if (!open) return null;

  const addToCalendar = () => {
    if (!done) return;
    downloadIcs(
      `nestly-tour-${listingId}`,
      buildIcs({
        uid: `${listingId}-${done.start.getTime()}`,
        title: `Property visit — ${listingTitle}`,
        description: `Visit arranged through Nestly${ownerName ? ` with ${ownerName}` : ""}.`,
        location: listingAddress,
        start: done.start,
        end: done.end,
      }),
    );
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) {
      onClose();
      navigate({ to: "/auth" });
      return;
    }
    if (!slotId && !proposed) {
      toast.error("Pick a slot or propose a date and time.");
      return;
    }
    setBusy(true);
    try {
      const slot = slots.find((s) => s.id === slotId);
      await book({
        data: {
          listingId,
          listingTitle,
          slotId: slotId ?? undefined,
          proposedAt: slot ? undefined : new Date(proposed).toISOString(),
          partySize: party,
          note: note.trim() || undefined,
          phone: phone.trim() || undefined,
        },
      });
      const start = slot ? new Date(slot.starts_at) : new Date(proposed);
      const end = slot ? new Date(slot.ends_at) : new Date(start.getTime() + 30 * 60000);
      setDone({ start, end });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not book that tour");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Book a tour" className="fixed inset-0 z-[95] flex items-end justify-center sm:items-center">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-ink/50 backdrop-blur-sm" />
      <div className="relative w-full max-w-lg rounded-t-3xl border border-ink/10 bg-background p-5 shadow-2xl sm:rounded-3xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink/45">Schedule</p>
            <h3 className="font-display text-xl font-semibold text-ink">{done ? "Tour requested" : "Book a tour"}</h3>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-full text-ink/50 hover:bg-ink/[0.05]">
            <X className="h-4 w-4" />
          </button>
        </div>

        {done ? (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-2xl border border-ink/[0.08] bg-card p-4">
              <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-ink text-background">
                <Check className="h-4 w-4" />
              </span>
              <div className="text-[13.5px] text-ink/75">
                <p className="font-semibold text-ink">
                  {fmtDay(done.start.toISOString())} · {fmtTime(done.start.toISOString())}
                </p>
                <p className="mt-1">We've sent your request. You'll get a confirmation once the owner accepts.</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={addToCalendar} className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full border border-ink/12 bg-background text-[13.5px] font-medium text-ink hover:bg-ink/[0.04]">
                <CalendarPlus className="h-4 w-4" /> Add to calendar
              </button>
              <button type="button" onClick={onClose} className="inline-flex h-11 flex-1 items-center justify-center rounded-full bg-ink text-[13.5px] font-semibold text-background hover:brightness-110">
                Done
              </button>
            </div>
          </div>
        ) : !user ? (
          <div className="space-y-4">
            <p className="text-[13.5px] text-ink/70">Sign in to book a visit — it keeps your tours and messages in one place.</p>
            <button type="button" onClick={() => { onClose(); navigate({ to: "/auth" }); }} className="h-11 w-full rounded-full bg-ink text-[13.5px] font-semibold text-background hover:brightness-110">
              Sign in to continue
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            {loading ? (
              <div className="flex h-16 items-center justify-center text-ink/50">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            ) : grouped.length > 0 ? (
              <div>
                <p className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-ink/45">Open slots</p>
                <div className="max-h-52 space-y-3 overflow-y-auto pr-1">
                  {grouped.map(([day, daySlots]) => (
                    <div key={day}>
                      <p className="mb-1.5 text-[12.5px] font-medium text-ink/70">{day}</p>
                      <div className="flex flex-wrap gap-2">
                        {daySlots.map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => { setSlotId(s.id === slotId ? null : s.id); setProposed(""); }}
                            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] transition ${
                              slotId === s.id ? "border-ink bg-ink text-background" : "border-ink/12 bg-background text-ink hover:border-ink/35"
                            }`}
                          >
                            <Clock className="h-3.5 w-3.5" /> {fmtTime(s.starts_at)}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="rounded-2xl bg-ink/[0.04] p-3 text-[13px] text-ink/60">
                No published slots yet — propose a time that works for you and the owner will confirm.
              </p>
            )}

            {!slotId && (
              <label className="block">
                <span className="text-[12px] font-semibold uppercase tracking-wider text-ink/45">Propose a time</span>
                <input
                  type="datetime-local"
                  value={proposed}
                  onChange={(e) => setProposed(e.target.value)}
                  className="mt-1 h-11 w-full rounded-xl border border-ink/10 bg-background px-3 text-[14px] text-ink outline-none focus:border-ink/40"
                />
              </label>
            )}

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-[12px] font-semibold uppercase tracking-wider text-ink/45">People</span>
                <input
                  type="number"
                  min={1}
                  max={8}
                  value={party}
                  onChange={(e) => setParty(Math.max(1, Math.min(8, Number(e.target.value) || 1)))}
                  className="mt-1 h-11 w-full rounded-xl border border-ink/10 bg-background px-3 text-[14px] text-ink outline-none focus:border-ink/40"
                />
              </label>
              <label className="block">
                <span className="text-[12px] font-semibold uppercase tracking-wider text-ink/45">Phone (optional)</span>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.slice(0, 24))}
                  placeholder="+91…"
                  className="mt-1 h-11 w-full rounded-xl border border-ink/10 bg-background px-3 text-[14px] text-ink outline-none focus:border-ink/40"
                />
              </label>
            </div>

            <label className="block">
              <span className="text-[12px] font-semibold uppercase tracking-wider text-ink/45">Note (optional)</span>
              <textarea
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, 600))}
                placeholder="Anything the owner should know?"
                className="mt-1 w-full resize-none rounded-xl border border-ink/10 bg-background p-3 text-[14px] text-ink outline-none focus:border-ink/40"
              />
            </label>

            <button
              type="submit"
              disabled={busy}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-ink text-[13.5px] font-semibold text-background transition hover:brightness-110 disabled:opacity-60"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Request tour
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
