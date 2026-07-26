import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { BadgeCheck, Clock, Loader2, ShieldCheck, XCircle } from "lucide-react";
import { getMyVerification, submitVerification, type VerificationRow } from "@/lib/verification.functions";

export const Route = createFileRoute("/_authenticated/dashboard/verify")({
  component: VerifyPage,
  head: () => ({
    meta: [
      { title: "Owner verification · Nestly" },
      { name: "description", content: "Get the verified owner badge on Nestly so seekers trust your listings." },
    ],
  }),
});

function VerifyPage() {
  const load = useServerFn(getMyVerification);
  const submit = useServerFn(submitVerification);

  const [state, setState] = useState<{ request: VerificationRow | null; isVerified: boolean } | null>(null);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    load()
      .then((r) => {
        setState(r);
        setFullName(r.request?.full_name ?? "");
        setPhone(r.request?.phone ?? "");
      })
      .catch(() => setState({ request: null, isVerified: false }));
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await submit({ data: { fullName, phone } });
      const r = await load();
      setState(r);
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
        <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">Owner verification</h1>
        <p className="mt-2 text-[14px] text-ink/60">
          Verified owners get a badge on every listing. Seekers reply to verified places far more often.
        </p>
      </header>

      {!state ? (
        <div className="flex h-32 items-center justify-center text-ink/40">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : (
        <div className="space-y-6">
          {status && (
            <div className="flex items-start gap-3 rounded-2xl border border-ink/[0.08] bg-card p-4">
              <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink/[0.06] text-ink">
                {status === "approved" ? <BadgeCheck className="h-4.5 w-4.5" /> : status === "rejected" ? <XCircle className="h-4.5 w-4.5" /> : <Clock className="h-4.5 w-4.5" />}
              </span>
              <div className="text-[13.5px] text-ink/70">
                <p className="font-semibold text-ink">
                  {status === "approved" ? "You're a verified owner" : status === "rejected" ? "Not approved yet" : "Under review"}
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
            <form onSubmit={onSubmit} className="space-y-4 rounded-2xl border border-ink/[0.08] bg-card p-5">
              <label className="block">
                <span className="text-[12px] font-semibold uppercase tracking-wider text-ink/45">Full legal name</span>
                <input
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value.slice(0, 120))}
                  className="mt-1 h-11 w-full rounded-xl border border-ink/10 bg-background px-3 text-[14px] text-ink outline-none focus:border-ink/40"
                />
              </label>
              <label className="block">
                <span className="text-[12px] font-semibold uppercase tracking-wider text-ink/45">Contact phone</span>
                <input
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.slice(0, 24))}
                  placeholder="+91…"
                  className="mt-1 h-11 w-full rounded-xl border border-ink/10 bg-background px-3 text-[14px] text-ink outline-none focus:border-ink/40"
                />
              </label>
              <p className="text-[12.5px] text-ink/50">
                We only use these details to confirm you're a real owner or manager. They're never shown publicly.
              </p>
              <button
                type="submit"
                disabled={busy}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-ink text-[13.5px] font-semibold text-background hover:brightness-110 disabled:opacity-60"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Request verification
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
