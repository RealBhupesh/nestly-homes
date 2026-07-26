ALTER TABLE public.listings
  ADD CONSTRAINT listings_nearby_max_5
  CHECK (
    nearby IS NULL
    OR jsonb_typeof(nearby) <> 'array'
    OR jsonb_array_length(nearby) <= 5
  );