import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ensureDemoSession } from "@/lib/demo-auth";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Demo access — Nestly" },
      { name: "description", content: "Signing you into the Nestly demo workspace." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const session = await ensureDemoSession();
        if (cancelled) return;
        if (session) navigate({ to: "/dashboard", replace: true });
        else setError("Couldn't start the demo session. Please retry.");
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Unknown error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-sm text-center">
        <Link to="/" className="inline-block text-2xl font-black tracking-tight text-ink">
          Nestly
        </Link>
        <p className="mt-8 text-xs font-semibold uppercase tracking-[0.24em] text-ink/50">
          Demo mode
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-ink">
          {error ? "Something went wrong" : "Signing you in…"}
        </h1>
        <p className="mt-3 text-sm text-ink/60">
          {error ?? "We're loading the shared demo workspace so you can explore the dashboard."}
        </p>
        {error && (
          <button
            onClick={() => window.location.reload()}
            className="mt-6 rounded-full bg-ink px-5 py-2.5 text-[13px] font-semibold text-background hover:bg-ink/85"
          >
            Try again
          </button>
        )}
      </div>
    </div>
  );
}