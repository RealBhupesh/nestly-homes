
-- Drop policies first (they reference owner_id)
DROP POLICY "Participants can view their conversations" ON public.conversations;
DROP POLICY "Seekers can create a conversation" ON public.conversations;
DROP POLICY "Participants can update their conversations" ON public.conversations;
DROP POLICY "Participants can view messages" ON public.messages;
DROP POLICY "Participants can send messages" ON public.messages;
DROP POLICY "Participants can mark messages read" ON public.messages;

ALTER TABLE public.conversations DROP CONSTRAINT IF EXISTS conversations_listing_id_fkey;
ALTER TABLE public.conversations DROP CONSTRAINT IF EXISTS conversations_owner_id_fkey;
ALTER TABLE public.conversations DROP CONSTRAINT IF EXISTS conversations_listing_id_seeker_id_key;

ALTER TABLE public.conversations ALTER COLUMN listing_id TYPE TEXT USING listing_id::text;
ALTER TABLE public.conversations ALTER COLUMN owner_id DROP NOT NULL;
ALTER TABLE public.conversations ALTER COLUMN owner_id TYPE TEXT USING owner_id::text;

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS listing_title TEXT,
  ADD COLUMN IF NOT EXISTS listing_photo TEXT,
  ADD COLUMN IF NOT EXISTS owner_name TEXT,
  ADD COLUMN IF NOT EXISTS owner_phone TEXT;

ALTER TABLE public.conversations
  ADD CONSTRAINT conversations_listing_seeker_unique UNIQUE (listing_id, seeker_id);

CREATE POLICY "Participants can view their conversations"
  ON public.conversations FOR SELECT TO authenticated
  USING (auth.uid() = seeker_id OR auth.uid()::text = owner_id);

CREATE POLICY "Seekers can create a conversation"
  ON public.conversations FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = seeker_id);

CREATE POLICY "Participants can update their conversations"
  ON public.conversations FOR UPDATE TO authenticated
  USING (auth.uid() = seeker_id OR auth.uid()::text = owner_id)
  WITH CHECK (auth.uid() = seeker_id OR auth.uid()::text = owner_id);

CREATE POLICY "Participants can view messages"
  ON public.messages FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = messages.conversation_id
      AND (c.seeker_id = auth.uid() OR c.owner_id = auth.uid()::text)
  ));

CREATE POLICY "Participants can send messages"
  ON public.messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid() AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id
        AND (c.seeker_id = auth.uid() OR c.owner_id = auth.uid()::text)
    )
  );

CREATE POLICY "Participants can mark messages read"
  ON public.messages FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = messages.conversation_id
      AND (c.seeker_id = auth.uid() OR c.owner_id = auth.uid()::text)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = messages.conversation_id
      AND (c.seeker_id = auth.uid() OR c.owner_id = auth.uid()::text)
  ));

CREATE OR REPLACE FUNCTION public.messages_bump_conversation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_seeker UUID;
  v_owner TEXT;
BEGIN
  SELECT seeker_id, owner_id INTO v_seeker, v_owner
    FROM public.conversations WHERE id = NEW.conversation_id;
  UPDATE public.conversations
    SET last_message_at = NEW.created_at,
        last_message_preview = LEFT(NEW.body, 200),
        unread_seeker = CASE WHEN NEW.sender_id = v_seeker THEN unread_seeker ELSE unread_seeker + 1 END,
        unread_owner  = CASE WHEN v_owner IS NOT NULL AND NEW.sender_id::text = v_owner THEN unread_owner ELSE unread_owner + 1 END,
        updated_at = now()
    WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.messages_bump_conversation() FROM PUBLIC, anon, authenticated;
