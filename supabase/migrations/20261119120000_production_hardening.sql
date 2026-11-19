-- =============================================================================
-- Production hardening (Phase 0 of docs/PRODUCTION_PLAN.md)
--
-- Closes the RLS / integrity holes found in the audit:
--   * users could mark themselves as verified owners
--   * users could edit the body/sender/kind of any message in their threads
--   * users could attach photos to other people's listings
--   * owners could feature their own listings
--   * conversations/tour bookings trusted a client-supplied owner_id
--   * seekers could self-confirm tours; tour slot capacity had a race
--   * anyone could log listing views on behalf of another user
-- plus missing indexes, storage limits, a private verification-docs bucket
-- and a new content_reports table.
--
-- The whole file is idempotent (IF NOT EXISTS / DROP ... IF EXISTS /
-- CREATE OR REPLACE / ON CONFLICT) so it is safe to run more than once.
--
-- "Trusted" writes = service-role requests (the server's supabaseAdmin
-- client) or direct DB sessions with no JWT at all (SQL editor, migrations,
-- cron, GoTrue's own triggers). Everything else is an end-user request.
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 0. Helper: is this request trusted (service role / no JWT)?
--    Reads the PostgREST JWT settings directly, so the answer does not depend
--    on current_user (and therefore also works inside SECURITY DEFINER code).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.is_trusted_request()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_claims text := nullif(current_setting('request.jwt.claims', true), '');
  v_role   text := nullif(current_setting('request.jwt.claim.role', true), '');
BEGIN
  IF v_role IS NULL AND v_claims IS NOT NULL THEN
    v_role := v_claims::jsonb ->> 'role';
  END IF;
  -- No JWT context at all: direct database session, not an API request.
  IF v_role IS NULL AND v_claims IS NULL THEN
    RETURN true;
  END IF;
  RETURN coalesce(v_role = 'service_role', false);
END;
$$;
REVOKE ALL ON FUNCTION private.is_trusted_request() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.is_trusted_request() TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 1. profiles: only staff can set is_verified_owner / verified_at.
--    Users keep updating display_name / avatar_url as before.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.profiles_guard_verification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF private.is_trusted_request() OR private.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.is_verified_owner := false;
    NEW.verified_at := NULL;
  ELSIF NEW.is_verified_owner IS DISTINCT FROM OLD.is_verified_owner
     OR NEW.verified_at IS DISTINCT FROM OLD.verified_at THEN
    RAISE EXCEPTION 'Verification status can only be changed by Nestly staff'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.profiles_guard_verification() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS profiles_guard_verification_trg ON public.profiles;
CREATE TRIGGER profiles_guard_verification_trg
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_guard_verification();

-- -----------------------------------------------------------------------------
-- 2. messages
--    * users can only send kind = 'text' as themselves ('system'/'booking'
--      messages are written by the server with the service role)
--    * updates: only read_at may change, and only by the recipient
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Participants can send messages" ON public.messages;
CREATE POLICY "Participants can send messages"
  ON public.messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND kind = 'text'
    AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id
        AND (c.seeker_id = auth.uid() OR c.owner_id = auth.uid()::text)
    )
  );

DROP POLICY IF EXISTS "Participants can mark messages read" ON public.messages;
CREATE POLICY "Participants can mark messages read"
  ON public.messages FOR UPDATE TO authenticated
  USING (
    sender_id <> auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id
        AND (c.seeker_id = auth.uid() OR c.owner_id = auth.uid()::text)
    )
  )
  WITH CHECK (
    sender_id <> auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id
        AND (c.seeker_id = auth.uid() OR c.owner_id = auth.uid()::text)
    )
  );

