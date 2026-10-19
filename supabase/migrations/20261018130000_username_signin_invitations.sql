-- Seiya: username (full name) sign-in.
-- Accounts are created server-side with an internal placeholder email, so
-- partner invitations can no longer be matched against the invitee's email.
-- This replaces accept_household_invitation without the email check; every
-- other guard (token, expiry, owner still active, one household per user,
-- two-member limit) is unchanged. create_household_invitation is untouched:
-- the service passes a unique placeholder address for invited_email.

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

  -- Accounts sign in with a username (full name), so the invitation is no
  -- longer bound to an email address. The single-use, 7-day token is the
  -- credential: whoever holds the link may join as the partner.

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

REVOKE ALL ON FUNCTION
  public.accept_household_invitation(text)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION
  public.accept_household_invitation(text)
TO authenticated;


-- -----------------------------------------------------------------------------
-- Couple contract bootstrap.
-- Each partner adjusts the AI-recommended terms on their own during onboarding
-- (stored as answers.contractPreferences.rules). Once both are household
-- members, the terms of whoever finished onboarding first become the first
-- proposal: that partner counts as having signed, the other must approve.
-- Idempotent: does nothing while a proposal or an active agreement exists.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_valid_finance_rules(p_rules jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
BEGIN
  -- Checked step by step so numeric casts only run on JSON numbers.
  IF p_rules IS NULL OR pg_catalog.jsonb_typeof(p_rules) <> 'object' THEN
    RETURN false;
  END IF;

  IF COALESCE(p_rules ->> 'walletMode', '') NOT IN ('shared_only', 'shared_and_personal', 'separate_only') THEN
    RETURN false;
  END IF;

  IF pg_catalog.jsonb_typeof(p_rules #> '{expenseSplit,ownerPercent}') IS DISTINCT FROM 'number'
     OR pg_catalog.jsonb_typeof(p_rules #> '{expenseSplit,partnerPercent}') IS DISTINCT FROM 'number'
     OR pg_catalog.jsonb_typeof(p_rules #> '{approval,requirePartnerApprovalAboveThreshold}') IS DISTINCT FROM 'boolean'
     OR pg_catalog.jsonb_typeof(p_rules #> '{approval,sharedWalletThreshold}') IS DISTINCT FROM 'number'
     OR pg_catalog.jsonb_typeof(p_rules #> '{coolingOff,enabled}') IS DISTINCT FROM 'boolean'
     OR pg_catalog.jsonb_typeof(p_rules #> '{coolingOff,threshold}') IS DISTINCT FROM 'number'
     OR pg_catalog.jsonb_typeof(p_rules #> '{coolingOff,durationHours}') IS DISTINCT FROM 'number' THEN
    RETURN false;
  END IF;

  RETURN (p_rules #>> '{expenseSplit,ownerPercent}')::numeric
           + (p_rules #>> '{expenseSplit,partnerPercent}')::numeric = 100
    AND (p_rules #>> '{approval,sharedWalletThreshold}')::numeric >= 0
    AND (p_rules #>> '{coolingOff,threshold}')::numeric >= 0
    AND (p_rules #>> '{coolingOff,durationHours}')::numeric BETWEEN 1 AND 72;
END;
$$;

CREATE OR REPLACE FUNCTION public.bootstrap_household_finance_rules(
  p_household_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_household_status text;
  v_member_count integer;
  v_proposer uuid;
  v_rules jsonb;
  v_version integer;
  v_rule_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '42501';
  END IF;

  -- Serialize with propose/decide for the same household.
  SELECT h.status
  INTO v_household_status
  FROM public.households h
  WHERE h.id = p_household_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Household not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.household_members hm
    WHERE hm.household_id = p_household_id
      AND hm.user_id = v_user_id
      AND hm.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Active household membership required'
      USING ERRCODE = '42501';
  END IF;

  SELECT pg_catalog.count(*)::integer
  INTO v_member_count
  FROM public.household_members hm
  WHERE hm.household_id = p_household_id
    AND hm.status = 'active';

  IF v_member_count <> 2 OR v_household_status <> 'active' THEN
    RETURN pg_catalog.jsonb_build_object('status', 'waiting_for_partner');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.household_finance_rules r
    WHERE r.household_id = p_household_id
      AND r.status IN ('pending_approval', 'active')
  ) THEN
    RETURN pg_catalog.jsonb_build_object('status', 'already_exists');
  END IF;

  -- Latest completed onboarding per member; earliest completion wins.
  SELECT o.user_id, o.answers #> '{contractPreferences,rules}'
  INTO v_proposer, v_rules
  FROM public.household_members hm
  JOIN LATERAL (
    SELECT r.user_id, r.answers, r.completed_at
    FROM public.onboarding_responses r
    WHERE r.user_id = hm.user_id
      AND r.completed_at IS NOT NULL
    ORDER BY r.response_version DESC
    LIMIT 1
  ) o ON TRUE
  WHERE hm.household_id = p_household_id
    AND hm.status = 'active'
    AND public.is_valid_finance_rules(o.answers #> '{contractPreferences,rules}')
  ORDER BY o.completed_at ASC
  LIMIT 1;

  IF v_proposer IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('status', 'no_preferences');
  END IF;

  v_version := COALESCE(
    (
      SELECT pg_catalog.max(r.version)
      FROM public.household_finance_rules r
      WHERE r.household_id = p_household_id
    ),
    0
  ) + 1;

  INSERT INTO public.household_finance_rules (
    household_id,
    version,
    created_by,
    rules,
    status
  )
  VALUES (
    p_household_id,
    v_version,
    v_proposer,
    v_rules,
    'pending_approval'
  )
  RETURNING id INTO v_rule_id;

  -- The partner whose terms are proposed has already agreed to them.
  INSERT INTO public.household_rule_approvals (
    rule_id,
    user_id,
    decision,
    decided_at
  )
  SELECT
    v_rule_id,
    hm.user_id,
    CASE WHEN hm.user_id = v_proposer THEN 'approved' ELSE 'pending' END,
    CASE WHEN hm.user_id = v_proposer THEN pg_catalog.now() ELSE NULL END
  FROM public.household_members hm
  WHERE hm.household_id = p_household_id
    AND hm.status = 'active';

  INSERT INTO public.audit_events (
    household_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    outcome,
    details
  )
  VALUES (
    p_household_id,
    v_user_id,
    'finance_rules.bootstrapped',
    'household_finance_rules',
    v_rule_id,
    'pending',
    pg_catalog.jsonb_build_object('version', v_version, 'proposed_by', v_proposer)
  );

  RETURN pg_catalog.jsonb_build_object(
    'status', 'proposed',
    'rule_id', v_rule_id,
    'version', v_version,
    'proposed_by', v_proposer
  );
END;
$$;

REVOKE ALL ON FUNCTION public.is_valid_finance_rules(jsonb)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.is_valid_finance_rules(jsonb)
TO authenticated;

REVOKE ALL ON FUNCTION public.bootstrap_household_finance_rules(uuid)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.bootstrap_household_finance_rules(uuid)
TO authenticated;
