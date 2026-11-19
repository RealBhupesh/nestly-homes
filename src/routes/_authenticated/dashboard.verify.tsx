import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  BadgeCheck,
  Check,
  Clock,
  FileUp,
  Loader2,
  ShieldCheck,
  Smartphone,
  X,
  XCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, friendlyAuthError, isSmsUnavailableError, toE164 } from "@/hooks/use-auth";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import {
  getMyVerification,
  submitVerification,
  type VerificationRow,
} from "@/lib/verification.functions";

export const Route = createFileRoute("/_authenticated/dashboard/verify")({
  component: VerifyPage,
  head: () => ({
    meta: [
      { title: "Owner verification · Nestly" },
      {
        name: "description",
        content: "Get the verified owner badge on Nestly so seekers trust your listings.",
      },
    ],
  }),
});

const MAX_DOC_BYTES = 10 * 1024 * 1024;
const DOC_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
];
const SMS_VERIFY_UNAVAILABLE =
  "Phone verification isn't available yet. Please try again later or contact support.";

const inputCls =
  "mt-1 h-11 w-full rounded-xl border border-ink/10 bg-background px-3 text-[14px] text-ink outline-none focus:border-ink/40";
const primaryBtn =
  "inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-ink text-[13.5px] font-semibold text-background hover:brightness-110 disabled:opacity-60";

function smsError(err: unknown) {
  return isSmsUnavailableError(err) ? SMS_VERIFY_UNAVAILABLE : friendlyAuthError(err);
}

