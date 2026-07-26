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