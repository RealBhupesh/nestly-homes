import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { parseNaturalSearch } from "@/lib/nl-search.functions";

const EXAMPLES = [
  "quiet 1BHK under 15k near COEP with a balcony",
  "furnished PG near Koregaon Park, cheapest first",
  "3 bedroom house for sale under 1.5 cr",
];

export function NaturalSearchBar({
  onApply,
}: {
  onApply: (patch: Record<string, string | number>) => void;
}) {
  const parse = useServerFn(parseNaturalSearch);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastApplied, setLastApplied] = useState<string[] | null>(null);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { patch } = await parse({ data: { query: q } });
      const keys = Object.keys(patch);
      if (keys.length === 0) {
        setError("Couldn't extract filters — try being more specific.");
      } else {
        onApply(patch);
        setLastApplied(keys);
        setTimeout(() => setOpen(false), 600);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus(), 40);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => { clearTimeout(t); window.removeEventListener("keydown", onKey); };
  }, [open]);

  return (
    <>
      {/* Floating AI trigger — bottom-center */}
      <button
        type="button"
        aria-label="Ask Nestly AI"
        onClick={() => setOpen(true)}
        className="group fixed bottom-6 left-1/2 z-40 -translate-x-1/2 grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-primary via-primary to-fuchsia-600 text-cream shadow-lift transition hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-12px_rgba(126,34,206,0.55)] sm:bottom-8 sm:h-16 sm:w-16"
        style={{ bottom: "calc(1.5rem + env(safe-area-inset-bottom))" }}
      >
        <span className="absolute inset-0 rounded-full bg-primary/40 opacity-60 blur-xl transition group-hover:opacity-90" aria-hidden />
        <svg viewBox="0 0 24 24" className="relative h-6 w-6 sm:h-7 sm:w-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3l1.6 4.2L18 8.8l-4.4 1.6L12 14.6l-1.6-4.2L6 8.8l4.4-1.6z" />
          <path d="M18.5 14.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z" />
        </svg>
      </button>

      {/* Bottom sheet — Living Journal */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center px-3 sm:items-center sm:px-4">
          <div
            className="absolute inset-0 bg-ink/45 backdrop-blur-md animate-in fade-in duration-200"
            onClick={() => setOpen(false)}
          />
          <div
            className="relative w-full max-w-lg overflow-hidden rounded-t-[2.25rem] border border-b-0 border-ink/[0.06] bg-[#FDFCF8] shadow-[0_-30px_80px_-20px_rgba(29,29,40,0.35)] animate-in slide-in-from-bottom-8 fade-in duration-300 sm:rounded-[2.25rem] sm:border-b sm:shadow-[0_30px_80px_-20px_rgba(29,29,40,0.35)]"
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
          >
            {/* Editorial accent bar */}
            <div className="absolute inset-x-0 top-0 flex h-1.5">
              <div className="h-full flex-1 bg-coral/40" />
              <div className="h-full flex-1 bg-teal/40" />
              <div className="h-full flex-1 bg-coral/40" />
            </div>

            {/* Grabber (mobile only) */}
            <div className="flex justify-center pt-3 sm:hidden">
              <span className="h-1 w-10 rounded-full bg-ink/10" />
            </div>

            <div className="px-6 pb-8 pt-6 sm:px-8 sm:pt-8">
              {/* Header */}
              <div className="mb-7 flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <h2 className="flex items-center gap-2.5 font-display text-2xl font-semibold tracking-tight text-ink">
                    Ask Nestly AI
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal/60 opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-teal" />
                    </span>
                  </h2>
                  <p className="text-[13.5px] italic text-ink/55" style={{ fontFamily: "'Lora', serif" }}>
                    Your personal housing journal assistant
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="grid h-9 w-9 place-items-center rounded-full text-ink/40 transition hover:bg-ink/[0.04] hover:text-ink"
                  aria-label="Close"
                >
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
                </button>
              </div>

              {/* Input */}
              <form
                onSubmit={(e) => { e.preventDefault(); void submit(value); }}
                className="relative mb-7 group"
              >
                <div aria-hidden className="pointer-events-none absolute -inset-0.5 rounded-[1.15rem] bg-gradient-to-r from-teal/25 to-coral/25 opacity-30 blur transition duration-500 group-focus-within:opacity-100" />
                <div className="relative">
                  <textarea
                    ref={inputRef as unknown as React.RefObject<HTMLTextAreaElement>}
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void submit(value); }
                    }}
                    placeholder="Describe your ideal place — quiet 1BHK under 15k near COEP with a balcony"
                    disabled={busy}
                    rows={3}
                    className="min-h-[128px] w-full resize-none rounded-2xl border border-ink/[0.08] bg-background px-5 pb-16 pt-5 text-[15px] leading-relaxed text-ink shadow-sm outline-none transition placeholder:text-ink/35 focus:border-teal focus:ring-0 disabled:opacity-60"
                  />
                  <button
                    type="submit"
                    disabled={busy || !value.trim()}
                    className="absolute bottom-3.5 right-3.5 inline-flex h-11 items-center gap-2 rounded-xl bg-ink px-4 text-[12.5px] font-semibold text-background transition hover:brightness-110 disabled:opacity-40"
                    aria-label="Search"
                  >
                    {busy ? "Thinking…" : "Search"}
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                  </button>
                </div>
              </form>

              {/* Curated prompts */}
              <div className="space-y-3">
                <p className="px-1 text-[10px] font-bold uppercase tracking-[0.2em] text-ink/40">
                  Editorial curation
                </p>
                <ul className="space-y-2.5">
                  {EXAMPLES.map((ex, i) => {
                    const accent = i % 2 === 0 ? "teal" : "coral";
                    return (
                      <li key={ex}>
                        <button
                          type="button"
                          onClick={() => { setValue(ex); void submit(ex); }}
                          disabled={busy}
                          className={`group/item flex w-full items-center gap-4 rounded-xl border border-ink/[0.06] bg-white/60 p-3.5 text-left transition disabled:opacity-40 ${
                            accent === "teal"
                              ? "hover:border-teal/25 hover:bg-teal/[0.05]"
                              : "hover:border-coral/25 hover:bg-coral/[0.05]"
                          }`}
                        >
                          <span
                            className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-ink/[0.04] transition-colors ${
                              accent === "teal"
                                ? "text-teal group-hover/item:bg-teal group-hover/item:text-background"
                                : "text-coral group-hover/item:bg-coral group-hover/item:text-background"
                            }`}
                          >
                            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                              {accent === "teal" ? (
                                <>
                                  <path d="M3 11l9-7 9 7" />
                                  <path d="M5 10v10h14V10" />
                                </>
                              ) : (
                                <>
                                  <path d="M12 22s-7-5.5-7-12a7 7 0 1114 0c0 6.5-7 12-7 12z" />
                                  <circle cx="12" cy="10" r="2.5" />
                                </>
                              )}
                            </svg>
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13.5px] font-semibold text-ink">{ex}</span>
                            <span className="mt-0.5 block text-[11.5px] text-ink/50">Tap to search this instantly</span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>

                <div className="min-h-[16px] pt-2 text-[11.5px]">
                  {lastApplied && !error && (
                    <p className="text-ink/60">
                      Applied <span className="font-semibold text-teal">{lastApplied.join(", ")}</span>
                    </p>
                  )}
                  {error && <p className="text-coral">{error}</p>}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}