function VerifyPage() {
  const load = useServerFn(getMyVerification);
  const submit = useServerFn(submitVerification);
  const { user } = useAuth();

  const [state, setState] = useState<{
    request: VerificationRow | null;
    isVerified: boolean;
  } | null>(null);
  const [fullName, setFullName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    load()
      .then((r) => {
        setState(r);
        setFullName(r.request?.full_name ?? "");
      })
      .catch(() => setState({ request: null, isVerified: false }));
  }, []);

  useEffect(() => {
    if (!fullName && user?.user_metadata?.full_name)
      setFullName(String(user.user_metadata.full_name));
  }, [user?.id]);

  const phoneConfirmed = Boolean(user?.phone && user?.phone_confirmed_at);
  const confirmedPhone = user?.phone ? `+${user.phone.replace(/^\+/, "")}` : null;

  function onPickFile(f: File | null) {
    if (!f) return setFile(null);
    if (!DOC_TYPES.includes(f.type)) {
      toast.error("Upload a photo (JPG, PNG, WebP, HEIC) or a PDF.");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    if (f.size > MAX_DOC_BYTES) {
      toast.error("That file is over 10 MB. Try a smaller photo or PDF.");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    setFile(f);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    if (!phoneConfirmed) return toast.error("Verify your phone number first.");
    if (fullName.trim().length < 2) return toast.error("Enter your full legal name.");
    setBusy(true);
    try {
      let documentPath: string | undefined;
      if (file) {
        const safeName =
          file.name
            .normalize("NFKD")
            .replace(/[^A-Za-z0-9._-]+/g, "-")
            .replace(/-+/g, "-")
            .slice(-80) || "document";
        documentPath = `${user.id}/${Date.now()}-${safeName}`;
        const { error: upErr } = await supabase.storage
          .from("verification-docs")
          .upload(documentPath, file, { contentType: file.type, upsert: false });
        if (upErr) throw new Error("Could not upload your document. Please try again.");
      }
      await submit({ data: { fullName: fullName.trim(), documentPath } });
      const r = await load();
      setState(r);
      setFile(null);
      toast.success("Submitted — we'll review it shortly.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not submit");
    } finally {
      setBusy(false);
    }
  }

  const status = state?.isVerified ? "approved" : (state?.request?.status ?? null);
  const canSubmit = !state?.isVerified && (!state?.request || state.request.status === "rejected");

  return (
    <div className="mx-auto max-w-[720px] px-4 py-8 sm:px-6 lg:py-12">
      <header className="mb-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink/45">Trust</p>
        <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
          Owner verification
        </h1>
        <p className="mt-2 text-[14px] text-ink/60">
          Verified owners get a badge on every listing. Seekers reply to verified places far more
          often.
        </p>
      </header>

      {!state || !user ? (
        <div className="flex h-32 items-center justify-center text-ink/40">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : (
        <div className="space-y-6">
          {status && (
            <div className="flex items-start gap-3 rounded-2xl border border-ink/[0.08] bg-card p-4">
              <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink/[0.06] text-ink">
                {status === "approved" ? (
                  <BadgeCheck className="h-4.5 w-4.5" />
                ) : status === "rejected" ? (
                  <XCircle className="h-4.5 w-4.5" />
                ) : (
                  <Clock className="h-4.5 w-4.5" />
                )}
              </span>
              <div className="text-[13.5px] text-ink/70">
                <p className="font-semibold text-ink">
                  {status === "approved"
                    ? "You're a verified owner"
                    : status === "rejected"
                      ? "Not approved yet"
                      : "Under review"}
                </p>
                <p className="mt-1">
                  {status === "approved"
                    ? "The verified badge now shows on your listings and profile."
                    : status === "rejected"
                      ? state.request?.review_note || "Update your details and submit again."
                      : "We usually review within a day. We'll let you know as soon as it's done."}
                </p>
              </div>
            </div>
          )}

          {canSubmit && (
            <>
              <section className="rounded-2xl border border-ink/[0.08] bg-card p-5">
                <StepHeader n={1} title="Verify your phone" done={phoneConfirmed} />
                {phoneConfirmed ? (
                  <p className="mt-3 flex items-center gap-2 text-[13.5px] text-ink/70">
                    <Check className="h-4 w-4 text-teal" /> {confirmedPhone} is verified.
                  </p>
                ) : (
                  <PhoneVerify />
                )}
              </section>

              <form
                onSubmit={onSubmit}
                className={`space-y-4 rounded-2xl border border-ink/[0.08] bg-card p-5 transition ${phoneConfirmed ? "" : "pointer-events-none opacity-50"}`}
                aria-disabled={!phoneConfirmed}
              >
                <StepHeader n={2} title="Your details" done={false} />
                <label className="block">
                  <span className="text-[12px] font-semibold uppercase tracking-wider text-ink/45">
                    Full legal name
                  </span>
                  <input
                    required
                    value={fullName}
                    disabled={!phoneConfirmed}
                    onChange={(e) => setFullName(e.target.value.slice(0, 120))}
                    className={inputCls}
                  />
                </label>

                <div>
                  <span className="text-[12px] font-semibold uppercase tracking-wider text-ink/45">
                    ID or ownership proof{" "}
                    <span className="normal-case tracking-normal text-ink/40">(optional)</span>
                  </span>
                  <p className="mt-1 text-[12.5px] text-ink/50">
                    Aadhaar (masked), PAN, passport, electricity bill or sale deed. JPG, PNG or PDF
                    up to 10 MB.
                  </p>
                  <input
                    ref={fileRef}
                    type="file"
                    accept={DOC_TYPES.join(",")}
                    className="sr-only"
                    id="verification-doc"
                    disabled={!phoneConfirmed}
                    onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
                  />
                  {file ? (
                    <div className="mt-2 flex items-center justify-between gap-3 rounded-xl border border-ink/10 bg-background px-3 py-2.5 text-[13px]">
                      <span className="min-w-0 truncate text-ink">{file.name}</span>
                      <span className="flex shrink-0 items-center gap-2 text-ink/50">
                        {(file.size / 1024 / 1024).toFixed(1)} MB
                        <button
                          type="button"
                          aria-label="Remove file"
                          onClick={() => {
                            setFile(null);
                            if (fileRef.current) fileRef.current.value = "";
                          }}
                          className="rounded-full p-1 hover:bg-ink/[0.06] hover:text-ink"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    </div>
                  ) : (
                    <label
                      htmlFor="verification-doc"
                      className="mt-2 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-ink/15 px-3 py-4 text-[13px] font-medium text-ink/65 hover:border-ink/35 hover:text-ink"
                    >
                      <FileUp className="h-4 w-4" /> Choose a file
                    </label>
                  )}
                </div>

                <p className="text-[12.5px] text-ink/50">
                  Your documents are stored privately and only our review team can see them. They're
                  never shown publicly.
                </p>
                <button type="submit" disabled={busy || !phoneConfirmed} className={primaryBtn}>
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ShieldCheck className="h-4 w-4" />
                  )}{" "}
                  Request verification
                </button>
              </form>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function StepHeader({ n, title, done }: { n: number; title: string; done: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className={`grid h-6 w-6 place-items-center rounded-full text-[11.5px] font-bold ${done ? "bg-teal text-background" : "bg-ink text-background"}`}
      >
        {done ? <Check className="h-3.5 w-3.5" /> : n}
      </span>
      <h2 className="text-[14.5px] font-semibold text-ink">{title}</h2>
    </div>
  );
}

function PhoneVerify() {
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

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    const phone = toE164(phoneInput);
    if (!phone) return setError("Enter a valid 10-digit mobile number.");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ phone });
    setBusy(false);
    if (error) return setError(smsError(error));
    setSentTo(phone);
    setCode("");
    setCooldown(30);
  }

  async function verify(token: string) {
    if (!sentTo || token.length !== 6) return;
    setError(null);
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({ phone: sentTo, token, type: "phone_change" });
    if (error) {
      setBusy(false);
      setCode("");
      return setError(smsError(error));
    }
    // Pull the updated user so phone_confirmed_at propagates via onAuthStateChange.
    await supabase.auth.refreshSession().catch(() => {});
    setBusy(false);
    toast.success("Phone verified");
  }

  if (!sentTo) {
    return (
      <form onSubmit={send} noValidate className="mt-4 space-y-3">
        {error && (
          <p
            role="alert"
            className="rounded-xl bg-destructive/[0.06] px-3 py-2 text-[13px] text-destructive"
          >
            {error}
          </p>
        )}
        <label className="block">
          <span className="text-[12px] font-semibold uppercase tracking-wider text-ink/45">
            Mobile number
          </span>
          <div className="mt-1 flex h-11 items-stretch overflow-hidden rounded-xl border border-ink/10 bg-background focus-within:border-ink/40">
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
        </label>
        <p className="text-[12.5px] text-ink/50">
          We'll text you a 6-digit code. This number is never shown publicly.
        </p>
        <button type="submit" disabled={busy} className={primaryBtn}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Smartphone className="h-4 w-4" />}{" "}
          Send code
        </button>
      </form>
    );
  }

  return (
    <div className="mt-4 space-y-3">
      {error && (
        <p
          role="alert"
          className="rounded-xl bg-destructive/[0.06] px-3 py-2 text-[13px] text-destructive"
        >
          {error}
        </p>
      )}
      <p className="text-[13.5px] text-ink/65">
        Enter the code sent to <span className="font-semibold text-ink">{sentTo}</span>.
      </p>
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
      <button
        type="button"
        disabled={busy || code.length !== 6}
        onClick={() => verify(code)}
        className={primaryBtn}
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" />} Verify phone
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
          onClick={() => send()}
          className="font-semibold text-ink disabled:text-ink/35"
        >
          {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
        </button>
      </div>
    </div>
  );
}
