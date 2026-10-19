-- Seiya's Promise: AI-recommended couple clauses, negotiated per partner.
--
-- Flow: both partners finish onboarding (incl. transaction history) -> the
-- server stores one shared set of AI-recommended clauses -> each partner
-- selects/edits clauses on their own device -> when both submitted versions
-- are identical the promise activates and its numeric clauses become the
-- household's active finance rules. Different versions stay "negotiating".
--
-- Also fixes partner identity: profiles are private (profiles_select_own),
-- so members could not see each other's name. get_household_partner exposes
-- only the partner's id, role and full name to active members.

BEGIN;

-- -----------------------------------------------------------------------------
-- Partner identity
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_household_partner(p_household_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_result jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_household_member(p_household_id) THEN
    RAISE EXCEPTION 'Active household membership required' USING ERRCODE = '42501';
  END IF;

  SELECT pg_catalog.jsonb_build_object(
    'user_id', hm.user_id,
    'role', hm.role,
    'full_name', p.full_name
  )
  INTO v_result
  FROM public.household_members hm
  LEFT JOIN public.profiles p ON p.id = hm.user_id
  WHERE hm.household_id = p_household_id
    AND hm.status = 'active'
    AND hm.user_id <> v_user_id
  ORDER BY hm.joined_at
  LIMIT 1;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_household_partner(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_household_partner(uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.household_promises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL UNIQUE REFERENCES public.households(id) ON DELETE CASCADE,
  clauses jsonb NOT NULL CHECK (jsonb_typeof(clauses) = 'array'),
  status text NOT NULL DEFAULT 'negotiating' CHECK (status IN ('negotiating', 'active')),
  generated_by text,
  finance_rule_id uuid REFERENCES public.household_finance_rules(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  activated_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.household_promise_responses (
  promise_id uuid NOT NULL REFERENCES public.household_promises(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  selected jsonb NOT NULL CHECK (jsonb_typeof(selected) = 'array'),
  submitted_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  PRIMARY KEY (promise_id, user_id)
);

ALTER TABLE public.household_promises ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.household_promise_responses ENABLE ROW LEVEL SECURITY;

-- Members can read their household's promise and both responses (the
-- negotiation needs each side to see the other's version). All writes go
-- through the SECURITY DEFINER functions below.
CREATE POLICY household_promises_select_members ON public.household_promises
  FOR SELECT TO authenticated
  USING (public.is_household_member(household_id));

CREATE POLICY household_promise_responses_select_members ON public.household_promise_responses
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.household_promises hp
      WHERE hp.id = promise_id
        AND public.is_household_member(hp.household_id)
    )
  );

REVOKE ALL ON public.household_promises FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.household_promise_responses FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.household_promises TO authenticated;
GRANT SELECT ON public.household_promise_responses TO authenticated;

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------

-- Canonical form used to decide whether both partners agreed to the same version.
CREATE OR REPLACE FUNCTION public.normalize_promise_selection(p_selected jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', e ->> 'id',
        'kind', COALESCE(e ->> 'kind', 'custom'),
        'category', pg_catalog.btrim(COALESCE(e ->> 'category', '')),
        'title', pg_catalog.btrim(COALESCE(e ->> 'title', '')),
        'description', pg_catalog.btrim(COALESCE(e ->> 'description', '')),
        'seiyaWill', pg_catalog.btrim(COALESCE(e ->> 'seiyaWill', '')),
        'params', COALESCE(e -> 'params', '{}'::jsonb)
      )
      ORDER BY e ->> 'id'
    ),
    '[]'::jsonb
  )
  FROM pg_catalog.jsonb_array_elements(p_selected) AS e;
$$;

-- Per-member onboarding progress, read with definer rights so partners can
-- see each other's completion without seeing each other's private answers.
CREATE OR REPLACE FUNCTION public.household_onboarding_progress(p_household_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'user_id', hm.user_id,
        'role', hm.role,
        'full_name', p.full_name,
        'onboarding_done', o.completed_at IS NOT NULL,
        'history_done', COALESCE(o.answers ->> 'historyCompleted' = 'true', false)
      )
      ORDER BY hm.joined_at
    ),
    '[]'::jsonb
  )
  FROM public.household_members hm
  LEFT JOIN public.profiles p ON p.id = hm.user_id
  LEFT JOIN LATERAL (
    SELECT r.completed_at, r.answers
    FROM public.onboarding_responses r
    WHERE r.user_id = hm.user_id
      AND r.completed_at IS NOT NULL
    ORDER BY r.response_version DESC
    LIMIT 1
  ) o ON TRUE
  WHERE hm.household_id = p_household_id
    AND hm.status = 'active';
$$;

