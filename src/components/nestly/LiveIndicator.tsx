import { useEffect, useState } from "react";

function formatRelative(from: Date, now: Date) {
  const s = Math.max(0, Math.floor((now.getTime() - from.getTime()) / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function LiveIndicator({ lastUpdated }: { lastUpdated: Date | null }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <span
      className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card px-3 py-1 text-[11px] text-ink/60"
      title={lastUpdated ? lastUpdated.toLocaleString() : "Waiting for first update"}
    >
      <span className="relative inline-flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
      </span>
      <span className="font-medium text-ink/70">Live</span>
      <span className="text-ink/40">·</span>
      <span>
        {lastUpdated ? `Updated ${formatRelative(lastUpdated, now)}` : "Connecting…"}
      </span>
    </span>
  );
}