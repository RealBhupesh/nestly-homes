
-- 1) Restrict profiles read to authenticated users, and drop unused phone column.
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
CREATE POLICY "Profiles are viewable by authenticated users"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

ALTER TABLE public.profiles DROP COLUMN IF EXISTS phone;

-- 2) Storage: only serve listing-photos objects that belong to a published listing,
-- or to the requesting owner. Path layout is `{owner_id}/{listing_id}/...`.
DROP POLICY IF EXISTS "Public read listing photos" ON storage.objects;

CREATE POLICY "Read listing photos for published or owner"
  ON storage.objects FOR SELECT
  TO public
  USING (
    bucket_id = 'listing-photos'
    AND (
      -- Owner (authenticated) can always read their own files
      (auth.uid() IS NOT NULL AND (storage.foldername(name))[1] = (auth.uid())::text)
      OR
      -- Anyone can read files that belong to a published listing
      EXISTS (
        SELECT 1
        FROM public.listings l
        WHERE l.id::text = (storage.foldername(name))[2]
          AND l.status = 'published'
      )
    )
  );
