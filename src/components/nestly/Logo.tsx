import { Link } from "@tanstack/react-router";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link
      to="/"
      className={`group inline-flex items-center gap-2.5 text-ink ${className}`}
      aria-label="Nestly"
    >
      <span className="relative inline-flex h-7 w-7 items-center justify-center">
        <span aria-hidden className="absolute inset-0 rounded-[10px] bg-ink" />
        <span aria-hidden className="absolute inset-0 rounded-[10px] bg-gradient-to-br from-white/20 via-transparent to-transparent" />
        <svg viewBox="0 0 24 24" fill="none" className="relative h-4 w-4 text-background">
          <path d="M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1h-4v-5h-6v5H5a1 1 0 0 1-1-1v-7.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        </svg>
      </span>
      <span className="flex items-baseline gap-0.5 text-[17px] font-semibold leading-none tracking-[-0.02em]">
        Nestly<span className="text-coral">.</span>
      </span>
    </Link>
  );
}