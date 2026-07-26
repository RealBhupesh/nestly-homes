
-- listing_views
CREATE TABLE public.listing_views (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  listing_id TEXT NOT NULL,
  viewer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX listing_views_listing_idx ON public.listing_views (listing_id, created_at DESC);
CREATE INDEX listing_views_viewer_idx  ON public.listing_views (viewer_id);

GRANT SELECT, INSERT ON public.listing_views TO authenticated;
GRANT INSERT ON public.listing_views TO anon;
GRANT ALL ON public.listing_views TO service_role;

ALTER TABLE public.listing_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can record a view"
  ON public.listing_views FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Owners can view their listing views"
  ON public.listing_views FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.listings l
    WHERE l.id::text = listing_views.listing_id
      AND l.owner_id = auth.uid()
  ));

-- listing_likes
CREATE TABLE public.listing_likes (
  listing_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (listing_id, user_id)
);
CREATE INDEX listing_likes_listing_idx ON public.listing_likes (listing_id);
CREATE INDEX listing_likes_user_idx    ON public.listing_likes (user_id);

GRANT SELECT, INSERT, DELETE ON public.listing_likes TO authenticated;
GRANT ALL ON public.listing_likes TO service_role;

ALTER TABLE public.listing_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can like a listing"
  ON public.listing_likes FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can unlike their own like"
  ON public.listing_likes FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users see their own likes"
  ON public.listing_likes FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Owners see likes on their listings"
  ON public.listing_likes FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.listings l
    WHERE l.id::text = listing_likes.listing_id
      AND l.owner_id = auth.uid()
  ));
