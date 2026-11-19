import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { ArrowLeft, Loader2, Mail, Smartphone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { friendlyAuthError, safeRedirectPath, toE164 } from "@/hooks/use-auth";

export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Sign in — Nestly" },
      {
        name: "description",
        content:
          "Sign in or create your Nestly account to list a place, message owners and book tours.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address.");
const passwordSchema = z
  .string()
  .min(8, "Use at least 8 characters.")
  .max(72, "Use 72 characters or fewer.")
  .regex(/[A-Za-z]/, "Include at least one letter.")
  .regex(/\d/, "Include at least one number.");
const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password."),
});
const signUpSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your name.").max(80, "That name is too long."),
  email: emailSchema,
  password: passwordSchema,
});

type EmailMode = "signin" | "signup" | "forgot";

const inputCls =
  "mt-1.5 h-11 w-full rounded-xl border border-ink/10 bg-background px-3.5 text-[14px] text-ink outline-none transition placeholder:text-ink/35 focus:border-ink/40 focus:ring-2 focus:ring-ink/10";
const labelCls = "text-[12px] font-semibold uppercase tracking-wider text-ink/50";
const primaryBtn =
  "inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-ink text-[13.5px] font-semibold text-cream transition hover:bg-ink/90 disabled:opacity-60";

function AuthPage() {
  const router = useRouter();
  const search = Route.useSearch();
  const target = safeRedirectPath(search.redirect);
  const [checking, setChecking] = useState(true);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [tab, setTab] = useState<"email" | "phone">("email");
  const navigated = useRef(false);

  // Already signed in (or just returned from Google / an email link)? Send them on.
  useEffect(() => {
    const go = () => {
      if (navigated.current) return;
      navigated.current = true;
      router.history.replace(target);
    };

    // Supabase reports link/OAuth failures in the URL hash or query.
    const params = new URLSearchParams(
      window.location.hash.replace(/^#/, "") || window.location.search,
    );
    const desc = params.get("error_description");
    if (desc) {
      setUrlError(
        /expired|invalid/i.test(desc)
          ? "That link is invalid or has expired. Request a new one below."
          : desc.replace(/\+/g, " "),
      );
    }

    const { data: sub } = supabase.auth.onAuthStateChange((evt, session) => {
      if (evt === "PASSWORD_RECOVERY") {
        router.history.replace("/reset-password");
        return;
      }
      if (session && (evt === "SIGNED_IN" || evt === "INITIAL_SESSION")) go();
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) go();
      else setChecking(false);
    });
    return () => sub.subscription.unsubscribe();
  }, [router, target]);

  return (
    <div className="flex min-h-screen bg-[color-mix(in_oklab,var(--cream)_65%,white)]">
      <div className="mx-auto flex w-full max-w-[440px] flex-col px-4 py-8 sm:px-6 sm:py-14">
        <div className="flex items-center justify-between">
          <Link
            to="/"
            className="flex items-center gap-2 text-[15px] font-semibold tracking-tight text-ink"
          >
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-ink text-[11px] text-cream">
              N
            </span>
            Nestly
          </Link>
          <Link
            to="/"
            className="inline-flex items-center gap-1 text-[12.5px] text-ink/55 hover:text-ink"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to homes
          </Link>
        </div>

        <div className="mt-10">
          <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">
            Welcome to Nestly
          </h1>
          <p className="mt-2 text-[14px] text-ink/60">
            Sign in to message owners, book tours and list your place in Pune.
          </p>
        </div>

        {checking ? (
          <div className="flex h-48 items-center justify-center text-ink/40">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <div className="mt-8 rounded-3xl border border-ink/[0.08] bg-card p-5 shadow-[0_24px_60px_-40px_rgba(0,0,0,0.35)] sm:p-6">
            {urlError && <ErrorNote message={urlError} />}

            <GoogleButton target={target} />

            <div className="my-5 flex items-center gap-3 text-[11px] font-medium uppercase tracking-[0.18em] text-ink/35">
              <span className="h-px flex-1 bg-ink/10" /> or{" "}
              <span className="h-px flex-1 bg-ink/10" />
            </div>

            <Tabs value={tab} onValueChange={(v) => setTab(v as "email" | "phone")}>
              <TabsList className="grid h-10 w-full grid-cols-2 rounded-full bg-ink/[0.05] p-1">
                <TabsTrigger
                  value="email"
                  className="gap-1.5 rounded-full text-[13px] data-[state=active]:shadow-sm"
                >
                  <Mail className="h-3.5 w-3.5" /> Email
                </TabsTrigger>
                <TabsTrigger
                  value="phone"
                  className="gap-1.5 rounded-full text-[13px] data-[state=active]:shadow-sm"
                >
                  <Smartphone className="h-3.5 w-3.5" /> Phone
                </TabsTrigger>
              </TabsList>
              <TabsContent value="email" className="mt-5">
                <EmailPanel target={target} />
              </TabsContent>
              <TabsContent value="phone" className="mt-5">
                <PhonePanel onUseEmail={() => setTab("email")} />
              </TabsContent>
            </Tabs>
          </div>
        )}

        <p className="mt-6 text-center text-[12px] leading-relaxed text-ink/50">
          By continuing you agree to Nestly's{" "}
          <a
            href="/terms"
            className="font-medium text-ink/70 underline underline-offset-2 hover:text-ink"
          >
            Terms of Service
          </a>{" "}
          and{" "}
          <a
            href="/privacy"
            className="font-medium text-ink/70 underline underline-offset-2 hover:text-ink"
          >
            Privacy Policy
          </a>
          .
        </p>
      </div>
    </div>
  );
}

