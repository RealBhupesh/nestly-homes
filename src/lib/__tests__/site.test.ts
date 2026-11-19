import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_SITE_URL,
  SITE_NAME,
  absoluteUrl,
  mailto,
  normalizeSiteUrl,
  pageHead,
  shouldShowSiteFooter,
} from "@/lib/site";

describe("normalizeSiteUrl", () => {
  it("falls back to the default for empty or invalid input", () => {
    expect(normalizeSiteUrl(undefined)).toBe(DEFAULT_SITE_URL);
    expect(normalizeSiteUrl("")).toBe(DEFAULT_SITE_URL);
    expect(normalizeSiteUrl("not a url")).toBe(DEFAULT_SITE_URL);
    expect(normalizeSiteUrl("ftp://example.com")).toBe(DEFAULT_SITE_URL);
  });

  it("strips trailing slashes, query and hash", () => {
    expect(normalizeSiteUrl("https://nestly.in/")).toBe("https://nestly.in");
    expect(normalizeSiteUrl("https://nestly.in///")).toBe("https://nestly.in");
    expect(normalizeSiteUrl(" https://nestly.in/?a=1#x ")).toBe("https://nestly.in");
  });

  it("keeps ports and sub-paths", () => {
    expect(normalizeSiteUrl("http://localhost:3000")).toBe("http://localhost:3000");
    expect(normalizeSiteUrl("https://example.com/nestly/")).toBe("https://example.com/nestly");
  });
});

describe("SITE_URL from env", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("uses VITE_SITE_URL when set", async () => {
    vi.stubEnv("VITE_SITE_URL", "https://www.nestly.in/");
    vi.resetModules();
    const mod = await import("@/lib/site");
    expect(mod.SITE_URL).toBe("https://www.nestly.in");
    expect(mod.OG_IMAGE_URL).toBe("https://www.nestly.in/og-default.jpg");
  });

  it("falls back to PUBLIC_SITE_URL on the server", async () => {
    vi.stubEnv("VITE_SITE_URL", undefined as unknown as string);
    vi.stubEnv("PUBLIC_SITE_URL", "https://server.nestly.in");
    vi.resetModules();
    const mod = await import("@/lib/site");
    expect(mod.SITE_URL).toBe("https://server.nestly.in");
  });
});

describe("absoluteUrl", () => {
  it("joins paths onto the site origin", () => {
    const origin = absoluteUrl("/").replace(/\/$/, "");
    expect(absoluteUrl("/terms")).toBe(`${origin}/terms`);
    expect(absoluteUrl("privacy")).toBe(`${origin}/privacy`);
    expect(absoluteUrl()).toBe(`${origin}/`);
  });

  it("leaves absolute URLs alone", () => {
    expect(absoluteUrl("https://cdn.example.com/a.jpg")).toBe("https://cdn.example.com/a.jpg");
  });
});

describe("mailto", () => {
  it("builds mailto links with an encoded subject", () => {
    expect(mailto("a@b.in")).toBe("mailto:a@b.in");
    expect(mailto("a@b.in", "Report a listing & more")).toBe(
      "mailto:a@b.in?subject=Report%20a%20listing%20%26%20more",
    );
  });
});

describe("pageHead", () => {
  it("adds the brand to the title, a description and a canonical link", () => {
    const head = pageHead({
      title: "Privacy policy",
      description: "How we handle data",
      path: "/privacy",
    });
    expect(head.meta).toContainEqual({ title: `Privacy policy · ${SITE_NAME}` });
    expect(head.meta).toContainEqual({ name: "description", content: "How we handle data" });
    expect(head.meta).toContainEqual({ property: "og:url", content: absoluteUrl("/privacy") });
    expect(head.links).toEqual([{ rel: "canonical", href: absoluteUrl("/privacy") }]);
  });

  it("doesn't duplicate the brand when the title already has it", () => {
    const head = pageHead({ title: `About ${SITE_NAME}`, description: "x", path: "/about" });
    expect(head.meta[0]).toEqual({ title: `About ${SITE_NAME}` });
  });
});

describe("shouldShowSiteFooter", () => {
  it("hides the footer inside the dashboard and admin shells", () => {
    expect(shouldShowSiteFooter("/dashboard")).toBe(false);
    expect(shouldShowSiteFooter("/dashboard/new")).toBe(false);
    expect(shouldShowSiteFooter("/admin/users")).toBe(false);
  });

  it("shows it on public pages", () => {
    expect(shouldShowSiteFooter("/")).toBe(true);
    expect(shouldShowSiteFooter("/search")).toBe(true);
    expect(shouldShowSiteFooter("/listing/abc")).toBe(true);
    expect(shouldShowSiteFooter("/dashboards-are-cool")).toBe(true);
  });
});
