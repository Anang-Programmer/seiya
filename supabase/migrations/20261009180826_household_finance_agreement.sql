
CREATE OR REPLACE FUNCTION public.propose_household_finance_rules(
  p_household_id uuid,
  p_rules jsonb
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
  v_version integer;
  v_rule_id uuid;
  v_result jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '42501';
  END IF;

  IF p_rules IS NULL OR pg_catalog.jsonb_typeof(p_rules) <> 'object' THEN
    RAISE EXCEPTION 'Rules must be a JSON object'
      USING ERRCODE = '22023';
  END IF;

  -- Serialize proposals for the same household.
  SELECT h.status
  INTO v_household_status
  FROM public.households h
  WHERE h.id = p_household_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Household not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_household_status <> 'active' THEN
    RAISE EXCEPTION 'Household must be active'
      USING ERRCODE = '22023';
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

  IF v_member_count <> 2 THEN
    RAISE EXCEPTION 'Exactly two active household members are required'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.household_finance_rules r
    WHERE r.household_id = p_household_id
      AND r.status = 'pending_approval'
  ) THEN
    RAISE EXCEPTION 'A finance agreement is already awaiting approval'
      USING ERRCODE = '23505';
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
    v_user_id,
    p_rules,
    'pending_approval'
  )
  RETURNING id INTO v_rule_id;

  -- The proposer confirms their own agreement.
  -- The other active member must explicitly approve or reject.
  INSERT INTO public.household_rule_approvals (
    rule_id,
    user_id,
    decision,
    decided_at
  )
  SELECT
    v_rule_id,
    hm.user_id,
    CASE
      WHEN hm.user_id = v_user_id THEN 'approved'
      ELSE 'pending'
    END,
    CASE
      WHEN hm.user_id = v_user_id THEN pg_catalog.now()
      ELSE NULL
    END
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
    'finance_rules.proposed',
    'household_finance_rules',
    v_rule_id,
    'pending',
    pg_catalog.jsonb_build_object('version', v_version)
  );

  SELECT pg_catalog.jsonb_build_object(
    'id', r.id,
    'household_id', r.household_id,
    'version', r.version,
    'rules', r.rules,
    'status', r.status,
    'created_by', r.created_by,
    'created_at', r.created_at
  )
  INTO v_result
  FROM public.household_finance_rules r
  WHERE r.id = v_rule_id;

  RETURN v_result;
END;
$$;


CREATE OR REPLACE FUNCTION public.decide_household_finance_rule(
  p_rule_id uuid,
  p_decision text,
  p_note text DEFAULT NULL
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
  v_rule public.household_finance_rules%ROWTYPE;
  v_result jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '42501';
  END IF;

  IF p_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Decision must be approved or rejected'
      USING ERRCODE = '22023';
  END IF;

  IF p_note IS NOT NULL AND pg_catalog.length(p_note) > 500 THEN
    RAISE EXCEPTION 'Decision note is too long'
      USING ERRCODE = '22023';
  END IF;

  SELECT r.household_id
  INTO v_household_id
  FROM public.household_finance_rules r
  WHERE r.id = p_rule_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Finance agreement not found'
      USING ERRCODE = 'P0002';
  END IF;

  -- Keep approval decisions serialized per household.
  SELECT h.status
  INTO v_household_status
  FROM public.households h
  WHERE h.id = v_household_id
  FOR UPDATE;

  SELECT r.*
  INTO v_rule
  FROM public.household_finance_rules r
  WHERE r.id = p_rule_id
  FOR UPDATE;

  IF v_rule.status <> 'pending_approval' THEN
    RAISE EXCEPTION 'Finance agreement is no longer pending'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.household_members hm
    WHERE hm.household_id = v_household_id
      AND hm.user_id = v_user_id
      AND hm.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Active household membership required'
      USING ERRCODE = '42501';
  END IF;

  -- Only a member who has not decided yet can decide.
  UPDATE public.household_rule_approvals a
  SET
    decision = p_decision,
    decided_at = pg_catalog.now(),
    note = NULLIF(pg_catalog.btrim(p_note), '')
  WHERE a.rule_id = p_rule_id
    AND a.user_id = v_user_id
    AND a.decision = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No pending approval exists for this user'
      USING ERRCODE = '23505';
  END IF;

  IF p_decision = 'rejected' THEN
    UPDATE public.household_finance_rules r
    SET status = 'rejected'
    WHERE r.id = p_rule_id;
  ELSE
    -- Activate only after every active member has approved.
    IF NOT EXISTS (
      SELECT 1
      FROM public.household_members hm
      WHERE hm.household_id = v_household_id
        AND hm.status = 'active'
        AND NOT EXISTS (
          SELECT 1
          FROM public.household_rule_approvals a
          WHERE a.rule_id = p_rule_id
            AND a.user_id = hm.user_id
            AND a.decision = 'approved'
        )
    ) THEN
      UPDATE public.household_finance_rules r
      SET status = 'superseded'
      WHERE r.household_id = v_household_id
        AND r.status = 'active'
        AND r.id <> p_rule_id;

      UPDATE public.household_finance_rules r
      SET
        status = 'active',
        activated_at = pg_catalog.now()
      WHERE r.id = p_rule_id;
    END IF;
  END IF;

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
    v_household_id,
    v_user_id,
    'finance_rules.' || p_decision,
    'household_finance_rules',
    p_rule_id,
    CASE
      WHEN p_decision = 'rejected' THEN 'denied'
      ELSE 'success'
    END,
    '{}'::jsonb
  );

  SELECT pg_catalog.jsonb_build_object(
    'id', r.id,
    'household_id', r.household_id,
    'version', r.version,
    'rules', r.rules,
    'status', r.status,
    'created_by', r.created_by,
    'activated_at', r.activated_at
  )
  INTO v_result
  FROM public.household_finance_rules r
  WHERE r.id = p_rule_id;

  RETURN v_result;
END;
$$;


REVOKE ALL ON FUNCTION
  public.propose_household_finance_rules(uuid, jsonb)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION
  public.propose_household_finance_rules(uuid, jsonb)
TO authenticated;

REVOKE ALL ON FUNCTION
  public.decide_household_finance_rule(uuid, text, text)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION
  public.decide_household_finance_rule(uuid, text, text)
TO authenticated;
