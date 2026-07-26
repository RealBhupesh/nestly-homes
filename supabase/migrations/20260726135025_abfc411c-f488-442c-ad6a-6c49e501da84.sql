CREATE SCHEMA IF NOT EXISTS extensions;
GRANT USAGE ON SCHEMA extensions TO anon, authenticated, service_role;
ALTER EXTENSION pg_trgm SET SCHEMA extensions;

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
SECURITY INVOKER
SET search_path = public, extensions
AS $$
  SELECT l.id, l.title, l.city, l.address_line, l.price_amount, l.mode,
         l.property_type, l.furnishing, l.bedrooms, l.cover_photo_url,
         GREATEST(
           extensions.similarity(l.title, _q),
           extensions.similarity(l.city, _q),
           extensions.similarity(l.address_line, _q),
           extensions.similarity(coalesce(l.description,''), _q)
         )::real AS relevance
  FROM public.listings l
  WHERE l.status = 'published'
    AND (
      coalesce(_q,'') = ''
      OR l.title ILIKE '%' || _q || '%'
      OR l.city ILIKE '%' || _q || '%'
      OR l.address_line ILIKE '%' || _q || '%'
      OR extensions.similarity(l.title, _q) > 0.2
      OR extensions.similarity(l.city, _q) > 0.25
      OR extensions.similarity(l.address_line, _q) > 0.2
    )
  ORDER BY relevance DESC, l.created_at DESC
  LIMIT LEAST(coalesce(_limit, 50), 100);
$$;