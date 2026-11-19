// Fixed-window rate limiter for server code (server functions / API routes).
//
// * If UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN are set, counters live
//   in Upstash Redis (shared across all serverless instances) via its REST API.
// * Otherwise, or if Upstash is unreachable, it falls back to an in-memory Map
//   (per instance — good enough to stop casual abuse, not a hard guarantee).
//
// Server-only at runtime (reads process.env); contains no Node-only imports.

export interface RateLimitResult {
  ok: boolean;
  /** Requests left in the current window (never negative). */
  remaining: number;
  /** Seconds until the current window resets. */
  resetSec: number;
}

interface MemEntry {
  count: number;
  resetAt: number;
}

const memory = new Map<string, MemEntry>();
const MAX_MEMORY_KEYS = 10_000;

function env(name: string): string | undefined {
  if (typeof process === "undefined" || !process.env) return undefined;
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
}

function memoryHit(key: string, limit: number, windowSec: number): RateLimitResult {
  const now = Date.now();
  let entry = memory.get(key);
  if (!entry || entry.resetAt <= now) {
    if (memory.size >= MAX_MEMORY_KEYS) {
      for (const [k, v] of memory) {
        if (v.resetAt <= now) memory.delete(k);
      }
      // Still full: drop the oldest insertion.
      if (memory.size >= MAX_MEMORY_KEYS) {
        const first = memory.keys().next().value;
        if (first !== undefined) memory.delete(first);
      }
    }
    entry = { count: 0, resetAt: now + windowSec * 1000 };
    memory.set(key, entry);
  }
  entry.count += 1;
  return {
    ok: entry.count <= limit,
    remaining: Math.max(0, limit - entry.count),
    resetSec: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
  };
}

async function upstashHit(
  url: string,
  token: string,
  key: string,
  limit: number,
  windowSec: number,
): Promise<RateLimitResult> {
  const nowSec = Math.floor(Date.now() / 1000);
  const windowStart = nowSec - (nowSec % windowSec);
  const redisKey = `rl:${key}:${windowStart}`;
  const res = await fetch(`${url.replace(/\/+$/, "")}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify([
      ["INCR", redisKey],
      ["EXPIRE", redisKey, String(windowSec + 5)],
    ]),
    signal: AbortSignal.timeout(2000),
  });
  if (!res.ok) throw new Error(`Upstash ${res.status}`);
  const json = (await res.json()) as Array<{ result?: unknown; error?: string }>;
  const count = Number(json?.[0]?.result);
  if (!Number.isFinite(count)) throw new Error("Upstash: bad INCR result");
  return {
    ok: count <= limit,
    remaining: Math.max(0, limit - count),
    resetSec: Math.max(1, windowStart + windowSec - nowSec),
  };
}

/**
 * Count one hit against `key` and report whether it is within `limit` hits
 * per `windowSec` seconds. Never throws.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowSec: number,
): Promise<RateLimitResult> {
  const url = env("UPSTASH_REDIS_REST_URL");
  const token = env("UPSTASH_REDIS_REST_TOKEN");
  if (url && token) {
    try {
      return await upstashHit(url, token, key, limit, windowSec);
    } catch (err) {
      console.warn(
        "[rate-limit] Upstash unavailable, using in-memory fallback:",
        (err as Error).message,
      );
    }
  }
  return memoryHit(key, limit, windowSec);
}

/** Throws a user-friendly error when the limit is exceeded. */
export async function enforceRateLimit(
  key: string,
  limit: number,
  windowSec: number,
  message = "You're doing that too often. Please wait a moment and try again.",
): Promise<void> {
  const r = await rateLimit(key, limit, windowSec);
  if (!r.ok) throw new Error(message);
}

/** Best-effort client IP from proxy headers (Vercel sets x-forwarded-for). */
export function clientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}
