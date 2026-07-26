import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";

type Mode = "rent" | "sale";

export function SearchBar() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("rent");
  const [location, setLocation] = useState("");
  const [budget, setBudget] = useState("");
  const [type, setType] = useState("any");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        navigate({
          to: "/search",
          search: {
            mode,
            q: location,
            type,
            max: Number(budget) || 0,
            furn: "any",
            sort: "fresh",
            view: "split",
          },
        });
      }}
      className="w-full rounded-3xl border border-border bg-card p-3 shadow-lift"
    >
      {/* Rent/Sale toggle */}
      <div className="mb-3 inline-flex rounded-full bg-muted p-1 text-sm font-semibold">
        {(["rent", "sale"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`rounded-full px-4 py-1.5 transition ${
              mode === m ? "bg-card text-ink shadow-tactile" : "text-ink/60 hover:text-ink"
            }`}
          >
            {m === "rent" ? "For rent" : "For sale"}
          </button>
        ))}
      </div>

      <div className="grid gap-2 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
        <label className="group flex min-w-0 flex-col rounded-2xl bg-muted/60 px-4 py-2.5 transition focus-within:ring-2 focus-within:ring-primary">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-ink/50">Where</span>
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Neighborhood, campus, or landmark"
            className="min-w-0 bg-transparent text-sm text-ink placeholder:text-ink/40 focus:outline-none"
          />
        </label>
        <label className="flex flex-col rounded-2xl bg-muted/60 px-4 py-2.5 transition focus-within:ring-2 focus-within:ring-primary">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-ink/50">Budget</span>
          <input
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            inputMode="numeric"
            placeholder={mode === "rent" ? "Up to ₹/mo" : "Up to ₹"}
            className="tabular bg-transparent text-sm text-ink placeholder:text-ink/40 focus:outline-none"
          />
        </label>
        <label className="flex flex-col rounded-2xl bg-muted/60 px-4 py-2.5 transition focus-within:ring-2 focus-within:ring-primary">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-ink/50">Type</span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="bg-transparent text-sm text-ink focus:outline-none"
          >
            <option value="any">Any</option>
            <option value="room">Private room</option>
            <option value="pg">PG / hostel</option>
            <option value="flat">Whole flat</option>
            <option value="house">House</option>
          </select>
        </label>
        <button
          type="submit"
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-coral-gradient px-5 py-3 text-sm font-semibold text-primary-foreground shadow-tactile transition hover:-translate-y-0.5 hover:shadow-lift"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
          Search
        </button>
      </div>
    </form>
  );
}