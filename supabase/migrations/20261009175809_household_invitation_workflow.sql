
-- Create a secure household invitation.
CREATE OR REPLACE FUNCTION public.create_household_invitation(
  p_household_id uuid,
  p_invited_email text,
  p_invited_name text,
  p_token_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_owner_email text;
  v_invited_email text;
  v_invited_name text;
  v_household_status text;
  v_member_count integer;
  v_invitation_id uuid;
  v_result jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '42501';
  END IF;

  v_invited_email :=
    pg_catalog.lower(pg_catalog.btrim(p_invited_email));

  v_invited_name :=
    NULLIF(pg_catalog.btrim(p_invited_name), '');

  IF v_invited_email IS NULL
     OR pg_catalog.length(v_invited_email) > 254
     OR v_invited_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'Invalid invitation email'
      USING ERRCODE = '22023';
  END IF;

  IF v_invited_name IS NOT NULL
     AND pg_catalog.length(v_invited_name) > 100 THEN
    RAISE EXCEPTION 'Invitation name is too long'
      USING ERRCODE = '22023';
  END IF;

  IF p_token_hash IS NULL
     OR p_token_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid invitation token hash'
      USING ERRCODE = '22023';
  END IF;

  SELECT pg_catalog.lower(u.email)
  INTO v_owner_email
  FROM auth.users u
  WHERE u.id = v_user_id;

  IF v_owner_email IS NULL THEN
    RAISE EXCEPTION 'Authenticated user email not found'
      USING ERRCODE = '42501';
  END IF;

  IF v_invited_email = v_owner_email THEN
    RAISE EXCEPTION 'Cannot invite yourself'
      USING ERRCODE = '22023';
  END IF;

  -- Lock household to serialize invitation creation and acceptance.
  SELECT h.status
  INTO v_household_status
  FROM public.households h
  WHERE h.id = p_household_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Household not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_household_status = 'archived' THEN
    RAISE EXCEPTION 'Household is archived'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.household_members hm
    WHERE hm.household_id = p_household_id
      AND hm.user_id = v_user_id
      AND hm.role = 'owner'
      AND hm.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Only an active household owner can invite'
      USING ERRCODE = '42501';
  END IF;

  SELECT pg_catalog.count(*)::integer
  INTO v_member_count
  FROM public.household_members hm
  WHERE hm.household_id = p_household_id
    AND hm.status = 'active';

  IF v_member_count >= 2 THEN
    RAISE EXCEPTION 'Household already has two active members'
      USING ERRCODE = '23505';
  END IF;

  -- A household may have only one active invitation at a time.
  UPDATE public.household_invitations
  SET status = 'revoked'
  WHERE household_id = p_household_id
    AND status = 'pending';

  INSERT INTO public.household_invitations (
    household_id,
    invited_by,
    invited_email,
    invited_name,
    token_hash,
    status
  )
  VALUES (
    p_household_id,
    v_user_id,
    v_invited_email,
    v_invited_name,
    p_token_hash,
    'pending'
  )
  RETURNING id INTO v_invitation_id;

  SELECT pg_catalog.jsonb_build_object(
    'id', i.id,
    'household_id', i.household_id,
    'invited_email', i.invited_email,
    'invited_name', i.invited_name,
    'status', i.status,
    'expires_at', i.expires_at,
    'created_at', i.created_at
  )
  INTO v_result
  FROM public.household_invitations i
  WHERE i.id = v_invitation_id;

  RETURN v_result;
END;
$$;


-- Accept an invitation using its SHA-256 token hash.
CREATE OR REPLACE FUNCTION public.accept_household_invitation(
  p_token_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_user_email text;
  v_household_id uuid;
  v_household_status text;
  v_invitation public.household_invitations%ROWTYPE;
  v_member_count integer;
  v_result jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '42501';
  END IF;

  IF p_token_hash IS NULL
     OR p_token_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid invitation token'
      USING ERRCODE = '22023';
  END IF;

  -- Discover household first, then lock it before locking the invitation.
  SELECT i.household_id
  INTO v_household_id
  FROM public.household_invitations i
  WHERE i.token_hash = p_token_hash;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation not found'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT h.status
  INTO v_household_status
  FROM public.households h
  WHERE h.id = v_household_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Household not found'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT i.*
  INTO v_invitation
  FROM public.household_invitations i
  WHERE i.token_hash = p_token_hash
  FOR UPDATE;

  IF NOT FOUND OR v_invitation.status <> 'pending' THEN
    RAISE EXCEPTION 'Invitation is no longer valid'
      USING ERRCODE = '22023';
  END IF;

  IF v_invitation.expires_at <= pg_catalog.now() THEN
    RAISE EXCEPTION 'Invitation has expired'
      USING ERRCODE = '22023';
  END IF;

  IF v_household_status = 'archived' THEN
    RAISE EXCEPTION 'Household is archived'
      USING ERRCODE = '22023';
  END IF;

  SELECT pg_catalog.lower(u.email)
  INTO v_user_email
  FROM auth.users u
  WHERE u.id = v_user_id;

  IF v_user_email IS NULL
     OR v_user_email <> v_invitation.invited_email THEN
    RAISE EXCEPTION 'Signed-in email does not match invitation'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.household_members hm
    WHERE hm.household_id = v_household_id
      AND hm.user_id = v_invitation.invited_by
      AND hm.role = 'owner'
      AND hm.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Invitation owner is no longer active'
      USING ERRCODE = '42501';
  END IF;

  -- Each user can belong to only one active household.
  IF EXISTS (
    SELECT 1
    FROM public.household_members hm
    WHERE hm.user_id = v_user_id
      AND hm.status = 'active'
  ) THEN
    RAISE EXCEPTION 'User already belongs to an active household'
      USING ERRCODE = '23505';
  END IF;

  SELECT pg_catalog.count(*)::integer
  INTO v_member_count
  FROM public.household_members hm
  WHERE hm.household_id = v_household_id
    AND hm.status = 'active';

  IF v_member_count >= 2 THEN
    RAISE EXCEPTION 'Household already has two active members'
      USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.household_members (
    household_id,
    user_id,
    role,
    status
  )
  VALUES (
    v_household_id,
    v_user_id,
    'partner',
    'active'
  );

  UPDATE public.household_invitations
  SET
    status = 'accepted',
    accepted_by = v_user_id,
    accepted_at = pg_catalog.now()
  WHERE id = v_invitation.id;

  UPDATE public.households
  SET status = 'active'
  WHERE id = v_household_id;

  SELECT pg_catalog.jsonb_build_object(
    'id', h.id,
    'name', h.name,
    'country', h.country,
    'base_currency', h.base_currency,
    'status', h.status
  )
  INTO v_result
  FROM public.households h
  WHERE h.id = v_household_id;

  RETURN pg_catalog.jsonb_build_object(
    'household', v_result,
    'membership', pg_catalog.jsonb_build_object(
      'user_id', v_user_id,
      'role', 'partner',
      'status', 'active'
    ),
    'invitation_id', v_invitation.id
  );
END;
$$;


-- RPC functions are available to authenticated callers only.
REVOKE ALL ON FUNCTION
  public.create_household_invitation(uuid, text, text, text)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION
  public.create_household_invitation(uuid, text, text, text)
TO authenticated;

REVOKE ALL ON FUNCTION
  public.accept_household_invitation(text)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION
  public.accept_household_invitation(text)
TO authenticated;
