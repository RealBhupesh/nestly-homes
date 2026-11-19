import { useEffect, useRef, useState } from "react";
import {
  COMMUTE_DESTS,
  MODE_ICON,
  MODE_LABEL,
  type CommuteMode,
  getDest,
  isCommuteMode,
} from "@/lib/commute";

export function CommuteFilter({
  destKey,
  mode,
  minutes,
  onChange,
}: {
  destKey: string;
  mode: string;
  minutes: number;
  onChange: (patch: { dest?: string; cmode?: string; cmax?: number }) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = Boolean(destKey && minutes > 0);
  const activeDest = getDest(destKey);
  const activeMode: CommuteMode = isCommuteMode(mode) ? mode : "bike";

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm transition ${
          active
            ? "border-primary bg-primary/10 text-primary"
            : "border-border bg-card text-ink hover:border-ink/30"
        }`}
      >
        <span aria-hidden>{MODE_ICON[activeMode]}</span>
        {active && activeDest
          ? `≤ ${minutes} min ${MODE_LABEL[activeMode].toLowerCase()} to ${activeDest.label.split(" ")[0]}`
          : "Commute time"}
        {active && (
          <span
            role="button"
            tabIndex={0}
            aria-label="Clear commute filter"
            onClick={(e) => {
              e.stopPropagation();
              onChange({ dest: "", cmode: "bike", cmax: 0 });
            }}
            className="ml-1 grid h-4 w-4 place-items-center rounded-full bg-primary text-[10px] text-cream"
          >
            ×
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-[320px] max-w-[calc(100vw-2rem)] rounded-2xl border border-border bg-card p-4 shadow-lift">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-ink/50">
            Destination
          </div>
          <ul className="mt-2 grid gap-1">
            {COMMUTE_DESTS.map((d) => (
              <li key={d.key}>
                <button
                  type="button"
                  onClick={() => onChange({ dest: d.key, cmax: minutes || 20 })}
                  className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-sm transition ${
                    destKey === d.key ? "bg-ink text-cream" : "hover:bg-muted"
                  }`}
                >
                  <span className="truncate">{d.label}</span>
                  <span
                    className={`ml-2 shrink-0 text-[11px] ${destKey === d.key ? "text-cream/70" : "text-ink/40"}`}
                  >
                    {d.hint}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <div className="mt-4 text-[11px] font-semibold uppercase tracking-wider text-ink/50">
            How you travel
          </div>
          <div className="mt-2 inline-flex w-full rounded-full bg-muted p-1 text-xs font-semibold">
            {(Object.keys(MODE_LABEL) as CommuteMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => onChange({ cmode: m })}
                className={`flex-1 rounded-full px-2 py-1.5 transition ${
                  activeMode === m ? "bg-card text-ink shadow-tactile" : "text-ink/60"
                }`}
              >
                <span className="mr-1" aria-hidden>
                  {MODE_ICON[m]}
                </span>
                {MODE_LABEL[m]}
              </button>
            ))}
          </div>

          <div className="mt-4 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-ink/50">
            <span>Max minutes</span>
            <span className="tabular text-sm text-ink">{minutes || 20}</span>
          </div>
          <input
            type="range"
            min={5}
            max={60}
            step={5}
            value={minutes || 20}
            onChange={(e) => onChange({ cmax: Number(e.target.value) })}
            className="mt-1 w-full accent-primary"
          />

          <div className="mt-4 flex items-center justify-between">
            <button
              type="button"
              onClick={() => {
                onChange({ dest: "", cmode: "bike", cmax: 0 });
                setOpen(false);
              }}
              className="text-xs font-medium text-ink/60 hover:text-ink"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-full bg-ink px-4 py-1.5 text-xs font-semibold text-cream shadow-tactile hover:-translate-y-0.5 hover:shadow-lift"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
