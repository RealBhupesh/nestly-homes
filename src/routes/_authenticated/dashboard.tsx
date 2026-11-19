import { createFileRoute, Outlet, Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Toaster } from "@/components/ui/sonner";
import { getIsAdmin } from "@/lib/admin.functions";
import { useAuth, useSignOut } from "@/hooks/use-auth";
import { getUnreadCount } from "@/lib/messaging.functions";
import {
  ShieldCheck,
  LayoutGrid,
  Bookmark,
  Plus,
  Home,
  LogOut,
  Menu,
  X,
  LifeBuoy,
  Sparkles,
  MessageSquare,
  CalendarDays,
  BadgeCheck,
  UserRound,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardLayout,
});

const NAV = [
  {
    to: "/dashboard",
    label: "Listings",
    icon: LayoutGrid,
    match: (p: string) => p === "/dashboard" || p === "/dashboard/",
  },
  {
    to: "/dashboard/inbox",
    label: "Inbox",
    icon: MessageSquare,
    match: (p: string) => p.includes("/dashboard/inbox"),
    badgeKey: "inbox" as const,
  },
  {
    to: "/dashboard/tours",
    label: "Tours",
    icon: CalendarDays,
    match: (p: string) => p.includes("/dashboard/tours"),
  },
  {
    to: "/dashboard/saved",
    label: "Saved searches",
    icon: Bookmark,
    match: (p: string) => p.includes("/dashboard/saved"),
  },
  {
    to: "/dashboard/verify",
    label: "Verification",
    icon: BadgeCheck,
    match: (p: string) => p.includes("/dashboard/verify"),
  },
  {
    to: "/dashboard/new",
    label: "New listing",
    icon: Plus,
    match: (p: string) => p.includes("/dashboard/new"),
  },
  {
    to: "/dashboard/account",
    label: "Account",
    icon: UserRound,
    match: (p: string) => p.includes("/dashboard/account"),
  },
] as const;

