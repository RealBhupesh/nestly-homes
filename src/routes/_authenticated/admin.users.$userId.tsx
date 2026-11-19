import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  getUserDetail,
  setUserRole,
  setUserBan,
  deleteUserAdmin,
  addUserNote,
  deleteUserNote,
} from "@/lib/admin.functions";
import { ShieldCheck, ShieldOff, Ban, Trash2, ArrowLeft, StickyNote } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/users/$userId")({
  component: AdminUserDetail,
});

type Detail = Awaited<ReturnType<typeof getUserDetail>>;

function AdminUserDetail() {
  const { userId } = Route.useParams();
  const navigate = useNavigate();
  const [d, setD] = useState<Detail | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      setD(await getUserDetail({ data: { userId } }));
    } catch (e: any) {
      toast.error(e.message);
    }
  }
  useEffect(() => {
    load();
  }, [userId]);

  if (!d) return <p className="text-sm text-ink/50">Loading…</p>;
  const isAdmin = d.roles.includes("admin");
  const isMod = d.roles.includes("moderator");
  const banned = !!d.user.banned_until && new Date(d.user.banned_until).getTime() > Date.now();

  async function toggleRole(role: "admin" | "moderator", grant: boolean) {
    try {
      await setUserRole({ data: { userId, role, grant } });
      toast.success("Done");
      load();
    } catch (e: any) {
      toast.error(e.message);
    }
  }
  async function toggleBan() {
    if (!confirm(banned ? "Unban this user?" : "Ban this user?")) return;
    try {
      await setUserBan({ data: { userId, ban: !banned } });
      toast.success("Done");
      load();
    } catch (e: any) {
      toast.error(e.message);
    }
  }
  async function remove() {
    if (!confirm("Delete this user permanently? Their listings will cascade delete.")) return;
    try {
      await deleteUserAdmin({ data: { userId } });
      toast.success("Deleted");
      navigate({ to: "/admin/users" });
    } catch (e: any) {
      toast.error(e.message);
    }
  }
  async function addNote(e: React.FormEvent) {
    e.preventDefault();
    if (!note.trim()) return;
    setBusy(true);
    try {
      await addUserNote({ data: { userId, body: note } });
      setNote("");
      load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function removeNote(id: string) {
    try {
      await deleteUserNote({ data: { id } });
      load();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  return (
    <div className="space-y-6">
      <Link
        to="/admin/users"
        className="inline-flex items-center gap-1 text-[12px] text-ink/60 hover:text-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to users
      </Link>

      <header className="rounded-2xl border border-border/70 bg-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-ink/45">User</p>
            <h1 className="mt-1 text-2xl font-medium tracking-tight text-ink">
              {d.user.email || "—"}
            </h1>
            <p className="mt-1 text-[12px] text-ink/50">
              {d.user.provider} · joined {new Date(d.user.created_at).toLocaleDateString()}
              {d.user.last_sign_in_at && (
                <> · last sign-in {new Date(d.user.last_sign_in_at).toLocaleDateString()}</>
              )}
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {d.roles.length === 0 && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-ink/60">
                  user
                </span>
              )}
              {d.roles.map((r) => (
                <span
                  key={r}
                  className="rounded-full bg-ink px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider text-cream"
                >
                  {r}
                </span>
              ))}
              {banned && (
                <span className="rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-medium text-cream">
                  banned
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <ActionBtn
              onClick={() => toggleRole("moderator", !isMod)}
              icon={isMod ? ShieldOff : ShieldCheck}
            >
              {isMod ? "Revoke mod" : "Make mod"}
            </ActionBtn>
            <ActionBtn
              onClick={() => toggleRole("admin", !isAdmin)}
              icon={isAdmin ? ShieldOff : ShieldCheck}
              tone={isAdmin ? "danger" : "primary"}
            >
              {isAdmin ? "Revoke admin" : "Make admin"}
            </ActionBtn>
            <ActionBtn onClick={toggleBan} icon={Ban} tone="danger">
              {banned ? "Unban" : "Ban"}
            </ActionBtn>
            <ActionBtn onClick={remove} icon={Trash2} tone="danger">
              Delete
            </ActionBtn>
          </div>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title={`Listings (${d.listings.length})`}>
          <ul className="divide-y divide-border/70 text-[13px]">
            {d.listings.map((l: any) => (
              <li key={l.id} className="flex items-center justify-between py-2.5">
                <Link
                  to="/listing/$id"
                  params={{ id: l.id }}
                  className="min-w-0 truncate text-ink hover:underline"
                >
                  {l.title}
                </Link>
                <span className="ml-3 shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] text-ink/70">
                  {l.status}
                </span>
              </li>
            ))}
            {d.listings.length === 0 && <li className="py-2 text-ink/50">No listings.</li>}
          </ul>
        </Card>

        <Card title={`Reviews (${d.reviews.length})`}>
          <ul className="divide-y divide-border/70 text-[13px]">
            {d.reviews.map((r: any) => (
              <li key={r.id} className="py-2.5">
                <div className="flex items-center gap-2 text-ink/60">
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px]">
                    ★ {r.rating}
                  </span>
                  <span>{new Date(r.created_at).toLocaleDateString()}</span>
                </div>
                {r.title && <p className="mt-1 font-medium text-ink">{r.title}</p>}
                <p className="mt-0.5 text-ink/70 line-clamp-2">{r.body}</p>
              </li>
            ))}
            {d.reviews.length === 0 && <li className="py-2 text-ink/50">No reviews.</li>}
          </ul>
        </Card>

        <Card
          title={
            <span className="inline-flex items-center gap-1.5">
              <StickyNote className="h-3.5 w-3.5" /> Internal notes
            </span>
          }
        >
          <form onSubmit={addNote} className="space-y-2">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add a note visible to admins only…"
              className="min-h-[70px] w-full rounded-lg border border-border/70 bg-background p-2 text-[13px] outline-none focus:border-ink"
            />
            <button
              disabled={busy || !note.trim()}
              className="rounded-full bg-ink px-3 py-1 text-[12px] font-medium text-cream disabled:opacity-50"
            >
              Add note
            </button>
          </form>
          <ul className="mt-4 space-y-2 text-[13px]">
            {d.notes.map((n: any) => (
              <li
                key={n.id}
                className="group rounded-lg border border-border/70 bg-background/60 p-2.5"
              >
                <p className="whitespace-pre-wrap text-ink/80">{n.body}</p>
                <div className="mt-1.5 flex items-center justify-between text-[11px] text-ink/45">
                  <span>{new Date(n.created_at).toLocaleString()}</span>
                  <button
                    onClick={() => removeNote(n.id)}
                    className="opacity-0 transition group-hover:opacity-100 hover:text-red-600"
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
            {d.notes.length === 0 && <li className="text-ink/50">No notes yet.</li>}
          </ul>
        </Card>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border/70 bg-card p-5">
      <h2 className="text-sm font-medium text-ink">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function ActionBtn({
  onClick,
  icon: Icon,
  children,
  tone = "default",
}: {
  onClick: () => void;
  icon: any;
  children: React.ReactNode;
  tone?: "default" | "primary" | "danger";
}) {
  const cls =
    tone === "primary"
      ? "bg-ink text-cream hover:bg-ink/90"
      : tone === "danger"
        ? "border border-red-200 text-red-600 hover:bg-red-50"
        : "border border-border/70 text-ink hover:bg-muted";
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium ${cls}`}
    >
      <Icon className="h-3.5 w-3.5" /> {children}
    </button>
  );
}
