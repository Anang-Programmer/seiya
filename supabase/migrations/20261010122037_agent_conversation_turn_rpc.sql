-- Seiya Agent Orchestrator: safe persistence for one private user/assistant turn.
-- No direct INSERT grants are given to browser clients. The RPC itself is authenticated and can only append to conversations owned by the caller. The authenticated caller can
-- only append to their own private conversation inside a household they actively belong to.

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
       AND c.visibility = 'private'
     FOR UPDATE;

    IF v_existing_conversation_id IS NULL THEN
      RAISE EXCEPTION 'Private conversation not found or not owned by caller' USING ERRCODE = '42501';
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

REVOKE ALL ON FUNCTION public.append_agent_conversation_turn(uuid, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.append_agent_conversation_turn(uuid, uuid, text, text) TO authenticated;
