# Nestly: Launch Checklist (manual steps)

The code for Phases 0–4 of `PRODUCTION_PLAN.md` is in the repo. The steps below need **your** accounts or dashboards; code can't do them.

## 1. Apply the database migration (required, security fixes)

`supabase/migrations/20261119120000_production_hardening.sql`

The database is managed by Lovable Cloud, so apply the migration from Lovable: ask the Lovable agent to run this migration file, or paste it into Lovable Cloud's SQL editor. It is idempotent, so running it twice is safe.

Until it's applied:
- **Reporting:** users see "Reporting isn't available yet".
- **ID upload on the verify page:** fails, because the `verification-docs` bucket doesn't exist yet.
- **Direct database access:** someone bypassing the app can still abuse permissions. The app's own server code already enforces the rules.

## 2. Auth settings (Lovable Cloud → Users / Auth settings)

- **URLs:**
  - Site URL = your production URL.
  - Redirect URLs: `https://<domain>/**`, your Vercel preview URLs and `http://localhost:*/**`.
- **Google sign-in:** create an OAuth client in Google Cloud and enable the Google provider. The authorised redirect URI is `https://<project-ref>.supabase.co/auth/v1/callback`.
- **Phone OTP:** enable the Phone provider with an SMS provider (MSG91 or Twilio). Indian SMS needs DLT-registered sender ID and templates. Until then the phone tabs show "Phone sign-in isn't available yet — use email".
- **Email:** keep confirmations on and set up custom SMTP (the built-in sender is heavily rate-limited). Brand the confirm, reset-password and change-phone templates.
- **Delete the old shared demo account** `demo@nestly.app` and its data.
- **Make yourself an admin:**

  ```sql
  insert into public.user_roles (user_id, role)
  values ('<your-user-id>', 'admin');
  ```

## 3. Vercel environment variables

| Variable | Needed for |
|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID` | already set (build time) |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | public listings, sitemap, admin. **Required:** public pages show errors without the service-role key. |
| `PUBLIC_SITE_URL`, `VITE_SITE_URL` | canonical URLs, sitemap, email links |
| `CRON_SECRET` | daily saved-search alert job (Vercel Cron sends it automatically once set) |
| `RESEND_API_KEY`, `EMAIL_FROM` | email notifications (messages, tours, alerts). Without them, emails are silently skipped. |
| `AI_API_URL`, `AI_API_KEY`, `AI_MODEL` (OpenAI-compatible) or `LOVABLE_API_KEY` | AI search & listing autofill |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | shared rate limiting (falls back to per-instance memory) |
| `VITE_SENTRY_DSN` | error monitoring (optional) |

See `.env.example` for details.

## 4. Content and legal

- **Placeholders:** replace them in `src/lib/site.ts`: support email, grievance officer, legal entity name and address.
- **Lawyer review:** have `/terms` and `/privacy` reviewed.
- **Custom domain:** when you move to one, update the `Sitemap:` line in `public/robots.txt`.

## 5. Inventory

Public pages now show **only real published listings**. The 42 sample listings are gone, so the site is empty until owners post. Onboard real owners before inviting seekers.

## Known limitations

- **Login checks happen in the browser.** Visiting a protected page while signed out triggers a harmless React hydration warning before redirecting to `/auth`.
- **Saved searches** don't yet store the min-price, bedroom or place filters.
- **Search page** is rendered in the browser; home and listing pages are server-rendered.
- **Not started:** Phase 5 growth features (neighbourhood pages, benchmarking, offers, roommates, groups, Hindi/Marathi, payments).