CREATE OR REPLACE FUNCTION public.messages_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF private.is_trusted_request() THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    -- Clients can't backdate messages or pre-mark them read.
    NEW.created_at := now();
    NEW.read_at := NULL;
    RETURN NEW;
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.conversation_id IS DISTINCT FROM OLD.conversation_id
     OR NEW.sender_id IS DISTINCT FROM OLD.sender_id
     OR NEW.body IS DISTINCT FROM OLD.body
     OR NEW.kind IS DISTINCT FROM OLD.kind
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Messages can''t be edited' USING ERRCODE = '42501';
  END IF;
  IF NEW.read_at IS DISTINCT FROM OLD.read_at AND OLD.sender_id = auth.uid() THEN
    RAISE EXCEPTION 'Only the recipient can mark a message read' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.messages_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS messages_guard_trg ON public.messages;
CREATE TRIGGER messages_guard_trg
  BEFORE INSERT OR UPDATE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.messages_guard();

-- -----------------------------------------------------------------------------
-- 3. listing_photos: the caller must own the parent listing.
--    (ListingForm.tsx inserts {listing_id, owner_id: user.id, ...} from the
--    browser for the user's own listing, which still passes.)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Owners insert own photos" ON public.listing_photos;
CREATE POLICY "Owners insert own photos" ON public.listing_photos
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = owner_id
    AND EXISTS (
      SELECT 1 FROM public.listings l
      WHERE l.id = listing_photos.listing_id AND l.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Owners update own photos" ON public.listing_photos;
CREATE POLICY "Owners update own photos" ON public.listing_photos
  FOR UPDATE TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (
    auth.uid() = owner_id
    AND EXISTS (
      SELECT 1 FROM public.listings l
      WHERE l.id = listing_photos.listing_id AND l.owner_id = auth.uid()
    )
  );

-- -----------------------------------------------------------------------------
-- 4. listings: only admins / service role can change is_featured.
--    New listings from regular users are always created un-featured.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.listings_guard_featured()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF private.is_trusted_request() OR private.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.is_featured := false;
  ELSIF NEW.is_featured IS DISTINCT FROM OLD.is_featured THEN
    RAISE EXCEPTION 'Only Nestly staff can feature a listing' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.listings_guard_featured() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS listings_guard_featured_trg ON public.listings;
CREATE TRIGGER listings_guard_featured_trg
  BEFORE INSERT OR UPDATE ON public.listings
  FOR EACH ROW EXECUTE FUNCTION public.listings_guard_featured();

-- -----------------------------------------------------------------------------
-- 5. conversations
--    INSERT: owner_id / owner_name / owner_phone / listing_title / photo are
--    derived from public.listings when listing_id is the uuid of a real
--    listing. Client-supplied owner fields are never trusted.
--    UPDATE: users can't move a conversation to another listing/person, and
--    only the owner can toggle phone_revealed.
--    (SELECT policy "Participants can view their conversations" already lets
--    the owner read rows where owner_id = auth.uid()::text.)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.conversations_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trusted boolean := private.is_trusted_request();
  v_owner uuid;
  v_title text;
  v_cover text;
  v_contact_name text;
  v_contact_phone text;
  v_display text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.listing_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      SELECT l.owner_id, l.title, l.cover_photo_url, l.contact_name, l.contact_phone
        INTO v_owner, v_title, v_cover, v_contact_name, v_contact_phone
        FROM public.listings l
       WHERE l.id = NEW.listing_id::uuid;
    END IF;

    IF v_owner IS NOT NULL THEN
      SELECT p.display_name INTO v_display FROM public.profiles p WHERE p.id = v_owner;
      NEW.owner_id      := v_owner::text;
      NEW.owner_name    := coalesce(nullif(btrim(v_contact_name), ''), v_display);
      NEW.owner_phone   := v_contact_phone;
      NEW.listing_title := coalesce(v_title, NEW.listing_title);
      NEW.listing_photo := coalesce(v_cover, NEW.listing_photo);
    ELSIF NOT v_trusted THEN
      -- Not a real listing: never let a client route a thread to someone.
      NEW.owner_id    := NULL;
      NEW.owner_phone := NULL;
    END IF;

    IF NEW.owner_id IS NOT NULL AND NEW.owner_id = NEW.seeker_id::text THEN
      RAISE EXCEPTION 'You can''t start a conversation about your own listing';
    END IF;

    IF NOT v_trusted THEN
      NEW.phone_revealed := false;
      NEW.unread_seeker  := 0;
      NEW.unread_owner   := 0;
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  IF v_trusted THEN
    RETURN NEW;
  END IF;
  IF NEW.listing_id IS DISTINCT FROM OLD.listing_id
     OR NEW.seeker_id IS DISTINCT FROM OLD.seeker_id
     OR NEW.owner_id IS DISTINCT FROM OLD.owner_id
     OR NEW.owner_phone IS DISTINCT FROM OLD.owner_phone THEN
    RAISE EXCEPTION 'These conversation fields can''t be changed' USING ERRCODE = '42501';
  END IF;
  IF NEW.phone_revealed IS DISTINCT FROM OLD.phone_revealed
     AND (auth.uid() IS NULL OR auth.uid()::text IS DISTINCT FROM OLD.owner_id) THEN
    RAISE EXCEPTION 'Only the owner can share their phone number' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.conversations_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS conversations_guard_trg ON public.conversations;
CREATE TRIGGER conversations_guard_trg
  BEFORE INSERT OR UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.conversations_guard();

-- -----------------------------------------------------------------------------
-- 6. tour_bookings
--    INSERT: owner_id (and listing_id/title when a slot is used) come from
--    the slot / listing, never the client. Users may only create bookings
--    with status 'requested'.
--    UPDATE: slot/listing/owner/seeker are immutable for users. The seeker
--    may only cancel; confirm/decline/complete are owner-only.
--    Status values (text column, validated by tour_bookings_validate):
--    requested | confirmed | declined | cancelled | completed.
--    Trigger name sorts before tour_bookings_validate_trg, so it runs first.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tour_bookings_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trusted boolean := private.is_trusted_request();
  v_uid uuid := auth.uid();
  v_slot_owner uuid;
  v_slot_listing uuid;
  v_listing_owner uuid;
  v_title text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.slot_id IS NOT NULL THEN
      SELECT s.owner_id, s.listing_id INTO v_slot_owner, v_slot_listing
        FROM public.tour_slots s WHERE s.id = NEW.slot_id;
      IF v_slot_listing IS NULL THEN
        RAISE EXCEPTION 'That slot is no longer available';
      END IF;
      NEW.listing_id := v_slot_listing::text;
    END IF;

    IF NEW.listing_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      SELECT l.owner_id, l.title INTO v_listing_owner, v_title
        FROM public.listings l WHERE l.id = NEW.listing_id::uuid;
    END IF;

    IF v_listing_owner IS NOT NULL THEN
      NEW.owner_id := v_listing_owner;
      NEW.listing_title := coalesce(v_title, NEW.listing_title);
    ELSIF v_slot_owner IS NOT NULL THEN
      NEW.owner_id := v_slot_owner;
    ELSIF NOT v_trusted THEN
      NEW.owner_id := NULL;
    END IF;

    IF NEW.owner_id IS NOT NULL AND NEW.owner_id = NEW.seeker_id THEN
      RAISE EXCEPTION 'You can''t book a tour of your own listing';
    END IF;
    IF NOT v_trusted AND NEW.status IS DISTINCT FROM 'requested' THEN
      RAISE EXCEPTION 'New tour requests must start as requested' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  IF v_trusted THEN
    RETURN NEW;
  END IF;
  IF NEW.slot_id IS DISTINCT FROM OLD.slot_id
     OR NEW.listing_id IS DISTINCT FROM OLD.listing_id
     OR NEW.owner_id IS DISTINCT FROM OLD.owner_id
     OR NEW.seeker_id IS DISTINCT FROM OLD.seeker_id THEN
    RAISE EXCEPTION 'These booking fields can''t be changed' USING ERRCODE = '42501';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF v_uid IS NOT NULL AND v_uid = OLD.owner_id THEN
      NULL; -- owner may set any valid status (validated by tour_bookings_validate)
    ELSIF v_uid IS NOT NULL AND v_uid = OLD.seeker_id THEN
      IF NEW.status <> 'cancelled' THEN
        RAISE EXCEPTION 'Only the owner can confirm, decline or complete a tour'
          USING ERRCODE = '42501';
      END IF;
    ELSE
      RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.tour_bookings_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS tour_bookings_guard_trg ON public.tour_bookings;
CREATE TRIGGER tour_bookings_guard_trg
  BEFORE INSERT OR UPDATE ON public.tour_bookings
  FOR EACH ROW EXECUTE FUNCTION public.tour_bookings_guard();

-- Capacity race fix: lock the slot row (SELECT ... FOR UPDATE) before
-- counting, so two concurrent requests for the last seat serialize. The
-- function is now SECURITY DEFINER because a seeker's FOR UPDATE would
-- otherwise be filtered by the owner-only UPDATE policy on tour_slots.
-- Logic is otherwise preserved from 20260726133434, plus a capacity check
-- when a cancelled/declined booking is re-activated.
CREATE OR REPLACE FUNCTION public.tour_bookings_validate()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_taken INTEGER;
  v_cap INTEGER;
  v_start TIMESTAMPTZ;
  v_check_capacity BOOLEAN := false;
BEGIN
  IF NEW.status NOT IN ('requested','confirmed','declined','cancelled','completed') THEN
    RAISE EXCEPTION 'Invalid booking status';
  END IF;
  IF NEW.slot_id IS NULL THEN
    IF TG_OP = 'INSERT' AND NEW.proposed_at IS NULL THEN
      RAISE EXCEPTION 'Pick a slot or propose a date';
    END IF;
    RETURN NEW;
  END IF;

  SELECT capacity, starts_at INTO v_cap, v_start
    FROM public.tour_slots WHERE id = NEW.slot_id
    FOR UPDATE;
  IF v_cap IS NULL THEN RAISE EXCEPTION 'Slot not found'; END IF;

  IF TG_OP = 'INSERT' THEN
    IF v_start < now() THEN RAISE EXCEPTION 'That tour slot is in the past'; END IF;
    v_check_capacity := NEW.status IN ('requested','confirmed');
  ELSE
    IF NEW.status IN ('requested','confirmed') AND OLD.status NOT IN ('requested','confirmed') THEN
      v_check_capacity := true;
    END IF;
  END IF;

  IF v_check_capacity THEN
    SELECT count(*) INTO v_taken FROM public.tour_bookings
      WHERE slot_id = NEW.slot_id
        AND status IN ('requested','confirmed')
        AND id <> NEW.id;
    IF v_taken >= v_cap THEN RAISE EXCEPTION 'That tour slot is fully booked'; END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.tour_bookings_validate() FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 7. tour_slots: UPDATE must keep the slot on a listing the caller owns.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "tour_slots_owner_update" ON public.tour_slots;
CREATE POLICY "tour_slots_owner_update" ON public.tour_slots
  FOR UPDATE TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (
    owner_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.listings l
      WHERE l.id = tour_slots.listing_id AND l.owner_id = auth.uid()
    )
  );

-- -----------------------------------------------------------------------------
-- 8. listing_views: you can only log a view as yourself (or anonymously).
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Anyone can record a view" ON public.listing_views;
CREATE POLICY "Anyone can record a view"
  ON public.listing_views FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    listing_id IS NOT NULL
    AND char_length(listing_id) BETWEEN 1 AND 64
    AND (viewer_id IS NULL OR viewer_id = auth.uid())
  );

