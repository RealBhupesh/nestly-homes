import { Link } from "@tanstack/react-router";
import { Logo } from "./Logo";
import { SITE_NAME, SITE_TAGLINE, SUPPORT_EMAIL, COMPANY, mailto } from "@/lib/site";

const linkCls = "text-[13px] text-ink/60 transition-colors hover:text-ink";

export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-ink/10 bg-background">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div className="space-y-3">
          <Logo />
          <p className="max-w-xs text-[13px] leading-relaxed text-ink/60">
            {SITE_TAGLINE}. Rooms, flats and houses listed directly by owners in {COMPANY.city}.
          </p>
        </div>

        <nav aria-label="Explore" className="space-y-3">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink/40">
            Explore
          </h2>
          <ul className="space-y-2">
            <li>
              <Link to="/search" search={{ mode: "rent" }} className={linkCls}>
                Search homes
              </Link>
            </li>
            <li>
              <Link to="/dashboard/new" className={linkCls}>
                Post a listing
              </Link>
            </li>
          </ul>
        </nav>

        <nav aria-label="Company" className="space-y-3">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink/40">
            Company
          </h2>
          <ul className="space-y-2">
            <li>
              <Link to="/about" className={linkCls}>
                About
              </Link>
            </li>
            <li>
              <Link to="/contact" className={linkCls}>
                Contact &amp; grievances
              </Link>
            </li>
            <li>
              <a href={mailto(SUPPORT_EMAIL)} className={linkCls}>
                {SUPPORT_EMAIL}
              </a>
            </li>
          </ul>
        </nav>

        <nav aria-label="Legal" className="space-y-3">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink/40">
            Legal
          </h2>
          <ul className="space-y-2">
            <li>
              <Link to="/terms" className={linkCls}>
                Terms of use
              </Link>
            </li>
            <li>
              <Link to="/privacy" className={linkCls}>
                Privacy policy
              </Link>
            </li>
          </ul>
        </nav>
      </div>
      <div className="border-t border-ink/5">
        <div className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-5 text-[12px] text-ink/45 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>
            © {year} {SITE_NAME}. All rights reserved.
          </p>
          <p>Made in Pune, India · No brokerage, ever.</p>
        </div>
      </div>
    </footer>
  );
}
