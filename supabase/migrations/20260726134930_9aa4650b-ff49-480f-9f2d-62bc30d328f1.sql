CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE public.saved_searches
  ADD COLUMN IF NOT EXISTS alert_frequency TEXT NOT NULL DEFAULT 'off',
  ADD COLUMN IF NOT EXISTS last_notified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_match_count INTEGER NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.saved_searches_validate()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.alert_frequency NOT IN ('off','instant','daily') THEN
    RAISE EXCEPTION 'Invalid alert frequency';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS saved_searches_validate_trg ON public.saved_searches;
CREATE TRIGGER saved_searches_validate_trg
  BEFORE INSERT OR UPDATE ON public.saved_searches
  FOR EACH ROW EXECUTE FUNCTION public.saved_searches_validate();

CREATE INDEX IF NOT EXISTS listings_title_trgm_idx ON public.listings USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS listings_city_trgm_idx ON public.listings USING gin (city gin_trgm_ops);
CREATE INDEX IF NOT EXISTS listings_address_trgm_idx ON public.listings USING gin (address_line gin_trgm_ops);
CREATE INDEX IF NOT EXISTS listings_description_trgm_idx ON public.listings USING gin (description gin_trgm_ops);

CREATE OR REPLACE FUNCTION public.search_listings(_q TEXT, _limit INTEGER DEFAULT 50)
RETURNS TABLE (
  id UUID,
  title TEXT,
  city TEXT,
  address_line TEXT,
  price_amount NUMERIC,
  mode public.listing_mode,
  property_type public.property_type,
  furnishing public.furnishing,
  bedrooms INTEGER,
  cover_photo_url TEXT,
  relevance REAL
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT l.id, l.title, l.city, l.address_line, l.price_amount, l.mode,
         l.property_type, l.furnishing, l.bedrooms, l.cover_photo_url,
         GREATEST(
           similarity(l.title, _q),
           similarity(l.city, _q),
           similarity(l.address_line, _q),
           similarity(coalesce(l.description,''), _q)
         )::real AS relevance
  FROM public.listings l
  WHERE l.status = 'published'
    AND (
      coalesce(_q,'') = ''
      OR l.title ILIKE '%' || _q || '%'
      OR l.city ILIKE '%' || _q || '%'
      OR l.address_line ILIKE '%' || _q || '%'
      OR similarity(l.title, _q) > 0.2
      OR similarity(l.city, _q) > 0.25
      OR similarity(l.address_line, _q) > 0.2
    )
  ORDER BY relevance DESC, l.created_at DESC
  LIMIT LEAST(coalesce(_limit, 50), 100);
$$;

GRANT EXECUTE ON FUNCTION public.search_listings(TEXT, INTEGER) TO anon, authenticated, service_role;