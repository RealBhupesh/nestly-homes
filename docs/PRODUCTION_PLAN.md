# Nestly: Production Readiness Audit & Launch Plan

_Audit date: 19 Nov 2026 · Stack: TanStack Start + React 19 + Supabase, deployed to Vercel, built in Lovable_

---

## 1. Where things stand

**Good news**
- TypeScript typecheck passes and the production build (Vercel output) succeeds.
- The core pieces are solid: the owner listing form, admin panel, audit log and map with clustering.
- The admin role model is sound. Admins come only from the `user_roles` table, and users can't promote themselves.
- No secrets are committed. The service-role key stays on the server.

**The hard truth: today it's a polished demo, not a working marketplace.**

| # | Blocker | Why it matters |
|---|---|---|
| 1 | **Every visitor is auto-logged into one shared demo account** (`src/lib/demo-auth.ts`, password in the JS bundle). | Everyone sees everyone's messages, tours and saved searches. There's no real sign-up or login. |
| 2 | **Public pages show 42 fake in-memory listings** (`src/lib/listings-data.ts`), not the database. | Listings that owners create never appear on home, search or detail. The dashboard "View" link goes to a 404. |
| 3 | **Messages and tour requests never reach owners.** `owner_id` is never passed (`listing.$id.tsx:508`). | The core "contact owner" loop is broken. |
| 4 | **Security holes in database permissions (RLS)** | Users can do things they shouldn't, listed below. |
| 5 | **"Verified owner" badge is fake.** It comes from `i % 3` on seed data, there's no real SMS OTP and no document upload. | Trust feature is misleading, which is a legal and reputational risk. |
| 6 | **No notifications at all.** No email or SMS for messages, tours or saved-search alerts. The alert job has no schedule and no real secret. | Users never come back. |
| 7 | **AI features only work inside Lovable Cloud.** They need `LOVABLE_API_KEY`, have no auth and no rate limit. | They break on Vercel, and anyone can burn your credits. |

What the database permission holes let users do:
- Make themselves a verified owner.
- Edit other people's messages.
- Add photos to other people's listings.
- Feature their own listings.
- Send fake conversations to anyone.
- Self-confirm tours.

---

## 2. Feature inventory

