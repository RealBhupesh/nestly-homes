// Transactional email via the Resend REST API (https://resend.com/docs/api-reference/emails/send-email).
//
// Configure RESEND_API_KEY and EMAIL_FROM (e.g. `Nestly <hello@yourdomain.in>`,
// the domain must be verified in Resend). Without them every send is a no-op
// that logs to console.info, so local dev and preview deploys keep working.
//
// sendEmail() NEVER throws — notification failures must not break the
// user-facing action (sending a message, booking a tour, ...).
// Server-only at runtime (reads process.env); contains no Node-only imports.

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
  /** Optional Reply-To address. */
  replyTo?: string;
}

const DEFAULT_SITE_URL = "https://nestly-homes.vercel.app";

function env(name: string): string | undefined {
  if (typeof process === "undefined" || !process.env) return undefined;
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
}

/** Public origin used for links in emails, without a trailing slash. */
export function siteUrl(): string {
  const raw = env("PUBLIC_SITE_URL") ?? env("VITE_SITE_URL") ?? DEFAULT_SITE_URL;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && u.protocol !== "http:") return DEFAULT_SITE_URL;
    return `${u.protocol}//${u.host}${u.pathname}`.replace(/\/+$/, "");
  } catch {
    return DEFAULT_SITE_URL;
  }
}

export function absoluteSiteUrl(path: string): string {
  return `${siteUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}

export function isEmailConfigured(): boolean {
  return Boolean(env("RESEND_API_KEY") && env("EMAIL_FROM"));
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Minimal, client-safe HTML wrapper. `bodyHtml` must already be escaped.
 */
export function renderEmail(opts: {
  heading: string;
  bodyHtml: string;
  cta?: { label: string; url: string };
  footer?: string;
}): string {
  const cta = opts.cta
    ? `<p style="margin:24px 0"><a href="${escapeHtml(opts.cta.url)}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:999px;font-weight:600">${escapeHtml(opts.cta.label)}</a></p>`
    : "";
  const footer = escapeHtml(
    opts.footer ?? "You're getting this email because you have an account on Nestly.",
  );
  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f6f5f2;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111827">
<div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;padding:28px">
<p style="margin:0 0 16px;font-weight:700;font-size:18px">Nestly</p>
<h1 style="margin:0 0 12px;font-size:20px">${escapeHtml(opts.heading)}</h1>
<div style="font-size:15px;line-height:1.55">${opts.bodyHtml}</div>
${cta}
<p style="margin:24px 0 0;font-size:12px;color:#6b7280">${footer} <a href="${escapeHtml(siteUrl())}" style="color:#6b7280">${escapeHtml(siteUrl().replace(/^https?:\/\//, ""))}</a></p>
</div></body></html>`;
}

/** Send one email. Returns true when Resend accepted it. Never throws. */
export async function sendEmail(msg: EmailMessage): Promise<boolean> {
  try {
    const key = env("RESEND_API_KEY");
    const from = env("EMAIL_FROM");
    if (!key || !from) {
      console.info(`[email] not configured (RESEND_API_KEY/EMAIL_FROM); skipped "${msg.subject}"`);
      return false;
    }
    if (!msg.to || !msg.to.includes("@")) return false;
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [msg.to],
        subject: msg.subject.slice(0, 200),
        html: msg.html,
        ...(msg.text ? { text: msg.text } : {}),
        ...(msg.replyTo ? { reply_to: msg.replyTo } : {}),
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 300);
      console.error(`[email] Resend rejected "${msg.subject}": ${res.status} ${detail}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[email] send failed:", (err as Error)?.message ?? err);
    return false;
  }
}