function ErrorNote({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="mb-4 rounded-xl border border-destructive/20 bg-destructive/[0.06] px-3.5 py-2.5 text-[13px] text-destructive"
    >
      {message}
    </p>
  );
}

function InfoNote({ message }: { message: string }) {
  return (
    <p
      role="status"
      className="mb-4 rounded-xl border border-teal/25 bg-teal/[0.08] px-3.5 py-2.5 text-[13px] text-ink/80"
    >
      {message}
    </p>
  );
}

function GoogleButton({ target }: { target: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        // Come back through /auth so the redirect target is re-validated.
        redirectTo: `${window.location.origin}/auth?redirect=${encodeURIComponent(target)}`,
      },
    });
    if (error) {
      setError(friendlyAuthError(error));
      setBusy(false);
    }
  }

  return (
    <>
      {error && <ErrorNote message={error} />}
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        className="inline-flex h-11 w-full items-center justify-center gap-2.5 rounded-full border border-ink/12 bg-background text-[13.5px] font-semibold text-ink transition hover:border-ink/30 hover:bg-ink/[0.02] disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <GoogleMark />}
        Continue with Google
      </button>
    </>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <path
        fill="#EA4335"
        d="M12 10.2v3.9h5.5c-.24 1.4-1.7 4.1-5.5 4.1-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.5 14.6 2.5 12 2.5 6.8 2.5 2.6 6.7 2.6 12s4.2 9.5 9.4 9.5c5.4 0 9-3.8 9-9.2 0-.6-.07-1.1-.16-1.6H12z"
      />
    </svg>
  );
}

function EmailPanel({ target }: { target: string }) {
  const [mode, setMode] = useState<EmailMode>("signin");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  function switchMode(m: EmailMode) {
    setMode(m);
    setError(null);
    setInfo(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);

    if (mode === "forgot") {
      const parsed = emailSchema.safeParse(email);
      if (!parsed.success) return setError(parsed.error.issues[0].message);
      setBusy(true);
      const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      setBusy(false);
      if (error) return setError(friendlyAuthError(error));
      setInfo("If an account exists for that email, a reset link is on its way. Check your inbox.");
      return;
    }

    if (mode === "signin") {
      const parsed = signInSchema.safeParse({ email, password });
      if (!parsed.success) return setError(parsed.error.issues[0].message);
      setBusy(true);
      const { error } = await supabase.auth.signInWithPassword(parsed.data);
      setBusy(false);
      if (error) return setError(friendlyAuthError(error));
      // onAuthStateChange in AuthPage handles the redirect.
      return;
    }

    const parsed = signUpSchema.safeParse({ fullName, email, password });
    if (!parsed.success) return setError(parsed.error.issues[0].message);
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        data: { full_name: parsed.data.fullName },
        emailRedirectTo: `${window.location.origin}/auth?redirect=${encodeURIComponent(target)}`,
      },
    });
    setBusy(false);
    if (error) return setError(friendlyAuthError(error));
    // With confirmations on, an existing email comes back with no identities.
    if (data.user && (data.user.identities?.length ?? 0) === 0) {
      return setError("An account with this email already exists. Sign in instead.");
    }
    if (!data.session) {
      setPassword("");
      setInfo(
        `We've sent a confirmation link to ${parsed.data.email}. Open it to finish creating your account.`,
      );
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {error && <ErrorNote message={error} />}
      {info && <InfoNote message={info} />}

      {mode === "forgot" && (
        <p className="text-[13.5px] text-ink/65">
          Enter your account email and we'll send you a link to set a new password.
        </p>
      )}

      {mode === "signup" && (
        <label className="block">
          <span className={labelCls}>Full name</span>
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            autoComplete="name"
            className={inputCls}
            placeholder="Priya Sharma"
          />
        </label>
      )}

      <label className="block">
        <span className={labelCls}>Email</span>
        <input
          type="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          className={inputCls}
          placeholder="you@example.com"
        />
      </label>

      {mode !== "forgot" && (
        <label className="block">
          <span className="flex items-center justify-between">
            <span className={labelCls}>Password</span>
            {mode === "signin" && (
              <button
                type="button"
                onClick={() => switchMode("forgot")}
                className="text-[12px] font-medium text-ink/55 hover:text-ink"
              >
                Forgot password?
              </button>
            )}
          </span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            className={inputCls}
            placeholder={mode === "signup" ? "At least 8 characters" : "Your password"}
          />
        </label>
      )}

      <button type="submit" disabled={busy} className={primaryBtn}>
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        {mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset link"}
      </button>

      <p className="text-center text-[13px] text-ink/60">
        {mode === "signin" ? (
          <>
            New to Nestly?{" "}
            <button
              type="button"
              onClick={() => switchMode("signup")}
              className="font-semibold text-ink hover:underline"
            >
              Create an account
            </button>
          </>
        ) : (
          <>
            {mode === "signup" ? "Already have an account? " : "Remembered it? "}
            <button
              type="button"
              onClick={() => switchMode("signin")}
              className="font-semibold text-ink hover:underline"
            >
              Sign in
            </button>
          </>
        )}
      </p>
    </form>
  );
}

