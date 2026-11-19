import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { toast } from "sonner";
import { BadgeCheck, Download, KeyRound, Loader2, Trash2, UserRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, friendlyAuthError } from "@/hooks/use-auth";
import { deleteMyAccount, exportMyData } from "@/lib/account.functions";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/dashboard/account")({
  component: AccountPage,
  head: () => ({
    meta: [
      { title: "Account · Nestly" },
      { name: "description", content: "Manage your Nestly profile, password and personal data." },
      { name: "robots", content: "noindex" },
    ],
  }),
});

const nameSchema = z
  .string()
  .trim()
  .min(2, "Enter at least 2 characters.")
  .max(80, "That name is too long.");
const passwordSchema = z
  .object({
    password: z
      .string()
      .min(8, "Use at least 8 characters.")
      .max(72, "Use 72 characters or fewer.")
      .regex(/[A-Za-z]/, "Include at least one letter.")
      .regex(/\d/, "Include at least one number."),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    message: "The passwords don't match.",
    path: ["confirm"],
  });

const card = "rounded-2xl border border-ink/[0.08] bg-card p-5 sm:p-6";
const inputCls =
  "mt-1.5 h-11 w-full rounded-xl border border-ink/10 bg-background px-3.5 text-[14px] text-ink outline-none transition placeholder:text-ink/35 focus:border-ink/40 focus:ring-2 focus:ring-ink/10";
const labelCls = "text-[12px] font-semibold uppercase tracking-wider text-ink/45";
const primaryBtn =
  "inline-flex h-10 items-center justify-center gap-2 rounded-full bg-ink px-5 text-[13px] font-semibold text-cream transition hover:bg-ink/90 disabled:opacity-60";
const secondaryBtn =
  "inline-flex h-10 items-center justify-center gap-2 rounded-full border border-ink/12 px-5 text-[13px] font-semibold text-ink transition hover:border-ink/30 disabled:opacity-60";

function AccountPage() {
  const { user, loading } = useAuth();

  return (
    <div className="mx-auto max-w-[720px]">
      <header className="mb-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink/45">
          Settings
        </p>
        <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
          Your account
        </h1>
        <p className="mt-2 text-[14px] text-ink/60">
          Update your details, change your password and manage your data.
        </p>
      </header>

      {loading || !user ? (
        <div className="flex h-32 items-center justify-center text-ink/40">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : (
        <div className="space-y-5">
          <ProfileCard
            userId={user.id}
            email={user.email ?? null}
            emailConfirmed={Boolean(user.email_confirmed_at)}
            phone={user.phone || null}
            phoneConfirmed={Boolean(user.phone_confirmed_at)}
            fallbackName={(user.user_metadata?.full_name as string | undefined) ?? ""}
          />
          <PasswordCard />
          <DataCard />
          <DeleteCard />
        </div>
      )}
    </div>
  );
}

function SectionTitle({
  icon: Icon,
  title,
  sub,
}: {
  icon: typeof UserRound;
  title: string;
  sub: string;
}) {
  return (
    <div className="mb-4 flex items-start gap-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink/[0.06] text-ink">
        <Icon className="h-4 w-4" />
      </span>
      <div>
        <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
        <p className="text-[13px] text-ink/55">{sub}</p>
      </div>
    </div>
  );
}

function ProfileCard({
  userId,
  email,
  emailConfirmed,
  phone,
  phoneConfirmed,
  fallbackName,
}: {
  userId: string;
  email: string | null;
  emailConfirmed: boolean;
  phone: string | null;
  phoneConfirmed: boolean;
  fallbackName: string;
}) {
  const [name, setName] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase
      .from("profiles")
      .select("display_name")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data }) => {
        setName(data?.display_name ?? fallbackName);
        setLoaded(true);
      });
  }, [userId, fallbackName]);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    const parsed = nameSchema.safeParse(name);
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    setBusy(true);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .update({ display_name: parsed.data })
        .eq("id", userId)
        .select("id");
      if (error) throw error;
      if (!data?.length) {
        const { error: insErr } = await supabase
          .from("profiles")
          .insert({ id: userId, display_name: parsed.data });
        if (insErr) throw insErr;
      }
      await supabase.auth.updateUser({ data: { full_name: parsed.data } });
      toast.success("Name updated");
    } catch (err) {
      toast.error(friendlyAuthError(err, "Could not save your name."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={card}>
      <SectionTitle
        icon={UserRound}
        title="Profile"
        sub="Your name is shown to owners and seekers you message."
      />
      <form onSubmit={onSave} className="space-y-4">
        <label className="block">
          <span className={labelCls}>Display name</span>
          <input
            value={name}
            disabled={!loaded}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            className={inputCls}
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <span className={labelCls}>Email</span>
            <p className="mt-1.5 flex min-h-11 items-center gap-2 break-all rounded-xl bg-ink/[0.03] px-3.5 text-[14px] text-ink/75">
              {email ?? "Not added"}
              {email && emailConfirmed && (
                <BadgeCheck className="h-4 w-4 shrink-0 text-teal" aria-label="Verified" />
              )}
            </p>
          </div>
          <div>
            <span className={labelCls}>Phone</span>
            <p className="mt-1.5 flex min-h-11 items-center gap-2 rounded-xl bg-ink/[0.03] px-3.5 text-[14px] text-ink/75">
              {phone ? `+${phone.replace(/^\+/, "")}` : "Not added"}
              {phone && phoneConfirmed && (
                <BadgeCheck className="h-4 w-4 shrink-0 text-teal" aria-label="Verified" />
              )}
              {!phoneConfirmed && (
                <Link
                  to="/dashboard/verify"
                  className="ml-auto text-[12.5px] font-semibold text-ink hover:underline"
                >
                  Verify
                </Link>
              )}
            </p>
          </div>
        </div>
        <button type="submit" disabled={busy || !loaded} className={primaryBtn}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save changes
        </button>
      </form>
    </section>
  );
}

function PasswordCard() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = passwordSchema.safeParse({ password, confirm });
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
    setBusy(false);
    if (error) return toast.error(friendlyAuthError(error));
    setPassword("");
    setConfirm("");
    toast.success("Password updated");
  }

  return (
    <section className={card}>
      <SectionTitle
        icon={KeyRound}
        title="Password"
        sub="Signed in with Google or phone? Setting one lets you sign in with email too."
      />
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={labelCls}>New password</span>
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputCls}
              placeholder="At least 8 characters"
            />
          </label>
          <label className="block">
            <span className={labelCls}>Confirm</span>
            <input
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className={inputCls}
            />
          </label>
        </div>
        <button type="submit" disabled={busy} className={primaryBtn}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} Update password
        </button>
      </form>
    </section>
  );
}