function DashboardLayout() {
  const signOut = useSignOut();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [isAdmin, setIsAdmin] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const { user } = useAuth();

  useEffect(() => {
    getIsAdmin()
      .then((r) => setIsAdmin(r.isAdmin))
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (!user) return;
    let alive = true;
    const load = () =>
      getUnreadCount()
        .then((r) => {
          if (alive) setUnread(r.count);
        })
        .catch(() => {});
    load();
    const ch = supabase
      .channel("dash-unread")
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, load)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, load)
      .subscribe();
    return () => {
      alive = false;
      supabase.removeChannel(ch);
    };
  }, [user?.id]);
  useEffect(() => setMobileOpen(false), [pathname]);

  const displayName =
    (user?.user_metadata?.full_name as string | undefined) ||
    user?.email ||
    (user?.phone ? `+${user.phone.replace(/^\+/, "")}` : "") ||
    "Your account";
  const initials = (displayName.replace(/^\+/, "").trim().slice(0, 2) || "N").toUpperCase();

  return (
    <div className="min-h-screen bg-[color-mix(in_oklab,var(--cream)_65%,white)] text-ink">
      <Toaster richColors position="top-center" />

      <div className="flex min-h-screen w-full">
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-border/60 bg-card/60 backdrop-blur lg:flex">
          <div className="flex h-16 items-center gap-2 px-6">
            <Link
              to="/"
              className="flex items-center gap-2 text-[15px] font-semibold tracking-tight text-ink"
            >
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-ink text-[11px] text-cream">
                N
              </span>
              Nestly
            </Link>
          </div>

          <SideNav pathname={pathname} unread={unread} onSelect={() => {}} />

          <div className="mt-auto space-y-3 border-t border-border/60 p-4">
            {isAdmin && (
              <Link
                to="/admin"
                className="flex items-center gap-2 rounded-xl bg-ink px-3 py-2 text-[12px] font-medium text-cream transition hover:bg-ink/85"
              >
                <ShieldCheck className="h-3.5 w-3.5" /> Admin console
              </Link>
            )}
            <Link
              to="/"
              className="flex items-center gap-2 rounded-xl border border-border/70 px-3 py-2 text-[12px] text-ink/70 hover:border-ink hover:text-ink"
            >
              <Home className="h-3.5 w-3.5" /> View site
            </Link>
            <div className="flex items-center gap-2.5 rounded-xl bg-muted/60 p-2.5">
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-ink text-[11px] font-medium text-cream">
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                <Link
                  to="/dashboard/account"
                  className="block truncate text-[12px] font-medium text-ink hover:underline"
                >
                  {displayName}
                </Link>
                <p className="text-[10px] uppercase tracking-wider text-ink/45">Owner</p>
              </div>
              <button
                onClick={signOut}
                aria-label="Sign out"
                className="rounded-md p-1.5 text-ink/50 hover:bg-background hover:text-ink"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </aside>

        {mobileOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
            <aside className="absolute inset-y-0 left-0 flex w-72 flex-col bg-card">
              <div className="flex h-16 items-center justify-between border-b border-border/60 px-5">
                <Link to="/" className="text-[14px] font-semibold tracking-tight text-ink">
                  Nestly · Owner
                </Link>
                <button
                  onClick={() => setMobileOpen(false)}
                  className="rounded-full p-1.5 hover:bg-muted"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <SideNav pathname={pathname} unread={unread} onSelect={() => setMobileOpen(false)} />
              <div className="mt-auto space-y-2 border-t border-border/60 p-4">
                {isAdmin && (
                  <Link
                    to="/admin"
                    className="flex items-center gap-2 rounded-xl bg-ink px-3 py-2 text-[12px] font-medium text-cream"
                  >
                    <ShieldCheck className="h-3.5 w-3.5" /> Admin
                  </Link>
                )}
                <button
                  onClick={signOut}
                  className="flex w-full items-center gap-2 rounded-xl border border-border/70 px-3 py-2 text-[12px] text-ink/70"
                >
                  <LogOut className="h-3.5 w-3.5" /> Sign out
                </button>
              </div>
            </aside>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-2 border-b border-border/60 bg-background/80 px-3 backdrop-blur-xl sm:h-16 sm:gap-3 sm:px-8">
            <div className="flex min-w-0 items-center gap-2 sm:gap-4">
              <button
                onClick={() => setMobileOpen(true)}
                className="-ml-1 shrink-0 rounded-full p-2 text-ink/70 hover:bg-muted lg:hidden"
                aria-label="Open menu"
              >
                <Menu className="h-5 w-5" />
              </button>
              <Link to="/" className="flex min-w-0 items-center gap-2 lg:hidden">
                <span className="truncate text-[15px] font-semibold tracking-tight text-ink">
                  Nestly
                </span>
              </Link>
              <div className="hidden items-center gap-2 lg:flex">
                <span className="text-[11px] uppercase tracking-[0.24em] text-ink/40">Owner</span>
                <span className="h-3 w-px bg-border" />
                <span className="text-[12px] capitalize text-ink/60">
                  {pathname.split("/").filter(Boolean).slice(-1)[0]?.replace(/-/g, " ") ||
                    "workspace"}
                </span>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2 sm:gap-3">
              <a
                href="mailto:hello@nestly.app"
                className="hidden text-[12px] text-ink/55 hover:text-ink sm:inline-flex"
              >
                Help
              </a>
              <span className="hidden h-4 w-px bg-border sm:inline-block" />
              <Link
                to="/dashboard/new"
                aria-label="Post a place"
                className="group inline-flex items-center gap-1.5 rounded-full bg-ink px-3 py-1.5 text-[12.5px] font-medium text-cream shadow-[0_1px_0_0_rgba(255,255,255,0.08)_inset,0_8px_20px_-12px_rgba(0,0,0,0.6)] transition hover:bg-ink/90 sm:gap-2 sm:px-4 sm:py-2"
              >
                <Plus
                  className="h-4 w-4 transition-transform group-hover:rotate-90 sm:h-3.5 sm:w-3.5"
                  strokeWidth={2.5}
                />
                <span className="hidden sm:inline">Post a place</span>
                <span className="sm:hidden">Post</span>
              </Link>
            </div>
          </header>

          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-8 sm:py-12">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}

function SideNav({
  pathname,
  unread,
  onSelect,
}: {
  pathname: string;
  unread: number;
  onSelect: () => void;
}) {
  return (
    <nav className="flex-1 overflow-y-auto px-3 py-4">
      <p className="px-3 pb-2 text-[10px] font-medium uppercase tracking-[0.18em] text-ink/40">
        Workspace
      </p>
      <ul className="space-y-1">
        {NAV.map((n) => {
          const active = n.match(pathname);
          const showBadge = "badgeKey" in n && n.badgeKey === "inbox" && unread > 0;
          return (
            <li key={n.to}>
              <Link
                to={n.to}
                onClick={onSelect}
                className={`group flex items-center gap-3 rounded-xl px-3 py-2 text-[13px] transition ${
                  active
                    ? "bg-ink text-cream shadow-tactile"
                    : "text-ink/70 hover:bg-muted hover:text-ink"
                }`}
              >
                <n.icon
                  className={`h-4 w-4 ${active ? "text-cream" : "text-ink/50 group-hover:text-ink"}`}
                />
                <span className="flex-1">{n.label}</span>
                {showBadge && (
                  <span
                    className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10.5px] font-bold ${active ? "bg-cream text-ink" : "bg-coral text-background"}`}
                  >
                    {unread > 99 ? "99+" : unread}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
