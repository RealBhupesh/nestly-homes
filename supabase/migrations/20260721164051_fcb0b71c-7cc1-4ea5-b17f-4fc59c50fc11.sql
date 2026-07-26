-- 1) Tighten profiles read policy
DROP POLICY IF EXISTS "Profiles are viewable by authenticated users" ON public.profiles;

CREATE POLICY "Profiles readable when relevant"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.listings l
    WHERE l.owner_id = profiles.id
      AND l.status = 'published'
  )
  OR EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE (c.seeker_id = auth.uid() AND c.owner_id = profiles.id::text)
       OR (c.owner_id = auth.uid()::text AND c.seeker_id = profiles.id)
  )
);

-- 2) Move has_role out of the exposed public schema so the Data API no
-- longer surfaces it as a callable endpoint. RLS policies keep working
-- because they reference the function by OID.
CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

ALTER FUNCTION public.has_role(uuid, public.app_role) SET SCHEMA private;

REVOKE ALL ON FUNCTION private.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated, service_role;

-- 3) Lock down the new-user trigger function. It only runs from the
-- auth.users trigger context, not from the Data API.
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role, supabase_auth_admin;

-- 4) Remove admin_audit_log from the realtime publication so admin
-- actions are never broadcast, even if a policy misconfig slips in later.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'admin_audit_log'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.admin_audit_log';
  END IF;
END $$;