function DataCard() {
  const exportFn = useServerFn(exportMyData);
  const [busy, setBusy] = useState(false);

  async function onDownload() {
    setBusy(true);
    try {
      const data = await exportFn();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `nestly-my-data-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not prepare your data.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={card}>
      <SectionTitle
        icon={Download}
        title="Download my data"
        sub="Get a copy of your profile, listings, saved searches, messages, tours and reviews as a JSON file."
      />
      <button type="button" onClick={onDownload} disabled={busy} className={secondaryBtn}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}{" "}
        Download my data
      </button>
    </section>
  );
}

function DeleteCard() {
  const deleteFn = useServerFn(deleteMyAccount);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);

  async function onDelete() {
    if (typed !== "DELETE") return;
    setBusy(true);
    try {
      await deleteFn({ data: { confirm: "DELETE" } });
      await supabase.auth.signOut({ scope: "local" }).catch(() => {});
      queryClient.clear();
      toast.success("Your account has been deleted.");
      navigate({ to: "/", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete your account.");
      setBusy(false);
    }
  }

  return (
    <section className={`${card} border-destructive/20`}>
      <SectionTitle
        icon={Trash2}
        title="Delete my account"
        sub="Permanently removes your account, messages, tours, saved searches and reviews. Your listings are taken down."
      />
      <button
        type="button"
        onClick={() => {
          setTyped("");
          setOpen(true);
        }}
        className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-destructive/30 px-5 text-[13px] font-semibold text-destructive transition hover:bg-destructive/[0.06]"
      >
        <Trash2 className="h-4 w-4" /> Delete account
      </button>

      <AlertDialog open={open} onOpenChange={(v) => !busy && setOpen(v)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete your Nestly account?</AlertDialogTitle>
            <AlertDialogDescription>
              This can't be undone. Your listings will be taken down and your personal data erased.
              Download your data first if you want a copy.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <label className="block">
            <span className="text-[13px] text-ink/70">
              Type <span className="font-mono font-semibold text-ink">DELETE</span> to confirm
            </span>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              autoCapitalize="characters"
              className={inputCls}
            />
          </label>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <button
              type="button"
              onClick={onDelete}
              disabled={busy || typed !== "DELETE"}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-destructive px-4 text-[13px] font-semibold text-destructive-foreground transition hover:brightness-110 disabled:opacity-50"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Delete permanently
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
