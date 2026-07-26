import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { listAllUsers, setUserRole } from "@/lib/admin.functions";
import { toCSV, downloadCSV } from "@/lib/csv";
import { ShieldCheck, ShieldOff, Download, ArrowRight, Search, X } from "lucide-react";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

export const Route = createFileRoute("/_authenticated/admin/users")({
  component: AdminUsers,
});

type Row = Awaited<ReturnType<typeof listAllUsers>>[number];

function AdminUsers() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [fetching, setFetching] = useState(false);
  const [q, setQ] = useState("");
  const debouncedQ = useDebouncedValue(q, 300);

  async function load(query = debouncedQ) {
    setFetching(true);
    try {
      const data = await listAllUsers({ data: { q: query } });
      setRows(data);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setFetching(false);
    }
  }

  useEffect(() => {
    load(debouncedQ);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQ]);

  async function toggle(userId: string, role: "admin" | "moderator", has: boolean) {
    try {
      await setUserRole({ data: { userId, role, grant: !has } });
      toast.success(has ? `Revoked ${role}` : `Granted ${role}`);
      load();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.2em] text-ink/45">People</p>
          <h1 className="mt-1 text-2xl font-medium tracking-tight text-ink sm:text-3xl">Users</h1>
        </div>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <form
            onSubmit={(e) => { e.preventDefault(); load(q); }}
            className="relative flex-1 sm:flex-initial sm:w-64"
          >
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink/45" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search email…"
              enterKeyHint="search"
              inputMode="search"
              className="h-9 w-full rounded-full border border-border/70 bg-background pl-9 pr-9 text-[13px] outline-none focus:border-ink"
            />
            {q && (
              <button
                type="button"
                onClick={() => setQ("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-ink/50 hover:bg-muted hover:text-ink"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </form>
          <button
            onClick={() => rows && downloadCSV(`users-${Date.now()}.csv`,
              toCSV(rows.map((u) => ({ email: u.email, roles: u.roles.join("|"), created_at: u.created_at, last_sign_in_at: u.last_sign_in_at ?? "" })),
                ["email", "roles", "created_at", "last_sign_in_at"]))}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-border/70 px-3 text-[12px] text-ink hover:bg-muted"
          >
            <Download className="h-3.5 w-3.5" /> CSV
          </button>
        </div>
      </header>

      {/* Mobile: cards */}
      <ul className={`grid gap-3 md:hidden ${fetching && rows ? "opacity-60 transition-opacity" : ""}`}>
        {rows === null && Array.from({ length: 4 }).map((_, i) => (
          <li key={`sk-${i}`} className="rounded-2xl border border-border/70 bg-card p-3">
            <div className="h-4 w-40 animate-pulse rounded bg-muted" />
            <div className="mt-2 h-3 w-56 animate-pulse rounded bg-muted/70" />
            <div className="mt-3 flex gap-2">
              <div className="h-7 flex-1 animate-pulse rounded-full bg-muted" />
              <div className="h-7 flex-1 animate-pulse rounded-full bg-muted" />
            </div>
          </li>
        ))}
        {rows?.length === 0 && !fetching && (
          <li className="rounded-2xl border border-dashed border-border/70 bg-card px-4 py-8 text-center text-[13px] text-ink/50">
            No users.
          </li>
        )}
        {rows?.map((u) => {
          const isAdmin = u.roles.includes("admin");
          const isMod = u.roles.includes("moderator");
          return (
            <li key={u.id} className="rounded-2xl border border-border/70 bg-card p-3">
              <Link
                to="/admin/users/$userId"
                params={{ userId: u.id }}
                className="flex items-center gap-2 truncate text-[13.5px] font-medium text-ink hover:underline"
              >
                <span className="truncate">{u.email || "—"}</span>
                <ArrowRight className="h-3 w-3 shrink-0 opacity-40" />
              </Link>
              <p className="mt-1 text-[11.5px] text-ink/55">
                Joined {new Date(u.created_at).toLocaleDateString()}
                {u.last_sign_in_at && ` · Last ${new Date(u.last_sign_in_at).toLocaleDateString()}`}
              </p>
              <div className="mt-2 flex flex-wrap gap-1">
                {u.roles.length === 0 && (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-ink/60">user</span>
                )}
                {u.roles.map((r) => (
                  <span key={r} className="rounded-full bg-muted px-2 py-0.5 text-[11px] uppercase tracking-wider text-ink/70">
                    {r}
                  </span>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-2 border-t border-border/60 pt-3">
                <button
                  onClick={() => toggle(u.id, "moderator", isMod)}
                  className="inline-flex flex-1 items-center justify-center gap-1 rounded-full border border-border/70 px-3 py-1.5 text-[11px] uppercase tracking-wider text-ink/70 hover:bg-muted"
                >
                  {isMod ? <ShieldOff className="h-3 w-3" /> : <ShieldCheck className="h-3 w-3" />}
                  {isMod ? "Revoke mod" : "Make mod"}
                </button>
                <button
                  onClick={() => toggle(u.id, "admin", isAdmin)}
                  className={`inline-flex flex-1 items-center justify-center gap-1 rounded-full px-3 py-1.5 text-[11px] uppercase tracking-wider ${
                    isAdmin
                      ? "border border-red-200 text-red-600 hover:bg-red-50"
                      : "bg-ink text-cream hover:bg-ink/90"
                  }`}
                >
                  {isAdmin ? <ShieldOff className="h-3 w-3" /> : <ShieldCheck className="h-3 w-3" />}
                  {isAdmin ? "Revoke admin" : "Make admin"}
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {/* Desktop: table */}
      <div className="hidden md:block overflow-hidden rounded-2xl border border-border/70 bg-card">
        {fetching && rows && (
          <div className="h-0.5 w-full overflow-hidden bg-muted">
            <div className="h-full w-1/3 animate-[shimmer_1.2s_infinite] bg-ink/40" />
          </div>
        )}
        <table className="w-full text-[13px]">
          <thead className="border-b border-border/70 text-left text-[11px] uppercase tracking-wider text-ink/50">
            <tr>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Joined</th>
              <th className="px-4 py-3 font-medium">Last sign-in</th>
              <th className="px-4 py-3 font-medium">Roles</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/70">
            {rows === null && Array.from({ length: 6 }).map((_, i) => (
              <tr key={`sk-${i}`}>
                <td className="px-4 py-3"><div className="h-3.5 w-48 animate-pulse rounded bg-muted" /></td>
                <td className="px-4 py-3"><div className="h-3 w-20 animate-pulse rounded bg-muted/70" /></td>
                <td className="px-4 py-3"><div className="h-3 w-20 animate-pulse rounded bg-muted/70" /></td>
                <td className="px-4 py-3"><div className="h-4 w-16 animate-pulse rounded-full bg-muted" /></td>
                <td className="px-4 py-3"><div className="ml-auto h-6 w-40 animate-pulse rounded-full bg-muted" /></td>
              </tr>
            ))}
            {rows?.length === 0 && !fetching && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-ink/50">No users.</td></tr>
            )}
            {rows?.map((u) => {
              const isAdmin = u.roles.includes("admin");
              const isMod = u.roles.includes("moderator");
              return (
                <tr key={u.id}>
                  <td className="px-4 py-3 font-medium text-ink">
                    <Link
                      to="/admin/users/$userId"
                      params={{ userId: u.id }}
                      className="inline-flex items-center gap-1 hover:underline"
                    >
                      {u.email || <span className="text-ink/50">—</span>}
                      <ArrowRight className="h-3 w-3 opacity-40" />
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-ink/60">{new Date(u.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-ink/60">{u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleDateString() : "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {u.roles.length === 0 && <span className="text-ink/40">user</span>}
                      {u.roles.map((r) => (
                        <span key={r} className="rounded-full bg-muted px-2 py-0.5 text-[11px] uppercase tracking-wider text-ink/70">
                          {r}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => toggle(u.id, "moderator", isMod)}
                        className="inline-flex items-center gap-1 rounded-full border border-border/70 px-3 py-1 text-[11px] uppercase tracking-wider text-ink/70 hover:bg-muted"
                      >
                        {isMod ? <ShieldOff className="h-3 w-3" /> : <ShieldCheck className="h-3 w-3" />}
                        {isMod ? "Revoke mod" : "Make mod"}
                      </button>
                      <button
                        onClick={() => toggle(u.id, "admin", isAdmin)}
                        className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] uppercase tracking-wider ${isAdmin ? "border border-red-200 text-red-600 hover:bg-red-50" : "bg-ink text-cream hover:bg-ink/90"}`}
                      >
                        {isAdmin ? <ShieldOff className="h-3 w-3" /> : <ShieldCheck className="h-3 w-3" />}
                        {isAdmin ? "Revoke admin" : "Make admin"}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}