REVOKE ALL ON FUNCTION public.household_onboarding_progress(uuid) FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Status
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_household_promise_status(p_household_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_promise public.household_promises%ROWTYPE;
  v_responses jsonb := '[]'::jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_household_member(p_household_id) THEN
    RAISE EXCEPTION 'Active household membership required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_promise
  FROM public.household_promises
  WHERE household_id = p_household_id;

  IF FOUND THEN
    SELECT COALESCE(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'user_id', r.user_id,
          'selected', r.selected,
          'submitted_at', r.submitted_at
        )
      ),
      '[]'::jsonb
    )
    INTO v_responses
    FROM public.household_promise_responses r
    WHERE r.promise_id = v_promise.id;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'members', public.household_onboarding_progress(p_household_id),
    'promise', CASE WHEN v_promise.id IS NULL THEN NULL ELSE pg_catalog.jsonb_build_object(
      'id', v_promise.id,
      'clauses', v_promise.clauses,
      'status', v_promise.status,
      'generated_by', v_promise.generated_by,
      'activated_at', v_promise.activated_at
    ) END,
    'responses', v_responses
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_household_promise_status(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_household_promise_status(uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- Store the shared AI recommendation (first writer wins)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_household_promise_clauses(
  p_household_id uuid,
  p_clauses jsonb,
  p_generated_by text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_progress jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_household_member(p_household_id) THEN
    RAISE EXCEPTION 'Active household membership required' USING ERRCODE = '42501';
  END IF;

  IF p_clauses IS NULL
     OR pg_catalog.jsonb_typeof(p_clauses) <> 'array'
     OR pg_catalog.jsonb_array_length(p_clauses) NOT BETWEEN 3 AND 12 THEN
    RAISE EXCEPTION 'Clauses must be an array of 3 to 12 items' USING ERRCODE = '22023';
  END IF;

  -- Recommendations open only after both partners finished onboarding + history.
  v_progress := public.household_onboarding_progress(p_household_id);
  IF pg_catalog.jsonb_array_length(v_progress) <> 2 OR EXISTS (
    SELECT 1
    FROM pg_catalog.jsonb_array_elements(v_progress) m
    WHERE NOT ((m ->> 'onboarding_done')::boolean AND (m ->> 'history_done')::boolean)
  ) THEN
    RAISE EXCEPTION 'Both partners must finish onboarding first' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.household_promises (household_id, clauses, generated_by)
  VALUES (p_household_id, p_clauses, NULLIF(pg_catalog.btrim(COALESCE(p_generated_by, '')), ''))
  ON CONFLICT (household_id) DO NOTHING;

  RETURN public.get_household_promise_status(p_household_id);
END;
$$;

REVOKE ALL ON FUNCTION public.save_household_promise_clauses(uuid, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_household_promise_clauses(uuid, jsonb, text) TO authenticated;

-- -----------------------------------------------------------------------------
-- Submit my version; activate when both versions match
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_household_promise_response(
  p_household_id uuid,
  p_selected jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_promise public.household_promises%ROWTYPE;
  v_mine jsonb;
  v_theirs jsonb;
  v_response_count integer;
  v_clause jsonb;
  v_owner_percent numeric := 50;
  v_require_approval boolean := false;
  v_threshold numeric := 0;
  v_cooling_enabled boolean := false;
  v_cooling_threshold numeric := 0;
  v_cooling_hours integer := 8;
  v_rules jsonb;
  v_version integer;
  v_rule_id uuid;
  v_outcome text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_household_member(p_household_id) THEN
    RAISE EXCEPTION 'Active household membership required' USING ERRCODE = '42501';
  END IF;

  IF p_selected IS NULL
     OR pg_catalog.jsonb_typeof(p_selected) <> 'array'
     OR pg_catalog.jsonb_array_length(p_selected) NOT BETWEEN 1 AND 20 THEN
    RAISE EXCEPTION 'Select between 1 and 20 clauses' USING ERRCODE = '22023';
  END IF;

  -- Serialize decisions for the household.
  PERFORM 1 FROM public.households h WHERE h.id = p_household_id FOR UPDATE;

  SELECT * INTO v_promise
  FROM public.household_promises
  WHERE household_id = p_household_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No recommendation exists yet' USING ERRCODE = 'P0002';
  END IF;

  IF v_promise.status = 'active' THEN
    RAISE EXCEPTION 'Seiya''s Promise is already active' USING ERRCODE = '22023';
  END IF;

  v_mine := public.normalize_promise_selection(p_selected);

  INSERT INTO public.household_promise_responses (promise_id, user_id, selected, submitted_at)
  VALUES (v_promise.id, v_user_id, p_selected, pg_catalog.now())
  ON CONFLICT (promise_id, user_id)
  DO UPDATE SET selected = EXCLUDED.selected, submitted_at = EXCLUDED.submitted_at;

  UPDATE public.household_promises SET updated_at = pg_catalog.now() WHERE id = v_promise.id;

  SELECT pg_catalog.count(*)::integer INTO v_response_count
  FROM public.household_promise_responses
  WHERE promise_id = v_promise.id;

  SELECT public.normalize_promise_selection(r.selected) INTO v_theirs
  FROM public.household_promise_responses r
  WHERE r.promise_id = v_promise.id
    AND r.user_id <> v_user_id
  LIMIT 1;

  IF v_response_count < 2 THEN
    v_outcome := 'waiting_partner';
  ELSIF v_theirs IS DISTINCT FROM v_mine THEN
    v_outcome := 'different';
  ELSE
    -- Both partners agreed on the same version: turn the numeric clauses into
    -- the household's active finance rules.
    FOR v_clause IN SELECT * FROM pg_catalog.jsonb_array_elements(v_mine) LOOP
      IF v_clause ->> 'kind' = 'cost_sharing'
         AND pg_catalog.jsonb_typeof(v_clause #> '{params,ownerPercent}') = 'number' THEN
        v_owner_percent := LEAST(100, GREATEST(0, pg_catalog.round((v_clause #>> '{params,ownerPercent}')::numeric)));
      ELSIF v_clause ->> 'kind' = 'discuss_first'
         AND pg_catalog.jsonb_typeof(v_clause #> '{params,threshold}') = 'number' THEN
        v_require_approval := true;
        v_threshold := GREATEST(0, pg_catalog.round((v_clause #>> '{params,threshold}')::numeric));
      ELSIF v_clause ->> 'kind' = 'cooling_off'
         AND pg_catalog.jsonb_typeof(v_clause #> '{params,threshold}') = 'number' THEN
        v_cooling_enabled := true;
        v_cooling_threshold := GREATEST(0, pg_catalog.round((v_clause #>> '{params,threshold}')::numeric));
        IF pg_catalog.jsonb_typeof(v_clause #> '{params,hours}') = 'number' THEN
          v_cooling_hours := LEAST(72, GREATEST(1, pg_catalog.round((v_clause #>> '{params,hours}')::numeric)::integer));
        END IF;
      END IF;
    END LOOP;

    v_rules := pg_catalog.jsonb_build_object(
      'walletMode', 'shared_and_personal',
      'expenseSplit', pg_catalog.jsonb_build_object(
        'mode', CASE WHEN v_owner_percent = 50 THEN 'equal' ELSE 'custom' END,
        'ownerPercent', v_owner_percent,
        'partnerPercent', 100 - v_owner_percent
      ),
      'approval', pg_catalog.jsonb_build_object(
        'requirePartnerApprovalAboveThreshold', v_require_approval,
        'sharedWalletThreshold', v_threshold
      ),
      'coolingOff', pg_catalog.jsonb_build_object(
        'enabled', v_cooling_enabled,
        'threshold', v_cooling_threshold,
        'durationHours', v_cooling_hours
      ),
      'promiseId', v_promise.id
    );

    -- Replace any earlier agreement or open proposal.
    UPDATE public.household_finance_rules
    SET status = 'superseded'
    WHERE household_id = p_household_id
      AND status IN ('active', 'pending_approval');

    v_version := COALESCE(
      (SELECT pg_catalog.max(r.version) FROM public.household_finance_rules r WHERE r.household_id = p_household_id),
      0
    ) + 1;

    INSERT INTO public.household_finance_rules (household_id, version, created_by, rules, status, activated_at)
    VALUES (p_household_id, v_version, v_user_id, v_rules, 'active', pg_catalog.now())
    RETURNING id INTO v_rule_id;

    INSERT INTO public.household_rule_approvals (rule_id, user_id, decision, decided_at)
    SELECT v_rule_id, hm.user_id, 'approved', pg_catalog.now()
    FROM public.household_members hm
    WHERE hm.household_id = p_household_id
      AND hm.status = 'active';

    UPDATE public.household_promises
    SET status = 'active',
        activated_at = pg_catalog.now(),
        finance_rule_id = v_rule_id,
        updated_at = pg_catalog.now()
    WHERE id = v_promise.id;

    INSERT INTO public.audit_events (
      household_id, actor_user_id, action, entity_type, entity_id, outcome, details
    ) VALUES (
      p_household_id, v_user_id, 'promise.activated', 'household_promises', v_promise.id, 'success',
      pg_catalog.jsonb_build_object('finance_rule_id', v_rule_id, 'version', v_version)
    );

    v_outcome := 'active';
  END IF;

  RETURN pg_catalog.jsonb_build_object('outcome', v_outcome)
    || pg_catalog.jsonb_build_object('status', public.get_household_promise_status(p_household_id));
END;
$$;

REVOKE ALL ON FUNCTION public.submit_household_promise_response(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_household_promise_response(uuid, jsonb) TO authenticated;

COMMIT;
