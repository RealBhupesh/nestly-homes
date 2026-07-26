ALTER TABLE public.tour_bookings DROP CONSTRAINT tour_bookings_listing_id_fkey;
ALTER TABLE public.tour_bookings ALTER COLUMN listing_id TYPE TEXT USING listing_id::text;
ALTER TABLE public.tour_bookings ALTER COLUMN slot_id DROP NOT NULL;
ALTER TABLE public.tour_bookings ALTER COLUMN owner_id DROP NOT NULL;
ALTER TABLE public.tour_bookings ADD COLUMN IF NOT EXISTS proposed_at TIMESTAMPTZ;
ALTER TABLE public.tour_bookings ADD COLUMN IF NOT EXISTS listing_title TEXT;

CREATE OR REPLACE FUNCTION public.tour_bookings_validate()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE v_taken INTEGER; v_cap INTEGER; v_start TIMESTAMPTZ;
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
  SELECT capacity, starts_at INTO v_cap, v_start FROM public.tour_slots WHERE id = NEW.slot_id;
  IF v_cap IS NULL THEN RAISE EXCEPTION 'Slot not found'; END IF;
  IF TG_OP = 'INSERT' THEN
    IF v_start < now() THEN RAISE EXCEPTION 'That tour slot is in the past'; END IF;
    SELECT count(*) INTO v_taken FROM public.tour_bookings
      WHERE slot_id = NEW.slot_id AND status IN ('requested','confirmed');
    IF v_taken >= v_cap THEN RAISE EXCEPTION 'That tour slot is fully booked'; END IF;
  END IF;
  RETURN NEW;
END;
$$;