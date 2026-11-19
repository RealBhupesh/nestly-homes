import {
  createFileRoute,
  Outlet,
  Link,
  useRouterState,
  useNavigate,
  redirect,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Toaster } from "@/components/ui/sonner";
import { getIsAdmin } from "@/lib/admin.functions";
import { useSignOut } from "@/hooks/use-auth";
import {
  ShieldCheck,
  LayoutDashboard,
  Building2,
  Users,
  Star,
  ImageIcon,
  Bookmark,
  BarChart3,
  ScrollText,
  BadgeCheck,
  Settings,
  Search,
  Menu,
  X,
  ArrowUpRight,
  Bell,
  Sparkles,
  ChevronRight,
  Flag,
} from "lucide-react";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: async () => {
    const { isAdmin } = await getIsAdmin();
    if (!isAdmin) throw redirect({ to: "/dashboard" });
  },
  component: AdminLayout,
});

type NavItem = { to: string; label: string; icon: any; group: string };

const NAV: NavItem[] = [
  { to: "/admin", label: "Overview", icon: LayoutDashboard, group: "General" },
  { to: "/admin/analytics", label: "Analytics", icon: BarChart3, group: "General" },
  { to: "/admin/listings", label: "Listings", icon: Building2, group: "Content" },
  { to: "/admin/photos", label: "Photos", icon: ImageIcon, group: "Content" },
  { to: "/admin/reviews", label: "Reviews", icon: Star, group: "Content" },
  { to: "/admin/reports", label: "Reports", icon: Flag, group: "Content" },
  { to: "/admin/users", label: "Users", icon: Users, group: "Community" },
  { to: "/admin/verifications", label: "Verifications", icon: BadgeCheck, group: "Community" },
  { to: "/admin/searches", label: "Saved searches", icon: Bookmark, group: "Community" },
  { to: "/admin/audit", label: "Audit log", icon: ScrollText, group: "Ops" },
  { to: "/admin/settings", label: "Settings", icon: Settings, group: "Ops" },
];

