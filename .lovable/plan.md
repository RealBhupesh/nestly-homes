# Nestly — Full Feature Rollout

Eleven features, grouped into five sprints. Each sprint ships something usable end-to-end; I'll do one per turn and check in.

## Sprint 1 — Tour scheduling + Verified owner badge
- Owner availability slots (weekly recurring + one-off) managed from the dashboard.
- Seeker books a slot from the listing page; both sides see it in the existing inbox thread.
- Downloadable calendar invite (.ics) and status flow: requested → confirmed → completed/cancelled.
- Owner verification: phone OTP + optional document upload, admin review queue, "Verified owner" badge on cards and listing detail.

## Sprint 2 — Saved-search alerts + typo-tolerant search
- Saved searches gain an alert frequency (off / instant / daily) and last-notified timestamp.
- Hourly scheduled job matches new listings against saved searches; email + in-app badge with real match counts.
- Postgres full-text + trigram search so "kothrud 1bhk furnised" still returns results; wired into /search and the AI search fallback.

## Sprint 3 — Offers + rent benchmarking + listing quality score
- Seekers send a formal offer (amount, move-in date, duration); owners accept / counter / decline inside the thread.
- Rent benchmarking: "similar 2BHKs in Kothrud go for ₹18–22k" computed from your own listings.
- Listing quality score in the owner dashboard with concrete nudges driven by real view/like data.

## Sprint 4 — Roommate matching
- Roommate profile: budget range, city, move-in, lifestyle (smoking, pets, sleep schedule, cleanliness, WFH).
- Card feed with a weighted compatibility score; mutual like auto-opens a chat thread.

## Sprint 5 — Split-rent groups + neighborhood guides
- Groups: invite 2–5 people, shared shortlist, vote on places, one group thread with the owner, per-person rent split.
- SEO neighborhood pages (`/neighborhoods/$slug`) with live listing counts, average rent, landmarks, map, and top listings; seeded with the top 12 Pune areas. Sitemap picks them up.

## Technical notes
- Every new table follows CREATE → GRANT → RLS → POLICY, with `service_role` grants for server functions.
- All new backend logic uses `createServerFn` with `requireSupabaseAuth` and Zod validation; the alerts job uses a public API route called by a scheduled job.
- Realtime enabled on bookings, offers, and group activity so the inbox stays live.
- New UI reuses the existing editorial tokens, glass shell, and Inter/Lora type scale — no new design language.
- Typecheck runs after each sprint before I hand back.

## Rhythm
I'll build Sprint 1 next and pause for your reaction. Say "don't stop" and I'll run straight through all five.
