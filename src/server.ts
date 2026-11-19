import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

// Structured, single-line JSON error logs. Vercel captures stdout/stderr per
// request, and JSON lines are searchable/filterable in its log explorer and
// in any log drain (Datadog, Axiom, Better Stack, ...).
function logServerError(kind: string, error: unknown, request?: Request) {
  const err = error instanceof Error ? error : undefined;
  let path: string | undefined;
  try {
    path = request ? new URL(request.url).pathname : undefined;
  } catch {
    path = undefined;
  }
  console.error(
    JSON.stringify({
      level: "error",
      kind,
      time: new Date().toISOString(),
      method: request?.method,
      path,
      requestId: request?.headers.get("x-vercel-id") ?? undefined,
      name: err?.name,
      message: err ? err.message : String(error),
      stack: err?.stack,
    }),
  );
}

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(
  response: Response,
  request: Request,
): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  logServerError(
    "ssr_swallowed_error",
    consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`),
    request,
  );
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response, request);
    } catch (error) {
      logServerError("ssr_unhandled_error", error, request);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