-- -----------------------------------------------------------------------------
-- 9. Missing indexes
--    conversations(listing_id) is already covered by the unique constraint
--    conversations_listing_seeker_unique (listing_id, seeker_id), and
--    conversations(owner_id) by conversations_owner_idx
--    (owner_id, last_message_at DESC), so they are not duplicated here.
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS tour_bookings_slot_status_idx
  ON public.tour_bookings (slot_id, status);
CREATE INDEX IF NOT EXISTS tour_bookings_listing_idx
  ON public.tour_bookings (listing_id);
CREATE INDEX IF NOT EXISTS messages_sender_idx
  ON public.messages (sender_id);
CREATE INDEX IF NOT EXISTS owner_verifications_status_created_idx
  ON public.owner_verifications (status, created_at DESC);
CREATE INDEX IF NOT EXISTS listings_status_mode_price_idx
  ON public.listings (status, mode, price_amount);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'admin_user_notes'
               AND column_name = 'author_id') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS admin_user_notes_author_idx ON public.admin_user_notes (author_id)';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'feature_flags'
               AND column_name = 'updated_by') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS feature_flags_updated_by_idx ON public.feature_flags (updated_by)';
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 10. Storage
-- -----------------------------------------------------------------------------
-- listing-photos: 8 MB max, images only (HEIC/HEIF for iPhone uploads).
UPDATE storage.buckets
   SET file_size_limit = 8388608,
       allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','image/heic','image/heif']
 WHERE id = 'listing-photos';

