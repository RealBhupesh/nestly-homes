// Central site configuration: brand, canonical origin and legal/contact details.
// Used by SEO meta tags, the sitemap, JSON-LD and the legal/contact pages.

export const SITE_NAME = "Nestly";
export const SITE_TAGLINE = "Rent or buy a home, without the brokers";
export const SITE_DESCRIPTION =
  "Nestly is the direct-from-owner way to find rooms, flats and houses to rent or buy in Pune. Listings come straight from owners, with no brokerage.";

export const DEFAULT_SITE_URL = "https://nestly-homes.vercel.app";

/** Strip trailing slashes and validate; falls back to DEFAULT_SITE_URL on junk input. */
export function normalizeSiteUrl(raw: string | undefined | null): string {
  const value = (raw ?? "").trim();
  if (!value) return DEFAULT_SITE_URL;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return DEFAULT_SITE_URL;
    return `${url.protocol}//${url.host}${url.pathname}`.replace(/\/+$/, "");
  } catch {
    return DEFAULT_SITE_URL;
  }
}

function readServerEnv(name: string): string | undefined {
  // `process` doesn't exist in the browser bundle.
  if (typeof process === "undefined" || !process.env) return undefined;
  return process.env[name];
}

/** Canonical public origin, no trailing slash. Set VITE_SITE_URL (build time) or PUBLIC_SITE_URL (server runtime). */
export const SITE_URL = normalizeSiteUrl(
  (import.meta.env?.VITE_SITE_URL as string | undefined) || readServerEnv("PUBLIC_SITE_URL"),
);

/** Build an absolute URL on the canonical origin. */
export function absoluteUrl(path = "/"): string {
  if (/^https?:\/\//i.test(path)) return path;
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${SITE_URL}${p === "/" ? "/" : p}`;
}

export const OG_IMAGE_PATH = "/og-default.jpg";
export const OG_IMAGE_URL = absoluteUrl(OG_IMAGE_PATH);

// TODO(owner): replace every placeholder below with your real details before launch.
// The IT (Intermediary Guidelines) Rules, 2021 require a named Grievance Officer
// with contact details, and the DPDP Act 2023 requires a contact for data requests.
export const SUPPORT_EMAIL = "support@nestly.app"; // TODO(owner): replace with a monitored inbox
export const PRIVACY_EMAIL = SUPPORT_EMAIL;

export const COMPANY = {
  /** TODO(owner): registered legal entity name (e.g. "Nestly Technologies Private Limited"). */
  legalName: "Nestly (legal entity name to be confirmed)",
  /** TODO(owner): registered office address. */
  address: "Pune, Maharashtra, India",
  city: "Pune",
  country: "India",
} as const;

export const GRIEVANCE_OFFICER = {
  /** TODO(owner): name of the designated Grievance Officer. */
  name: "Grievance Officer (name to be published)",
  email: "grievance@nestly.app", // TODO(owner): replace with a monitored inbox
  address: COMPANY.address,
  /** Acknowledge within 24 hours, resolve within 15 days (IT Rules 2021, Rule 3(2)). */
  acknowledgeWithinHours: 24,
  resolveWithinDays: 15,
} as const;

/** Support response-time commitment shown on the contact page. */
export const SUPPORT_RESPONSE_DAYS = 2;

export const LEGAL_LAST_UPDATED = "19 November 2026";

export function mailto(email: string, subject?: string): string {
  return subject ? `mailto:${email}?subject=${encodeURIComponent(subject)}` : `mailto:${email}`;
}

/** Standard head() meta for a public page: title, description, canonical, OG/Twitter. */
export function pageHead(opts: { title: string; description: string; path: string }) {
  const title = opts.title.includes(SITE_NAME) ? opts.title : `${opts.title} · ${SITE_NAME}`;
  const url = absoluteUrl(opts.path);
  return {
    meta: [
      { title },
      { name: "description", content: opts.description },
      { property: "og:title", content: title },
      { property: "og:description", content: opts.description },
      { property: "og:url", content: url },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: opts.description },
    ],
    links: [{ rel: "canonical", href: url }],
  };
}

/** Dashboard and admin render their own app shell, so they get no marketing footer. */
export function shouldShowSiteFooter(pathname: string): boolean {
  return !/^\/(dashboard|admin)(\/|$)/.test(pathname);
}
