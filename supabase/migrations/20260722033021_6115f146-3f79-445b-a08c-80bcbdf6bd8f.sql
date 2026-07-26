ALTER TABLE public.listings
  ADD COLUMN seeking_count integer NULL;

ALTER TABLE public.listings
  ADD CONSTRAINT listings_seeking_count_range
  CHECK (seeking_count IS NULL OR (seeking_count BETWEEN 1 AND 20));