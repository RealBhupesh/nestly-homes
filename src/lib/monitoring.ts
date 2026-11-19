// Client-side error monitoring. Sentry is loaded lazily and ONLY when
// VITE_SENTRY_DSN is set at build time, so it adds nothing to the bundle's
// critical path (and nothing at all on the server).

type SentryModule = typeof import("@sentry/react");

const DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;

let sentryPromise: Promise<SentryModule | null> | undefined;

export function isMonitoringEnabled(): boolean {
  return typeof window !== "undefined" && !!DSN;
}

/** Initialise Sentry once on the client. Safe to call repeatedly. */
export function initMonitoring(): Promise<SentryModule | null> {
  if (!isMonitoringEnabled()) return Promise.resolve(null);
  if (!sentryPromise) {
    sentryPromise = import("@sentry/react")
      .then((Sentry) => {
        Sentry.init({
          dsn: DSN,
          environment:
            (import.meta.env.VITE_SENTRY_ENVIRONMENT as string | undefined) ?? import.meta.env.MODE,
          release: import.meta.env.VITE_SENTRY_RELEASE as string | undefined,
          tracesSampleRate: Number(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE ?? 0),
          // Data minimisation (DPDP Act): no user info, cookies, headers or bodies.
          dataCollection: {
            userInfo: false,
            cookies: false,
            httpHeaders: false,
            httpBodies: [],
          },
        });
        return Sentry;
      })
      .catch((err) => {
        console.warn("[monitoring] Sentry failed to load", err);
        return null;
      });
  }
  return sentryPromise;
}

/** Forward an error to Sentry when enabled; no-op otherwise. */
export function captureError(error: unknown, context?: Record<string, unknown>): void {
  if (!isMonitoringEnabled()) return;
  // A thrown Response isn't an Error; give Sentry something readable.
  const normalized =
    error instanceof Response
      ? new Error(`Response ${error.status}${error.url ? ` at ${error.url}` : ""}`)
      : error;
  // Errors raised before the SDK finishes loading are reported once it's ready.
  void initMonitoring().then((Sentry) => {
    Sentry?.captureException(normalized, context ? { extra: context } : undefined);
  });
}