function PhonePanel({ onUseEmail }: { onUseEmail: () => void }) {
  const [phoneInput, setPhoneInput] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(t);
  }, [cooldown]);

  async function sendCode(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    const phone = toE164(phoneInput);
    if (!phone) return setError("Enter a valid 10-digit mobile number.");
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({ phone });
    setBusy(false);
    if (error) return setError(friendlyAuthError(error));
    setSentTo(phone);
    setCode("");
    setCooldown(30);
  }

  async function verify(token: string) {
    if (!sentTo || token.length !== 6) return;
    setError(null);
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({ phone: sentTo, token, type: "sms" });
    setBusy(false);
    if (error) {
      setCode("");
      return setError(friendlyAuthError(error));
    }
    // onAuthStateChange in AuthPage handles the redirect.
  }

  const smsUnavailable = error?.startsWith("Phone sign-in isn't available");

  if (!sentTo) {
    return (
      <form onSubmit={sendCode} noValidate className="space-y-4">
        {error && <ErrorNote message={error} />}
        {smsUnavailable && (
          <button
            type="button"
            onClick={onUseEmail}
            className="-mt-2 mb-2 text-[13px] font-semibold text-ink hover:underline"
          >
            Use email instead →
          </button>
        )}
        <label className="block">
          <span className={labelCls}>Mobile number</span>
          <div className="mt-1.5 flex h-11 items-stretch overflow-hidden rounded-xl border border-ink/10 bg-background transition focus-within:border-ink/40 focus-within:ring-2 focus-within:ring-ink/10">
            <span className="grid place-items-center border-r border-ink/10 px-3 text-[14px] font-medium text-ink/60">
              +91
            </span>
            <input
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.target.value.slice(0, 18))}
              placeholder="98765 43210"
              className="min-w-0 flex-1 bg-transparent px-3 text-[14px] text-ink outline-none placeholder:text-ink/35"
            />
          </div>
          <span className="mt-1.5 block text-[12px] text-ink/45">
            Outside India? Start with your country code, e.g. +44…
          </span>
        </label>
        <button type="submit" disabled={busy} className={primaryBtn}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} Send code
        </button>
      </form>
    );
  }

  return (
    <div className="space-y-4">
      {error && <ErrorNote message={error} />}
      <p className="text-[13.5px] text-ink/65">
        Enter the 6-digit code we sent to <span className="font-semibold text-ink">{sentTo}</span>.
      </p>
      <div className="flex justify-center">
        <InputOTP
          maxLength={6}
          value={code}
          onChange={(v) => setCode(v.replace(/\D/g, ""))}
          onComplete={verify}
          disabled={busy}
          inputMode="numeric"
          autoFocus
        >
          <InputOTPGroup>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <InputOTPSlot key={i} index={i} className="h-12 w-11 text-[16px]" />
            ))}
          </InputOTPGroup>
        </InputOTP>
      </div>
      <button
        type="button"
        disabled={busy || code.length !== 6}
        onClick={() => verify(code)}
        className={primaryBtn}
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" />} Verify and continue
      </button>
      <div className="flex items-center justify-between text-[12.5px]">
        <button
          type="button"
          onClick={() => {
            setSentTo(null);
            setError(null);
          }}
          className="text-ink/55 hover:text-ink"
        >
          Change number
        </button>
        <button
          type="button"
          disabled={busy || cooldown > 0}
          onClick={() => sendCode()}
          className="font-semibold text-ink disabled:text-ink/35"
        >
          {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
        </button>
      </div>
    </div>
  );
}
