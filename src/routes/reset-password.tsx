import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { CheckCircle2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { friendlyAuthError } from "@/hooks/use-auth";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Set a new password — Nestly" },
      { name: "description", content: "Choose a new password for your Nestly account." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResetPasswordPage,
});

const schema = z
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

const inputCls =
  "mt-1.5 h-11 w-full rounded-xl border border-ink/10 bg-background px-3.5 text-[14px] text-ink outline-none transition placeholder:text-ink/35 focus:border-ink/40 focus:ring-2 focus:ring-ink/10";

function ResetPasswordPage() {
  const router = useRouter();
  const [state, setState] = useState<"checking" | "ready" | "invalid" | "done">("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let settled = false;
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const linkError =
      hash.get("error_description") ||
      new URLSearchParams(window.location.search).get("error_description");

    const { data: sub } = supabase.auth.onAuthStateChange((evt, session) => {
      if (evt === "PASSWORD_RECOVERY" || (session && evt === "SIGNED_IN")) {
        settled = true;
        setState("ready");
      }
    });

    // The recovery link signs the user in via the URL; give the client a moment to parse it.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        settled = true;
        setState("ready");
      } else if (linkError) {
        settled = true;
        setState("invalid");
      }
    });
    const t = window.setTimeout(() => {
      if (!settled) setState("invalid");
    }, 4000);

    return () => {
      window.clearTimeout(t);
      sub.subscription.unsubscribe();
    };
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = schema.safeParse({ password, confirm });
    if (!parsed.success) return setError(parsed.error.issues[0].message);
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
    setBusy(false);
    if (error) return setError(friendlyAuthError(error));
    setState("done");
    window.setTimeout(() => router.history.replace("/dashboard"), 1500);
  }

  return (
    <div className="flex min-h-screen bg-[color-mix(in_oklab,var(--cream)_65%,white)]">
      <div className="mx-auto flex w-full max-w-[440px] flex-col px-4 py-8 sm:px-6 sm:py-14">
        <Link
          to="/"
          className="flex items-center gap-2 text-[15px] font-semibold tracking-tight text-ink"
        >
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-ink text-[11px] text-cream">
            N
          </span>
          Nestly
        </Link>

        <div className="mt-10">
          <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">
            Set a new password
          </h1>
          <p className="mt-2 text-[14px] text-ink/60">
            Choose something you don't use on other sites.
          </p>
        </div>

        <div className="mt-8 rounded-3xl border border-ink/[0.08] bg-card p-5 shadow-[0_24px_60px_-40px_rgba(0,0,0,0.35)] sm:p-6">
          {state === "checking" && (
            <div className="flex h-32 items-center justify-center text-ink/40">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          )}

          {state === "invalid" && (
            <div className="space-y-4 text-[14px] text-ink/70">
              <p className="font-semibold text-ink">This reset link is invalid or has expired.</p>
              <p>
                Reset links work once and expire after an hour. Request a fresh one from the sign-in
                page.
              </p>
              <Link
                to="/auth"
                className="inline-flex h-11 w-full items-center justify-center rounded-full bg-ink text-[13.5px] font-semibold text-cream hover:bg-ink/90"
              >
                Back to sign in
              </Link>
            </div>
          )}

          {state === "done" && (
            <div className="flex items-start gap-3 text-[14px] text-ink/70">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-teal" />
              <div>
                <p className="font-semibold text-ink">Password updated</p>
                <p className="mt-1">Taking you to your dashboard…</p>
              </div>
            </div>
          )}

          {state === "ready" && (
            <form onSubmit={onSubmit} noValidate className="space-y-4">
              {error && (
                <p
                  role="alert"
                  className="rounded-xl border border-destructive/20 bg-destructive/[0.06] px-3.5 py-2.5 text-[13px] text-destructive"
                >
                  {error}
                </p>
              )}
              <label className="block">
                <span className="text-[12px] font-semibold uppercase tracking-wider text-ink/50">
                  New password
                </span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  className={inputCls}
                />
              </label>
              <label className="block">
                <span className="text-[12px] font-semibold uppercase tracking-wider text-ink/50">
                  Confirm password
                </span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className={inputCls}
                />
              </label>
              <button
                type="submit"
                disabled={busy}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-ink text-[13.5px] font-semibold text-cream transition hover:bg-ink/90 disabled:opacity-60"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} Update password
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
