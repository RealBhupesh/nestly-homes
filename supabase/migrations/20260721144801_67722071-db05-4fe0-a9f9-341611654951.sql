
CREATE OR REPLACE FUNCTION public.messages_bump_conversation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
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
REVOKE ALL ON FUNCTION public.messages_bump_conversation() FROM PUBLIC, anon, authenticated;