| Feature | Status | Notes |
|---|---|---|
| Public listings (home, search, detail) | 🔴 Fake data | Seed array and Unsplash photos. Owner names, "posted X days ago" and verified badges are made up. |
| Owner listing create / edit | 🟢 Works (DB) | Never visible publicly (see blocker #2). |
| Photo upload | 🟡 Partial | Checks run in the browser only. No compression or EXIF stripping (exposes owner GPS location). Stores 10-year signed URLs. |
| AI listing autofill | 🟡 Partial | Lovable gateway only. No auth or rate limit. |
| Filters / sort | 🟡 Partial | Runs in the browser on seed data. The server-side typo-tolerant search exists in the DB but is never called. |
| Natural-language search | 🟡 Partial | Same AI gateway issue. Type values don't match the DB. |
| Map | 🟢 Works | MapLibre + OpenFreeMap (free, no key). |
| Place search / geocoding | 🟡 Risky | Public Nominatim called from the browser. Breaks its usage policy at scale, so you'll get blocked. |
| Commute filter | 🟡 Estimate | Straight-line distance ÷ speed, 5 hard-coded Pune spots. |
| Messaging / inbox | 🔴 Broken | Owners never receive messages. No email or push. |
| Tour booking + calendar (.ics) | 🟡 Partial | Works only for DB listings. Bookings on seed listings are lost. |
| Verified owner | 🔴 Fake | No OTP, no docs, fake badge. |
| Saved searches + alerts | 🟡 Partial | Counts are fake. No emails, no scheduler. |
| Reviews | 🟡 Partial | Anyone can review. No proof of stay, no reporting. |
| Likes / views analytics | 🟡 Partial | Views are logged for fake IDs, so the owner dashboard shows ~0. |
| Compare | 🟢 Works on seed | Stored in the browser only. |
| Share | 🟡 Partial | Detail-page Share button does nothing. |
| Auth (sign-up, login, reset, Google) | 🔴 Missing | Demo account only. |
| Admin panel (11 pages) | 🟢 Works | Moderates DB listings nobody can see yet. Feature flags are never read. |
| SEO | 🟡 Partial | Sitemap is broken (relative URLs, only `/`). OG image is a Lovable URL. No JSON-LD. |
| Landing-page stats ("12,400+ seekers", "4.9★") | 🔴 Fake | Must remove or make real before launch. |
| Legal pages, contact, footer | 🔴 Missing | Required under India's DPDP Act 2023. |
| Offers, rent benchmark, quality score, roommates, split-rent groups, neighbourhood pages | ⚪ Not built | Sprints 3–5 of `.lovable/plan.md`. |
| Tests / CI / error monitoring / analytics | 🔴 Missing | Zero tests. ~2,200 lint errors (mostly formatting, ~40 real). |
| Hindi / Marathi | ⚪ Not built | |
| Payments | ⚪ Not built | |

---

## 3. The plan

Each phase ends with something shippable. Rough effort assumes one developer working with AI assistance.

### Phase 0: Make it safe (≈ 1 week) 🚨 must happen before any real user

1. **Real authentication**
   - Remove `demo-auth.ts` and the auto-login gate.
   - Build sign-up and login: email + password, phone OTP (India-first) and Google sign-in.
   - Add password reset, email verification and a working sign-out.
2. **Lock down the database.** One new migration that does all of this:
   - Column-level grants:
     - `profiles`: users can't set `is_verified_owner`.
     - `messages`: only `read_at` can be updated.
     - `listings`: owners can't set `is_featured`.
     - `conversations` / `tour_bookings`: protected fields can't be changed.
   - Fix the `listing_photos` insert check: the caller must own the listing.
   - Set `owner_id` server-side, by trigger, from the listing row.
   - Only owners can confirm tours. Lock the slot row to stop double-booking.
   - Users can't send `system` or `booking` message types.
   - Add the missing indexes.
3. **Protect endpoints**
   - Alerts hook: use a real `CRON_SECRET`.
   - AI functions: require login, add per-user rate limits (e.g. Upstash Redis).
   - Thumbnail proxy: block redirects and allow image content only.
4. **Storage:** set bucket MIME and size limits, and replace the 10-year signed URLs with public URLs for published photos.
5. **Remove fake claims:** stats, "replies within a day", fake verified badges.

### Phase 1: Make the marketplace real (≈ 2 weeks)

1. **Switch public pages to the database.** Home, search, detail, compare, public API and sitemap all read published `listings` + `listing_photos`, with:
   - Server-side filtering, sorting and pagination.
   - Map viewport (bounding-box) queries.
   - The existing trigram RPC for typo-tolerant search.
2. **Delete the seed data** (or keep it only as a dev seed script) and fix every page that used it.
3. **Fix the owner ↔ seeker loop**
   - Messages and tours reach the right owner.
   - Tour bookings show up in the inbox thread.
   - Show the real verified badge.
4. **Image pipeline:** resize and compress to WebP on upload, strip EXIF, handle HEIC from iPhones.
5. **Owner vs seeker profiles** (one account can be both): profile page, avatar, contact preferences, phone reveal rules.
6. **Report a listing / user / review**, feeding the existing admin moderation queue.

### Phase 2: Trust, notifications & compliance (≈ 1.5 weeks)

1. **Transactional email** (Resend, or AWS SES for cost) for:
   - New message, tour requested / confirmed / cancelled.
   - Saved-search alerts, account emails.
2. **SMS / WhatsApp** (MSG91 or Gupshup; needs Indian DLT template registration) for OTP and tour reminders.
3. **Real owner verification**
   - Phone OTP.
   - Private document upload bucket.
   - Admin review using signed URLs.
   - Optionally DigiLocker or Aadhaar-offline e-KYC later.
4. **Schedule the alerts job** with Vercel Cron or Supabase `pg_cron`, plus an in-app notifications bell.
5. **Legal and support**
   - Terms, privacy policy (DPDP Act), cookie notice.
   - Contact / grievance officer page (required by India's IT Rules for intermediaries).
   - Footer, about, help/FAQ.
6. **Account deletion and data export** (DPDP rights).
7. **Review rules:** only users who toured or messaged can review, plus anti-spam.

### Phase 3: Production engineering (≈ 1 week, runs alongside Phases 1–2)

1. **Environments:** separate Supabase projects for dev, staging and prod. Migrations go through the Supabase CLI. Document env vars.
2. **CI (GitHub Actions):** lint, typecheck, test and build on every PR, plus a Vercel preview deploy.
3. **Tests**
   - Vitest for server functions and filter logic.
   - Playwright end-to-end tests for: sign up → post listing → search → message → book tour.
   - RLS tests (pgTAP) proving users can't touch others' data.
4. **Monitoring:** Sentry for errors, uptime checks, Supabase log alerts, and product analytics (PostHog).
5. **Performance**
   - Remove unused `three` / `@react-three/*` and dead components.
   - Code-split recharts (admin only).
   - Use image CDN / Vercel Image Optimization.
   - Load-test search.
6. **Abuse protection:** rate limits on messages, bookings and reviews. CAPTCHA (Cloudflare Turnstile) on sign-up and contact.
7. **Geocoding:** proxy and cache through your server, or move to a keyed provider (Google Places, Ola Maps, MapmyIndia).
8. **Backups:** enable Supabase Point-in-Time Recovery on a paid plan. Write a restore runbook.
9. **Clean-up:** fix the ~40 real lint errors (mostly `any` types), run Prettier once, add a pre-commit hook.

### Phase 4: Launch (≈ 3–5 days)

- Custom domain, HTTPS, `www` redirect.
- Fixed sitemap with absolute URLs, `Sitemap:` in robots.txt, canonical tags.
- JSON-LD (`Residence` / `Offer`), first-party OG images. Submit to Google Search Console.
- Accessibility pass (alt text, focus traps in modals, contrast).
- Seed real inventory: onboard 50–200 genuine Pune owners/PGs before opening to seekers. A marketplace with no listings dies.
- Soft launch (beta invite) → fix → public launch.

### Phase 5: Growth features (post-launch, prioritise by user feedback)

Order is by likely value:

1. Neighbourhood SEO pages (`/neighborhoods/kothrud` etc.): big organic traffic win.
2. Rent benchmarking ("similar 2BHKs in Kothrud: ₹18–22k").
3. Listing quality score with nudges for owners.
4. Offers / negotiation inside chat.
5. Roommate matching.
6. Split-rent groups.
7. Real commute times (OSRM / Google Distance Matrix, Pune Metro + PMPML transit).
8. Hindi / Marathi UI.
9. Monetisation: featured listings, owner subscription, or a lead fee via Razorpay. Note GST invoicing.
10. Mobile: PWA first, React Native later if traction.

---

## 4. Things you'll need to set up (accounts & recurring costs)

| Service | Purpose | Rough cost at start |
|---|---|---|
| Supabase Pro | DB, auth, storage, backups | $25/mo |
| Vercel Pro | Hosting (Hobby plan disallows commercial use) | $20/mo |
| Domain | e.g. nestly.in | ~₹800/yr |
| Resend / SES | Email | Free → ~$20/mo |
| MSG91 / Twilio | SMS OTP (+ DLT registration in India) | ~₹0.20–0.25 per SMS |
| AI provider (OpenAI / Anthropic / Google) | Replace Lovable AI gateway | Usage-based, small |
| Upstash Redis | Rate limiting | Free tier |
| Sentry, PostHog | Errors, analytics | Free tiers |
| Geocoding (Google / Ola Maps) | Address search | Free tier → usage |

**Legal:** register the business entity, get a privacy policy and terms reviewed by a lawyer, appoint a grievance officer, and check RERA rules if you ever list properties for **sale** (brokerage).

---

## 5. Open questions to discuss

1. **Target launch scope:** rentals only in Pune first, or sale listings too? (Sale brings in RERA.)
2. **Who posts listings:** owners only, or brokers/PG operators too (no-broker positioning)?
3. **Business model:** free at launch? Which paid feature first?
4. **Stay on Lovable** for UI edits, or move fully to code? This affects how we manage migrations and environments.
5. **Login methods:** phone OTP as primary (most Indian users expect it) plus Google?
6. **Which Phase 5 features** matter most to you?
7. **Timeline / budget:** Phases 0–4 are roughly 6–7 weeks of focused work.
