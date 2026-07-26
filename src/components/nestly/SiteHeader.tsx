import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Logo } from "./Logo";
import { useAuth } from "@/hooks/use-auth";

export function SiteHeader() {
  const { user, loading } = useAuth();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // Close on route change
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Track scroll for premium elevation change
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Lock body scroll while the mobile sheet is open
  useEffect(() => {
    if (typeof document === "undefined") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = open ? "hidden" : prev;
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <header className="fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:px-4 sm:pt-4">
      <div
        className={`relative mx-auto flex max-w-6xl items-center gap-3 rounded-2xl border px-3 py-2 transition-all duration-300 sm:gap-6 sm:px-4 sm:py-2.5 ${
          scrolled
            ? "border-ink/10 bg-background/80 shadow-[0_10px_40px_-12px_rgba(29,29,40,0.18)] backdrop-blur-2xl"
            : "border-ink/5 bg-background/60 shadow-[0_2px_20px_-8px_rgba(29,29,40,0.06)] backdrop-blur-xl"
        }`}
      >
        {/* Inner glass highlight */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-b from-white/60 to-transparent opacity-70 [mask-image:linear-gradient(to_bottom,black,transparent_60%)]"
        />

        {/* Left: logo */}
        <div className="relative flex min-w-0 flex-1 items-center">
          <Logo />
        </div>

        {/* Center: pill nav */}
        <nav className="relative hidden md:block">
          <ul className="flex items-center gap-0.5">
            <NavPill to="/search" search={{ mode: "rent" }}>Rent</NavPill>
            <NavPill to="/search" search={{ mode: "sale" }}>Buy</NavPill>
            <NavPill to={user ? "/dashboard/new" : "/auth"} live>List a place</NavPill>
            <NavPill to="/" hash="how">How it works</NavPill>
          </ul>
        </nav>

        {/* Right: auth */}
        <div className="relative flex flex-1 items-center justify-end gap-2 sm:gap-3">
          {!loading && !user && (
            <Link
              to="/auth"
              className="hidden text-[12.5px] font-medium tracking-tight text-ink/60 transition hover:text-ink sm:inline-block"
            >
              Log in
            </Link>
          )}
          {user ? (
            <CtaLink to="/dashboard" label="Dashboard" />
          ) : (
            <CtaLink to="/auth" label="Get started" />
          )}

          {/* Mobile menu toggle */}
          <button
            type="button"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="mobile-nav"
            onClick={() => setOpen((v) => !v)}
            className="relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-ink/10 bg-background/80 text-ink transition hover:bg-background md:hidden"
          >
            <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
              {open ? (
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              ) : (
                <path d="M4 8h16M4 16h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile sheet */}
      <div
        id="mobile-nav"
        className={`fixed inset-0 z-40 md:hidden ${open ? "pointer-events-auto" : "pointer-events-none"}`}
        role="dialog"
        aria-modal="true"
        aria-label="Main menu"
      >
        {/* Scrim */}
        <button
          type="button"
          aria-hidden={!open}
          tabIndex={-1}
          onClick={() => setOpen(false)}
          className={`absolute inset-0 bg-ink/40 backdrop-blur-md transition-opacity duration-300 ${open ? "opacity-100" : "opacity-0"}`}
        />
        {/* Drawer panel */}
        <aside
          className={`absolute right-0 top-0 flex h-full w-[88%] max-w-sm flex-col overflow-hidden border-l border-ink/10 bg-background shadow-[-24px_0_60px_-20px_rgba(29,29,40,0.35)] transition-transform duration-[420ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
            open ? "translate-x-0" : "translate-x-full"
          }`}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-ink/[0.06] px-5 py-4">
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink/50">Menu</span>
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => setOpen(false)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-ink/10 text-ink transition hover:bg-ink/[0.04] active:scale-95"
            >
              <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto px-4 pb-6 pt-4">
            <DrawerSection label="Browse" open={open} delay={60}>
              <DrawerItem to="/search" search={{ mode: "rent" }} icon="rent" title="Rent" subtitle="Rooms, PGs & flats to rent" />
              <DrawerItem to="/search" search={{ mode: "sale" }} icon="buy" title="Buy" subtitle="Homes for sale near you" />
            </DrawerSection>

            <DrawerSection label="For owners" open={open} delay={140}>
              <DrawerItem
                to={user ? "/dashboard/new" : "/auth"}
                icon="list"
                title="List a place"
                subtitle="Post in under 3 minutes"
                accent
              />
            </DrawerSection>

            <DrawerSection label="Account" open={open} delay={220}>
              {user ? (
                <DrawerItem to="/dashboard" icon="dashboard" title="Dashboard" subtitle="Manage your listings" />
              ) : (
                <DrawerItem to="/auth" icon="dashboard" title="Sign in" subtitle="Access your dashboard" />
              )}
            </DrawerSection>

            <DrawerSection label="Support" open={open} delay={300}>
              <DrawerItem to="/" hash="how" icon="help" title="Help" subtitle="How Nestly works & FAQs" />
            </DrawerSection>
          </div>

          {/* Footer */}
          <div className="border-t border-ink/[0.06] px-5 py-4">
            <div className="flex items-center gap-2 text-[11px] font-medium tracking-tight text-ink/50">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-coral opacity-60" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-coral" />
              </span>
              0% broker fees. Always.
            </div>
          </div>
        </aside>
      </div>
    </header>
  );
}

type NavPillProps = {
  to: string;
  search?: Record<string, unknown>;
  hash?: string;
  children: React.ReactNode;
  live?: boolean;
};

function NavPill({ to, search, hash, children, live }: NavPillProps) {
  return (
    <li>
      <Link
        to={to}
        search={search as never}
        hash={hash}
        activeOptions={{ exact: true }}
        activeProps={{ className: "text-ink bg-ink/[0.06]" }}
        inactiveProps={{ className: "text-ink/55 hover:text-ink" }}
        className="group relative inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-medium tracking-[-0.005em] transition-colors"
      >
        {live && (
          <span aria-hidden className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-coral opacity-60" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-coral" />
          </span>
        )}
        {children}
      </Link>
    </li>
  );
}

function CtaLink({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className="group relative inline-flex items-center gap-2 overflow-hidden rounded-full bg-ink px-4 py-2 text-[12.5px] font-semibold tracking-tight text-background transition-all duration-300 hover:pr-5"
    >
      {/* Sheen */}
      <span
        aria-hidden
        className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 group-hover:translate-x-full"
      />
      {/* Coral glow */}
      <span
        aria-hidden
        className="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{ background: "radial-gradient(120% 100% at 100% 50%, rgba(255,90,95,0.35), transparent 60%)" }}
      />
      <span className="relative whitespace-nowrap">{label}</span>
      <span aria-hidden className="relative inline-flex h-4 w-4 items-center justify-center overflow-hidden">
        <svg viewBox="0 0 24 24" fill="none" className="h-3 w-3 text-background transition-transform duration-300 group-hover:translate-x-0.5">
          <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    </Link>
  );
}

function DrawerSection({
  label,
  children,
  open,
  delay,
}: {
  label: string;
  children: React.ReactNode;
  open: boolean;
  delay: number;
}) {
  return (
    <div
      className="mb-5 last:mb-0"
      style={{
        opacity: open ? 1 : 0,
        transform: open ? "translateX(0)" : "translateX(16px)",
        transition: `opacity 400ms ease ${delay}ms, transform 500ms cubic-bezier(0.22,1,0.36,1) ${delay}ms`,
      }}
    >
      <div className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-ink/40">
        {label}
      </div>
      <ul className="flex flex-col gap-1">{children}</ul>
    </div>
  );
}

type DrawerIcon = "rent" | "buy" | "list" | "dashboard" | "help";

function DrawerItem({
  to,
  search,
  hash,
  icon,
  title,
  subtitle,
  accent,
}: {
  to: string;
  search?: Record<string, unknown>;
  hash?: string;
  icon: DrawerIcon;
  title: string;
  subtitle: string;
  accent?: boolean;
}) {
  return (
    <li>
      <Link
        to={to}
        search={search as never}
        hash={hash}
        activeProps={{ className: "bg-ink/[0.05]" }}
        inactiveProps={{ className: "hover:bg-ink/[0.03] active:bg-ink/[0.06]" }}
        className="group relative flex items-center gap-3.5 rounded-2xl px-3 py-3 transition-colors"
      >
        <span
          className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-all duration-300 group-active:scale-95 ${
            accent
              ? "border-coral/20 bg-coral/10 text-coral group-hover:bg-coral group-hover:text-background"
              : "border-ink/10 bg-ink/[0.03] text-ink group-hover:bg-ink group-hover:text-background"
          }`}
        >
          <DrawerGlyph name={icon} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold tracking-tight text-ink">{title}</span>
          <span className="block truncate text-[12.5px] text-ink/50">{subtitle}</span>
        </span>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          className="h-4 w-4 shrink-0 text-ink/30 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:text-ink/60"
        >
          <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </Link>
    </li>
  );
}

function DrawerGlyph({ name }: { name: DrawerIcon }) {
  const stroke = { stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round", fill: "none" } as const;
  switch (name) {
    case "rent":
      return (
        <svg viewBox="0 0 24 24" className="h-5 w-5">
          <path d="M3 21V10l9-7 9 7v11" {...stroke} />
          <path d="M9 21v-6h6v6" {...stroke} />
        </svg>
      );
    case "buy":
      return (
        <svg viewBox="0 0 24 24" className="h-5 w-5">
          <path d="M4 10l8-6 8 6v10a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1V10z" {...stroke} />
          <circle cx="12" cy="13" r="1.4" {...stroke} />
        </svg>
      );
    case "list":
      return (
        <svg viewBox="0 0 24 24" className="h-5 w-5">
          <path d="M12 5v14M5 12h14" {...stroke} />
        </svg>
      );
    case "dashboard":
      return (
        <svg viewBox="0 0 24 24" className="h-5 w-5">
          <rect x="3" y="3" width="8" height="10" rx="1.5" {...stroke} />
          <rect x="13" y="3" width="8" height="6" rx="1.5" {...stroke} />
          <rect x="13" y="11" width="8" height="10" rx="1.5" {...stroke} />
          <rect x="3" y="15" width="8" height="6" rx="1.5" {...stroke} />
        </svg>
      );
    case "help":
      return (
        <svg viewBox="0 0 24 24" className="h-5 w-5">
          <circle cx="12" cy="12" r="9" {...stroke} />
          <path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 1.7-2.5 2-2.5 4" {...stroke} />
          <circle cx="12" cy="17" r="0.6" fill="currentColor" />
        </svg>
      );
  }
}