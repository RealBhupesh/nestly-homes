ALTER PUBLICATION supabase_realtime ADD TABLE public.listings;
ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_audit_log;
ALTER PUBLICATION supabase_realtime ADD TABLE public.listing_reviews;
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
ALTER TABLE public.listings REPLICA IDENTITY FULL;
ALTER TABLE public.admin_audit_log REPLICA IDENTITY FULL;
ALTER TABLE public.listing_reviews REPLICA IDENTITY FULL;
ALTER TABLE public.profiles REPLICA IDENTITY FULL;