function AdminLayout() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => setMobileOpen(false), [pathname]);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserEmail(data.user?.email ?? null));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const signOut = useSignOut();

  const groups = Array.from(new Set(NAV.map((n) => n.group)));
  const current =
    NAV.find((n) => n.to === pathname) ??
    NAV.find((n) => n.to !== "/admin" && pathname.startsWith(n.to));
  const initials = (userEmail ?? "A").slice(0, 2).toUpperCase();

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/40 text-ink">
      <Toaster richColors position="top-center" />

      <CommandDialog open={paletteOpen} onOpenChange={setPaletteOpen}>
        <CommandInput placeholder="Jump to a section, search command…" />
        <CommandList>
          <CommandEmpty>No results.</CommandEmpty>
          {groups.map((g) => (
            <CommandGroup key={g} heading={g}>
              {NAV.filter((n) => n.group === g).map((n) => (
                <CommandItem
                  key={n.to}
                  onSelect={() => {
                    setPaletteOpen(false);
                    navigate({ to: n.to as any });
                  }}
                >
                  <n.icon className="mr-2 h-4 w-4" /> {n.label}
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
          <CommandGroup heading="Shortcuts">
            <CommandItem
              onSelect={() => {
                setPaletteOpen(false);
                navigate({ to: "/dashboard" });
              }}
            >
              <ArrowUpRight className="mr-2 h-4 w-4" /> Owner dashboard
            </CommandItem>
            <CommandItem
              onSelect={() => {
                setPaletteOpen(false);
                navigate({ to: "/" });
              }}
            >
              <ArrowUpRight className="mr-2 h-4 w-4" /> View site
            </CommandItem>
            <CommandItem
              onSelect={() => {
                setPaletteOpen(false);
                signOut();
              }}
            >
              <X className="mr-2 h-4 w-4" /> Sign out
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>

      <div className="flex min-h-screen">
        {/* Sidebar (desktop) */}
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-border/60 bg-card/60 backdrop-blur-xl lg:flex lg:flex-col">
          <div className="flex h-16 items-center gap-3 border-b border-border/60 px-5">
            <Link to="/" className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-ink to-ink/70 text-cream shadow-sm">
                <ShieldCheck className="h-4 w-4" />
              </span>
              <div className="leading-tight">
                <p className="text-[13px] font-semibold tracking-tight text-ink">Nestly</p>
                <p className="text-[10px] uppercase tracking-[0.18em] text-ink/45">Admin Console</p>
              </div>
            </Link>
          </div>
          <SideNav pathname={pathname} onSelect={() => {}} />
          <div className="border-t border-border/60 p-4 space-y-3">
            <button
              onClick={() => setPaletteOpen(true)}
              className="group flex w-full items-center justify-between rounded-xl border border-border/70 bg-background/80 px-3 py-2 text-[12px] text-ink/60 shadow-sm transition hover:border-ink/40 hover:bg-background hover:text-ink"
            >
              <span className="inline-flex items-center gap-2">
                <Search className="h-3.5 w-3.5" /> Quick jump
              </span>
              <kbd className="rounded border border-border/70 bg-muted px-1.5 py-0.5 font-mono text-[10px] text-ink/60">
                ⌘K
              </kbd>
            </button>
            <div className="flex items-center gap-2.5 rounded-xl border border-border/60 bg-background/60 px-2.5 py-2">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-coral to-coral-soft text-[11px] font-semibold text-cream">
                {initials}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-medium text-ink">
                  {userEmail ?? "Signed in"}
                </p>
                <div className="flex items-center gap-2 text-[10px] text-ink/50">
                  <Link to="/dashboard" className="hover:text-ink">
                    Owner
                  </Link>
                  <span className="text-ink/25">·</span>
                  <button onClick={signOut} className="hover:text-ink">
                    Sign out
                  </button>
                </div>
              </div>
            </div>
          </div>
        </aside>

        {/* Mobile drawer */}
        {mobileOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div
              className="absolute inset-0 bg-ink/50 backdrop-blur-sm"
              onClick={() => setMobileOpen(false)}
            />
            <aside className="absolute inset-y-0 left-0 flex w-72 flex-col bg-card shadow-2xl animate-in slide-in-from-left duration-200">
              <div className="flex h-16 items-center justify-between border-b border-border/60 px-4">
                <div className="flex items-center gap-2.5">
                  <span className="grid h-8 w-8 place-items-center rounded-xl bg-ink text-cream">
                    <ShieldCheck className="h-4 w-4" />
                  </span>
                  <span className="text-[14px] font-semibold tracking-tight text-ink">
                    Nestly · Admin
                  </span>
                </div>
                <button
                  onClick={() => setMobileOpen(false)}
                  className="rounded-full p-1.5 hover:bg-muted"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <SideNav pathname={pathname} onSelect={() => setMobileOpen(false)} />
            </aside>
          </div>
        )}

        {/* Main */}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border/60 bg-background/70 px-4 backdrop-blur-xl sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <button
                onClick={() => setMobileOpen(true)}
                className="rounded-full p-1.5 text-ink/70 hover:bg-muted lg:hidden"
                aria-label="Open menu"
              >
                <Menu className="h-5 w-5" />
              </button>
              <Breadcrumb pathname={pathname} current={current?.label} />
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPaletteOpen(true)}
                className="hidden items-center gap-2 rounded-full border border-border/70 bg-card/70 px-3.5 py-1.5 text-[12px] text-ink/60 shadow-sm transition hover:border-ink/40 hover:text-ink sm:inline-flex"
              >
                <Search className="h-3.5 w-3.5" /> Search anything
                <kbd className="rounded border border-border/70 bg-muted px-1.5 py-0.5 font-mono text-[10px] text-ink/60">
                  ⌘K
                </kbd>
              </button>
              <Link
                to="/"
                className="hidden items-center gap-1.5 rounded-full border border-border/70 bg-card/70 px-3 py-1.5 text-[12px] text-ink/70 shadow-sm transition hover:border-ink/40 hover:text-ink sm:inline-flex"
              >
                <Sparkles className="h-3.5 w-3.5" /> View site
              </Link>
              <button
                className="relative grid h-9 w-9 place-items-center rounded-full border border-border/70 bg-card/70 text-ink/70 shadow-sm transition hover:border-ink/40 hover:text-ink"
                aria-label="Notifications"
              >
                <Bell className="h-4 w-4" />
                <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-coral" />
              </button>
            </div>
          </header>
          <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}

function SideNav({ pathname, onSelect }: { pathname: string; onSelect: () => void }) {
  const groups = Array.from(new Set(NAV.map((n) => n.group)));
  return (
    <nav className="flex-1 overflow-y-auto px-3 py-4">
      {groups.map((g) => (
        <div key={g} className="mb-4">
          <p className="px-2.5 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink/40">
            {g}
          </p>
          <ul className="space-y-0.5">
            {NAV.filter((n) => n.group === g).map((n) => {
              const active =
                pathname === n.to ||
                (n.to !== "/admin" && pathname.startsWith(n.to + "/")) ||
                (n.to === "/admin" && pathname === "/admin");
              return (
                <li key={n.to}>
                  <Link
                    to={n.to as any}
                    onClick={onSelect}
                    className={`group relative flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13px] transition ${
                      active
                        ? "bg-ink text-cream shadow-sm"
                        : "text-ink/70 hover:bg-muted/70 hover:text-ink"
                    }`}
                  >
                    <n.icon
                      className={`h-4 w-4 ${active ? "text-cream" : "text-ink/50 group-hover:text-ink"}`}
                    />
                    <span className="flex-1">{n.label}</span>
                    {active && <span className="h-1.5 w-1.5 rounded-full bg-cream/80" />}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function Breadcrumb({ pathname, current }: { pathname: string; current?: string }) {
  const parts = pathname.split("/").filter(Boolean);
  return (
    <nav className="flex min-w-0 items-center gap-1.5 text-[13px] text-ink/50">
      {parts.map((p, i) => {
        const last = i === parts.length - 1;
        const label = last && current ? current : p;
        return (
          <span key={i} className="flex items-center gap-1.5">
            {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-ink/30" />}
            <span className={`truncate capitalize ${last ? "font-medium text-ink" : ""}`}>
              {label}
            </span>
          </span>
        );
      })}
    </nav>
  );
}