-- verification-docs: PRIVATE bucket for owner ID documents.
-- Path layout: {user_id}/{filename}. Admins read via signed URLs.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'verification-docs', 'verification-docs', false, 10485760,
  ARRAY['image/jpeg','image/png','image/webp','application/pdf']
)
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "verification_docs_owner_insert" ON storage.objects;
CREATE POLICY "verification_docs_owner_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'verification-docs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "verification_docs_owner_select" ON storage.objects;
CREATE POLICY "verification_docs_owner_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'verification-docs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "verification_docs_owner_delete" ON storage.objects;
CREATE POLICY "verification_docs_owner_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'verification-docs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "verification_docs_admin_select" ON storage.objects;
CREATE POLICY "verification_docs_admin_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'verification-docs'
    AND private.has_role(auth.uid(), 'admin'::public.app_role)
  );

-- -----------------------------------------------------------------------------
-- 11. content_reports: users report listings / reviews / users / messages;
--     admins triage them. (UI: workstream C.)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.content_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  target_type text NOT NULL CHECK (target_type IN ('listing','review','user','message')),
  target_id text NOT NULL CHECK (char_length(target_id) BETWEEN 1 AND 200),
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 3 AND 1000),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewing','resolved','dismissed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS content_reports_status_created_idx
  ON public.content_reports (status, created_at DESC);
