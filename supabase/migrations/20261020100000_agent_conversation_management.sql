-- Seiya: Ask Seiya conversations can be renamed, shared with the partner and
-- deleted for real (before, these only changed the browser view and came back
-- after a refresh). Browser clients still have no direct write grants; each
-- function only touches a conversation the caller owns.

CREATE OR REPLACE FUNCTION public.rename_agent_conversation(
  p_conversation_id uuid,
  p_title text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_title text := pg_catalog.btrim(pg_catalog.regexp_replace(COALESCE(p_title, ''), '[[:space:]]+', ' ', 'g'));
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF pg_catalog.length(v_title) < 1 OR pg_catalog.length(v_title) > 120 THEN
    RAISE EXCEPTION 'Title must be between 1 and 120 characters' USING ERRCODE = '22023';
  END IF;

  UPDATE public.agent_conversations c
     SET title = v_title
   WHERE c.id = p_conversation_id
     AND c.user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conversation not found or not owned by caller' USING ERRCODE = 'P0002';
  END IF;

  RETURN pg_catalog.jsonb_build_object('id', p_conversation_id, 'title', v_title);
END;
$$;

CREATE OR REPLACE FUNCTION public.set_agent_conversation_visibility(
  p_conversation_id uuid,
  p_visibility text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_household_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF p_visibility IS NULL OR p_visibility NOT IN ('private', 'shared') THEN
    RAISE EXCEPTION 'Visibility must be private or shared' USING ERRCODE = '22023';
  END IF;

  SELECT c.household_id INTO v_household_id
    FROM public.agent_conversations c
   WHERE c.id = p_conversation_id
     AND c.user_id = v_user_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conversation not found or not owned by caller' USING ERRCODE = 'P0002';
  END IF;

  IF p_visibility = 'shared' AND (v_household_id IS NULL OR NOT public.is_household_member(v_household_id)) THEN
    RAISE EXCEPTION 'Active household membership required to share' USING ERRCODE = '42501';
  END IF;

  UPDATE public.agent_conversations c
     SET visibility = p_visibility
   WHERE c.id = p_conversation_id;

  RETURN pg_catalog.jsonb_build_object('id', p_conversation_id, 'visibility', p_visibility);
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_agent_conversation(p_conversation_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  -- agent_messages rows go with it (ON DELETE CASCADE).
  DELETE FROM public.agent_conversations c
   WHERE c.id = p_conversation_id
     AND c.user_id = v_user_id;

  RETURN pg_catalog.jsonb_build_object('id', p_conversation_id, 'deleted', FOUND);
END;
$$;

-- The owner keeps chatting in a conversation after sharing it (before, only
-- private conversations could be continued). Partners can read shared ones.
CREATE OR REPLACE FUNCTION public.append_agent_conversation_turn(
  p_household_id uuid,
  p_conversation_id uuid,
  p_user_content text,
  p_assistant_content text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_conversation_id uuid := p_conversation_id;
  v_existing_conversation_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF p_household_id IS NULL OR NOT public.is_household_member(p_household_id) THEN
    RAISE EXCEPTION 'Active household membership required' USING ERRCODE = '42501';
  END IF;

  IF p_user_content IS NULL
     OR pg_catalog.length(pg_catalog.btrim(p_user_content)) < 1
     OR pg_catalog.length(pg_catalog.btrim(p_user_content)) > 2000 THEN
    RAISE EXCEPTION 'Invalid user message length' USING ERRCODE = '22023';
  END IF;

  IF p_assistant_content IS NULL
     OR pg_catalog.length(pg_catalog.btrim(p_assistant_content)) < 1
     OR pg_catalog.length(pg_catalog.btrim(p_assistant_content)) > 6000 THEN
    RAISE EXCEPTION 'Invalid assistant message length' USING ERRCODE = '22023';
  END IF;

  IF v_conversation_id IS NULL THEN
    INSERT INTO public.agent_conversations (user_id, household_id, title, visibility)
    VALUES (
      v_user_id,
      p_household_id,
      pg_catalog.left(pg_catalog.regexp_replace(pg_catalog.btrim(p_user_content), '[[:space:]]+', ' ', 'g'), 72),
      'private'
    )
    RETURNING id INTO v_conversation_id;
  ELSE
    SELECT c.id
      INTO v_existing_conversation_id
      FROM public.agent_conversations AS c
     WHERE c.id = v_conversation_id
       AND c.user_id = v_user_id
       AND c.household_id = p_household_id
     FOR UPDATE;

    IF v_existing_conversation_id IS NULL THEN
      RAISE EXCEPTION 'Conversation not found or not owned by caller' USING ERRCODE = '42501';
    END IF;
  END IF;

  INSERT INTO public.agent_messages (conversation_id, sender_user_id, role, content, metadata)
  VALUES (v_conversation_id, v_user_id, 'user', pg_catalog.btrim(p_user_content), '{}'::jsonb);

  INSERT INTO public.agent_messages (conversation_id, sender_user_id, role, content, metadata)
  VALUES (v_conversation_id, NULL, 'assistant', pg_catalog.btrim(p_assistant_content), '{}'::jsonb);

  UPDATE public.agent_conversations
     SET updated_at = pg_catalog.now()
   WHERE id = v_conversation_id;

  RETURN v_conversation_id;
END;
$$;

REVOKE ALL ON FUNCTION public.rename_agent_conversation(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rename_agent_conversation(uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.set_agent_conversation_visibility(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_agent_conversation_visibility(uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.delete_agent_conversation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_agent_conversation(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.append_agent_conversation_turn(uuid, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.append_agent_conversation_turn(uuid, uuid, text, text) TO authenticated;
