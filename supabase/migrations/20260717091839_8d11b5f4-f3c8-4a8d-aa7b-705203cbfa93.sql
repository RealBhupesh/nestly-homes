CREATE TABLE public.listing_reviews (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  listing_id UUID NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title TEXT,
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 4 AND 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (listing_id, user_id)
);

CREATE INDEX listing_reviews_listing_idx ON public.listing_reviews(listing_id, created_at DESC);
CREATE INDEX listing_reviews_user_idx ON public.listing_reviews(user_id, created_at DESC);

GRANT SELECT ON public.listing_reviews TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.listing_reviews TO authenticated;
GRANT ALL ON public.listing_reviews TO service_role;

ALTER TABLE public.listing_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reviews are readable by anyone"
  ON public.listing_reviews FOR SELECT
  USING (true);

CREATE POLICY "Users can post their own review"
  ON public.listing_reviews FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can edit their own review"
  ON public.listing_reviews FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own review"
  ON public.listing_reviews FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER listing_reviews_touch_updated_at
  BEFORE UPDATE ON public.listing_reviews
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();