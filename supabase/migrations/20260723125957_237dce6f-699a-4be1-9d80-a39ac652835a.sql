
DROP POLICY IF EXISTS "Anyone can record a view" ON public.listing_views;
CREATE POLICY "Anyone can record a view"
  ON public.listing_views FOR INSERT
  TO anon, authenticated
  WITH CHECK (listing_id IS NOT NULL AND char_length(listing_id) BETWEEN 1 AND 64);
