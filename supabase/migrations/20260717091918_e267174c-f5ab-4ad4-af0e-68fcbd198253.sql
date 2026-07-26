ALTER TABLE public.listing_reviews DROP CONSTRAINT listing_reviews_listing_id_fkey;
ALTER TABLE public.listing_reviews ALTER COLUMN listing_id TYPE TEXT USING listing_id::text;