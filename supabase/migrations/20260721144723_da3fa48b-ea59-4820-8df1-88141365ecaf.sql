
-- Messaging + Inbox
CREATE TABLE public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  seeker_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_message_preview TEXT,
  unread_seeker INTEGER NOT NULL DEFAULT 0,
  unread_owner INTEGER NOT NULL DEFAULT 0,
  phone_revealed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (listing_id, seeker_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversations TO authenticated;
GRANT ALL ON public.conversations TO service_role;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants can view their conversations"
  ON public.conversations FOR SELECT TO authenticated
  USING (auth.uid() = seeker_id OR auth.uid() = owner_id);

CREATE POLICY "Seekers can create a conversation"
  ON public.conversations FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = seeker_id AND auth.uid() <> owner_id);

CREATE POLICY "Participants can update their conversations"
  ON public.conversations FOR UPDATE TO authenticated
  USING (auth.uid() = seeker_id OR auth.uid() = owner_id)
  WITH CHECK (auth.uid() = seeker_id OR auth.uid() = owner_id);

CREATE INDEX conversations_seeker_idx ON public.conversations(seeker_id, last_message_at DESC);
CREATE INDEX conversations_owner_idx ON public.conversations(owner_id, last_message_at DESC);

CREATE TRIGGER conversations_touch_updated_at
  BEFORE UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Messages
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
  kind TEXT NOT NULL DEFAULT 'text' CHECK (kind IN ('text','system','booking')),
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants can view messages"
  ON public.messages FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = messages.conversation_id
      AND (c.seeker_id = auth.uid() OR c.owner_id = auth.uid())
  ));

CREATE POLICY "Participants can send messages"
  ON public.messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid() AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id
        AND (c.seeker_id = auth.uid() OR c.owner_id = auth.uid())
    )
  );

CREATE POLICY "Participants can mark messages read"
  ON public.messages FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = messages.conversation_id
      AND (c.seeker_id = auth.uid() OR c.owner_id = auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = messages.conversation_id
      AND (c.seeker_id = auth.uid() OR c.owner_id = auth.uid())
  ));

CREATE INDEX messages_conversation_idx ON public.messages(conversation_id, created_at DESC);

-- Trigger: on new message, bump conversation last_message_at + preview + unread counter for the other party
CREATE OR REPLACE FUNCTION public.messages_bump_conversation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seeker UUID;
  v_owner UUID;
BEGIN
  SELECT seeker_id, owner_id INTO v_seeker, v_owner
    FROM public.conversations WHERE id = NEW.conversation_id;

  UPDATE public.conversations
    SET last_message_at = NEW.created_at,
        last_message_preview = LEFT(NEW.body, 200),
        unread_seeker = CASE WHEN NEW.sender_id = v_seeker THEN unread_seeker ELSE unread_seeker + 1 END,
        unread_owner  = CASE WHEN NEW.sender_id = v_owner  THEN unread_owner  ELSE unread_owner  + 1 END,
        updated_at = now()
    WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER messages_bump_conversation_trg
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.messages_bump_conversation();

-- Realtime
ALTER TABLE public.conversations REPLICA IDENTITY FULL;
ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
