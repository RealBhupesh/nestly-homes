-- ============ TOUR SLOTS ============
CREATE TABLE public.tour_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  capacity INTEGER NOT NULL DEFAULT 1,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX tour_slots_listing_idx ON public.tour_slots(listing_id, starts_at);
CREATE INDEX tour_slots_owner_idx ON public.tour_slots(owner_id);

GRANT SELECT ON public.tour_slots TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tour_slots TO authenticated;
GRANT ALL ON public.tour_slots TO service_role;

ALTER TABLE public.tour_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tour_slots_public_read" ON public.tour_slots
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.listings l WHERE l.id = listing_id AND l.status = 'published')
  );
CREATE POLICY "tour_slots_owner_read" ON public.tour_slots
  FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "tour_slots_owner_insert" ON public.tour_slots
  FOR INSERT TO authenticated WITH CHECK (
    owner_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.listings l WHERE l.id = listing_id AND l.owner_id = auth.uid())
  );
CREATE POLICY "tour_slots_owner_update" ON public.tour_slots
  FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "tour_slots_owner_delete" ON public.tour_slots
  FOR DELETE TO authenticated USING (owner_id = auth.uid());

CREATE TRIGGER tour_slots_set_updated_at BEFORE UPDATE ON public.tour_slots
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ TOUR BOOKINGS ============
CREATE TABLE public.tour_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id UUID NOT NULL REFERENCES public.tour_slots(id) ON DELETE CASCADE,
  listing_id UUID NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL,
  seeker_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested',
  party_size INTEGER NOT NULL DEFAULT 1,
  note TEXT,
  seeker_name TEXT,
  seeker_phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (slot_id, seeker_id)
);
CREATE INDEX tour_bookings_owner_idx ON public.tour_bookings(owner_id, created_at DESC);
CREATE INDEX tour_bookings_seeker_idx ON public.tour_bookings(seeker_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tour_bookings TO authenticated;
GRANT ALL ON public.tour_bookings TO service_role;

ALTER TABLE public.tour_bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tour_bookings_participants_read" ON public.tour_bookings
  FOR SELECT TO authenticated USING (seeker_id = auth.uid() OR owner_id = auth.uid());
CREATE POLICY "tour_bookings_seeker_insert" ON public.tour_bookings
  FOR INSERT TO authenticated WITH CHECK (seeker_id = auth.uid());
CREATE POLICY "tour_bookings_participants_update" ON public.tour_bookings
  FOR UPDATE TO authenticated USING (seeker_id = auth.uid() OR owner_id = auth.uid())
  WITH CHECK (seeker_id = auth.uid() OR owner_id = auth.uid());
CREATE POLICY "tour_bookings_seeker_delete" ON public.tour_bookings
  FOR DELETE TO authenticated USING (seeker_id = auth.uid());

CREATE TRIGGER tour_bookings_set_updated_at BEFORE UPDATE ON public.tour_bookings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.tour_bookings_validate()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE v_taken INTEGER; v_cap INTEGER; v_start TIMESTAMPTZ;
BEGIN
  SELECT capacity, starts_at INTO v_cap, v_start FROM public.tour_slots WHERE id = NEW.slot_id;
  IF v_cap IS NULL THEN RAISE EXCEPTION 'Slot not found'; END IF;
  IF TG_OP = 'INSERT' THEN
    IF v_start < now() THEN RAISE EXCEPTION 'That tour slot is in the past'; END IF;
    SELECT count(*) INTO v_taken FROM public.tour_bookings
      WHERE slot_id = NEW.slot_id AND status IN ('requested','confirmed');
    IF v_taken >= v_cap THEN RAISE EXCEPTION 'That tour slot is fully booked'; END IF;
  END IF;
  IF NEW.status NOT IN ('requested','confirmed','declined','cancelled','completed') THEN
    RAISE EXCEPTION 'Invalid booking status';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER tour_bookings_validate_trg BEFORE INSERT OR UPDATE ON public.tour_bookings
  FOR EACH ROW EXECUTE FUNCTION public.tour_bookings_validate();

-- ============ OWNER VERIFICATION ============
CREATE TABLE public.owner_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  document_path TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  review_note TEXT,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.owner_verifications TO authenticated;
GRANT ALL ON public.owner_verifications TO service_role;

ALTER TABLE public.owner_verifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_verifications_self_read" ON public.owner_verifications
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "owner_verifications_self_insert" ON public.owner_verifications
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND status = 'pending');
CREATE POLICY "owner_verifications_admin_update" ON public.owner_verifications
  FOR UPDATE TO authenticated USING (private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER owner_verifications_set_updated_at BEFORE UPDATE ON public.owner_verifications
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_verified_owner BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

-- ============ REALTIME ============
ALTER PUBLICATION supabase_realtime ADD TABLE public.tour_bookings;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tour_slots;