CREATE INDEX IF NOT EXISTS content_reports_reporter_idx
  ON public.content_reports (reporter_id);
CREATE INDEX IF NOT EXISTS content_reports_target_idx
  ON public.content_reports (target_type, target_id);
CREATE INDEX IF NOT EXISTS content_reports_resolved_by_idx
  ON public.content_reports (resolved_by);

-- UPDATE is granted so admins can triage through RLS; regular users have no
-- UPDATE policy, so they can't change anything.
GRANT SELECT, INSERT, UPDATE ON public.content_reports TO authenticated;
GRANT ALL ON public.content_reports TO service_role;

ALTER TABLE public.content_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "content_reports_insert_own" ON public.content_reports;
CREATE POLICY "content_reports_insert_own" ON public.content_reports
  FOR INSERT TO authenticated
  WITH CHECK (
    reporter_id = auth.uid()
    AND status = 'open'
    AND resolved_at IS NULL
    AND resolved_by IS NULL
  );

DROP POLICY IF EXISTS "content_reports_select_own" ON public.content_reports;
CREATE POLICY "content_reports_select_own" ON public.content_reports
  FOR SELECT TO authenticated
  USING (reporter_id = auth.uid());

DROP POLICY IF EXISTS "content_reports_admin_select" ON public.content_reports;
CREATE POLICY "content_reports_admin_select" ON public.content_reports
  FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "content_reports_admin_update" ON public.content_reports;
CREATE POLICY "content_reports_admin_update" ON public.content_reports
  FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));

-- -----------------------------------------------------------------------------
-- 12. Realtime publication
--    profiles and listings are intentionally KEPT in supabase_realtime:
--    admin.index.tsx subscribes to ["listings","listing_reviews","profiles"]
--    and admin.listings.tsx / admin.analytics.tsx to ["listings"] via
--    useRealtimeRefresh. Realtime postgres_changes still respects RLS.
-- -----------------------------------------------------------------------------
