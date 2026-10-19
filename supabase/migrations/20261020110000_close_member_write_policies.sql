-- =============================================================================
-- Migration: 20261020110000_close_member_write_policies.sql
-- Description: Closes the remaining RLS policies from
--              20261017091500_couple_features_dual_key_gateway.sql that let any
--              household member write sensitive rows directly through PostgREST:
--
--   1. household_settlements: no direct INSERT/UPDATE. The row is created by
--      get_household_settlement() and cleared by settle_up_household(), which
--      only the partner who is owed may call.
--   2. activities: no direct INSERT. log_household_activity() sets the actor
--      from auth.uid() and refuses partner-decision statuses and titles.
--      record_activity() (any actor) is no longer callable through the API.
--   3. plans: no direct UPDATE. update_household_plan() applies solo fields at
--      once and sends target, currency, split ratio and archiving to the
--      partner as a GOAL approval, applied when the partner approves.
--   4. held_purchases: only the requester can delete their held item.
--
-- Deploy together with the app code that calls these RPCs (shared project).
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Settlement ledger
-- -----------------------------------------------------------------------------

-- Returns the ledger, creating the zero row on first read.
CREATE OR REPLACE FUNCTION public.get_household_settlement(p_household_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.household_settlements%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_household_member(p_household_id) THEN
    RAISE EXCEPTION 'Active household membership required' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.household_settlements (household_id, currency)
  SELECT h.id, h.base_currency
  FROM public.households h
  WHERE h.id = p_household_id
  ON CONFLICT (household_id) DO NOTHING;

  SELECT s.* INTO v_row
  FROM public.household_settlements s
  WHERE s.household_id = p_household_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Household not found' USING ERRCODE = 'P0002';
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'partner_b_owes_a', v_row.partner_b_owes_a,
    'partner_a_owes_b', v_row.partner_a_owes_b,
    'currency', v_row.currency
  );
END;
$$;

-- Clears the ledger. Only the creditor can confirm they were paid back, so the
-- partner who owes cannot erase their own debt.
CREATE OR REPLACE FUNCTION public.settle_up_household(p_household_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_actor text;
  v_creditor text;
  v_amount numeric;
  v_row public.household_settlements%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_household_member(p_household_id) THEN
    RAISE EXCEPTION 'Active household membership required' USING ERRCODE = '42501';
  END IF;

  -- Serialize with the transaction engine for this household.
  PERFORM 1 FROM public.households h WHERE h.id = p_household_id FOR UPDATE;

  PERFORM public.get_household_settlement(p_household_id);

  SELECT s.* INTO v_row
  FROM public.household_settlements s
  WHERE s.household_id = p_household_id
  FOR UPDATE;

  IF v_row.partner_b_owes_a = 0 AND v_row.partner_a_owes_b = 0 THEN
    RETURN pg_catalog.jsonb_build_object(
      'partner_b_owes_a', 0,
      'partner_a_owes_b', 0,
      'currency', v_row.currency
    );
  END IF;

  v_actor := public.household_role_code(p_household_id, v_user_id);
  IF v_row.partner_b_owes_a > 0 THEN
    v_creditor := 'partner_a';
    v_amount := v_row.partner_b_owes_a;
  ELSE
    v_creditor := 'partner_b';
    v_amount := v_row.partner_a_owes_b;
  END IF;

  IF v_actor IS DISTINCT FROM v_creditor THEN
    RAISE EXCEPTION 'Only the partner who is owed can confirm the settlement'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.household_settlements s
  SET partner_b_owes_a = 0,
      partner_a_owes_b = 0,
      updated_at = pg_catalog.now()
  WHERE s.household_id = p_household_id;

  PERFORM public.insert_household_activity(
    p_household_id,
    'Settlement Completed',
    'Settlement',
    v_actor,
    'ALLOW',
    v_amount,
    v_row.currency,
    'Shared expense ledger balance settled between partners.'
  );

  RETURN pg_catalog.jsonb_build_object(
    'partner_b_owes_a', 0,
    'partner_a_owes_b', 0,
    'currency', v_row.currency
  );
END;
$$;

DROP POLICY IF EXISTS settlements_insert ON public.household_settlements;
DROP POLICY IF EXISTS settlements_update ON public.household_settlements;
REVOKE INSERT, UPDATE, DELETE ON public.household_settlements FROM anon, authenticated;

REVOKE ALL ON FUNCTION public.get_household_settlement(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_household_settlement(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.settle_up_household(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.settle_up_household(uuid) TO authenticated;


-- -----------------------------------------------------------------------------
-- 2. Activity log
-- -----------------------------------------------------------------------------

-- The app's own activity entries. The actor is always the caller; partner
-- decisions (DENY, "... Approved & Executed", dissolutions, settlements) are
-- written only by the server-side RPCs through insert_household_activity().
CREATE OR REPLACE FUNCTION public.log_household_activity(
  p_household_id uuid,
  p_title text,
  p_category text DEFAULT 'Activity',
  p_status text DEFAULT 'INFO',
  p_amount numeric DEFAULT NULL,
  p_currency text DEFAULT NULL,
  p_reason text DEFAULT ''
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_title text := pg_catalog.btrim(COALESCE(p_title, ''));
  v_category text := COALESCE(NULLIF(pg_catalog.btrim(COALESCE(p_category, '')), ''), 'Activity');
  v_status text := COALESCE(p_status, 'INFO');
  v_reason text := COALESCE(p_reason, '');
  v_actor text;
  v_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_household_member(p_household_id) THEN
    RAISE EXCEPTION 'Active household membership required' USING ERRCODE = '42501';
  END IF;

  IF v_title = '' OR pg_catalog.length(v_title) > 200
    OR pg_catalog.length(v_category) > 80
    OR pg_catalog.length(v_reason) > 1000 THEN
    RAISE EXCEPTION 'Activity text is empty or too long' USING ERRCODE = '22023';
  END IF;

  IF v_status NOT IN ('INFO', 'NEED_APPROVAL', 'HOLD', 'ALLOW') THEN
    RAISE EXCEPTION 'Activity status is not allowed' USING ERRCODE = '22023';
  END IF;

  IF v_title ~* ' (approved & executed|confirmed after cooldown)$'
    OR v_title ~* '^(goal dissolved|bill deleted|approval dispatched|settlement completed)' THEN
    RAISE EXCEPTION 'Activity title is reserved for server decisions' USING ERRCODE = '22023';
  END IF;

  IF p_amount IS NOT NULL AND p_amount < 0 THEN
    RAISE EXCEPTION 'Activity amount must be non-negative' USING ERRCODE = '22023';
  END IF;

  IF p_currency IS NOT NULL AND p_currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'Currency must be a 3-letter code' USING ERRCODE = '22023';
  END IF;

  v_actor := public.household_role_code(p_household_id, v_user_id);

  INSERT INTO public.activities (
    household_id, title, category, actor, status, amount, currency, reason
  ) VALUES (
    p_household_id, v_title, v_category, v_actor, v_status, p_amount, p_currency, v_reason
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

DROP POLICY IF EXISTS activities_insert ON public.activities;
REVOKE INSERT, UPDATE, DELETE ON public.activities FROM anon, authenticated;

REVOKE ALL ON FUNCTION public.log_household_activity(uuid, text, text, text, numeric, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_household_activity(uuid, text, text, text, numeric, text, text) TO authenticated;

-- Takes any actor; still used inside import_statement_batch (SECURITY DEFINER).
REVOKE ALL ON FUNCTION public.record_activity(uuid, text, text, text, text, numeric, text, text) FROM PUBLIC, anon, authenticated;


-- -----------------------------------------------------------------------------
-- 3. Plans: shared terms need the partner
-- -----------------------------------------------------------------------------

-- Proposed term changes waiting on a GOAL approval. Written only by
-- update_household_plan(); applied by the approvals trigger below.
CREATE TABLE IF NOT EXISTS public.plan_change_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  approval_id uuid NOT NULL UNIQUE REFERENCES public.approvals(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES auth.users(id),
  changes jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'applied', 'declined', 'cancelled', 'expired', 'stale')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS plan_change_proposals_plan_pending_idx
  ON public.plan_change_proposals (plan_id)
  WHERE status = 'pending';

ALTER TABLE public.plan_change_proposals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS plan_change_proposals_select ON public.plan_change_proposals;
CREATE POLICY plan_change_proposals_select ON public.plan_change_proposals
  FOR SELECT TO authenticated
  USING (public.is_household_member(household_id));

REVOKE ALL ON public.plan_change_proposals FROM anon, authenticated;
GRANT SELECT ON public.plan_change_proposals TO authenticated;

-- Allowed keys use the plans column names. One partner may change title,
-- category, current_amount, target_date, recommended_monthly, wallet_funding,
-- assumptions and non-archive status alone. target_amount, currency, the split
-- ratio and archiving need the partner, unless the household has no active
-- partner yet or the caller is still drafting a goal they created.
CREATE OR REPLACE FUNCTION public.update_household_plan(
  p_plan_id uuid,
  p_changes jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_household_id uuid;
  v_plan public.plans%ROWTYPE;
  v_new public.plans%ROWTYPE;
  v_saved public.plans%ROWTYPE;
  v_partner_id uuid;
  v_role text;
  v_solo boolean;
  v_old_ratio numeric;
  v_new_ratio numeric;
  v_archive boolean;
  v_gated boolean;
  v_terms jsonb;
  v_summary text;
  v_approval_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF p_changes IS NULL OR pg_catalog.jsonb_typeof(p_changes) <> 'object' THEN
    RAISE EXCEPTION 'Changes must be an object' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_object_keys(p_changes) k
    WHERE k NOT IN (
      'title', 'category', 'target_amount', 'current_amount', 'currency',
      'target_date', 'recommended_monthly', 'split_partner_a', 'split_partner_b',
      'wallet_funding', 'status', 'assumptions'
    )
  ) THEN
    RAISE EXCEPTION 'Unknown plan field' USING ERRCODE = '22023';
  END IF;

  SELECT p.household_id INTO v_household_id
  FROM public.plans p
  WHERE p.id = p_plan_id;

  IF NOT FOUND OR NOT public.is_household_member(v_household_id) THEN
    RAISE EXCEPTION 'Goal not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT p.* INTO v_plan
  FROM public.plans p
  WHERE p.id = p_plan_id
  FOR UPDATE;

  v_new := v_plan;

  IF p_changes ? 'title' THEN
    IF pg_catalog.jsonb_typeof(p_changes->'title') <> 'string'
      OR pg_catalog.btrim(p_changes->>'title') = ''
      OR pg_catalog.length(pg_catalog.btrim(p_changes->>'title')) > 160 THEN
      RAISE EXCEPTION 'Title must be 1 to 160 characters' USING ERRCODE = '22023';
    END IF;
    v_new.title := pg_catalog.btrim(p_changes->>'title');
  END IF;

  IF p_changes ? 'category' THEN
    IF pg_catalog.jsonb_typeof(p_changes->'category') <> 'string'
      OR pg_catalog.btrim(p_changes->>'category') = ''
      OR pg_catalog.length(pg_catalog.btrim(p_changes->>'category')) > 80 THEN
      RAISE EXCEPTION 'Category must be 1 to 80 characters' USING ERRCODE = '22023';
    END IF;
    v_new.category := pg_catalog.btrim(p_changes->>'category');
  END IF;

  IF p_changes ? 'target_amount' THEN
    IF pg_catalog.jsonb_typeof(p_changes->'target_amount') <> 'number'
      OR (p_changes->>'target_amount')::numeric <= 0
      OR (p_changes->>'target_amount')::numeric > 999999999999.99 THEN
      RAISE EXCEPTION 'target_amount must be positive' USING ERRCODE = '22023';
    END IF;
    v_new.target_amount := (p_changes->>'target_amount')::numeric;
  END IF;

  IF p_changes ? 'current_amount' THEN
    IF pg_catalog.jsonb_typeof(p_changes->'current_amount') <> 'number'
      OR (p_changes->>'current_amount')::numeric < 0
      OR (p_changes->>'current_amount')::numeric > 999999999999.99 THEN
      RAISE EXCEPTION 'current_amount must be non-negative' USING ERRCODE = '22023';
    END IF;
    v_new.current_amount := (p_changes->>'current_amount')::numeric;
  END IF;

  IF p_changes ? 'currency' THEN
    IF pg_catalog.jsonb_typeof(p_changes->'currency') <> 'string'
      OR (p_changes->>'currency') !~ '^[A-Z]{3}$' THEN
      RAISE EXCEPTION 'Currency must be a 3-letter code' USING ERRCODE = '22023';
    END IF;
    v_new.currency := p_changes->>'currency';
  END IF;

  IF p_changes ? 'target_date' THEN
    IF pg_catalog.jsonb_typeof(p_changes->'target_date') <> 'string'
      OR pg_catalog.btrim(p_changes->>'target_date') = ''
      OR pg_catalog.length(pg_catalog.btrim(p_changes->>'target_date')) > 100 THEN
      RAISE EXCEPTION 'target_date must be 1 to 100 characters' USING ERRCODE = '22023';
    END IF;
    v_new.target_date := pg_catalog.btrim(p_changes->>'target_date');
  END IF;

  IF p_changes ? 'recommended_monthly' THEN
    IF pg_catalog.jsonb_typeof(p_changes->'recommended_monthly') <> 'number'
      OR (p_changes->>'recommended_monthly')::numeric < 0
      OR (p_changes->>'recommended_monthly')::numeric > 999999999999.99 THEN
      RAISE EXCEPTION 'recommended_monthly must be non-negative' USING ERRCODE = '22023';
    END IF;
    v_new.recommended_monthly := (p_changes->>'recommended_monthly')::numeric;
  END IF;

  IF p_changes ? 'split_partner_a' THEN
    IF pg_catalog.jsonb_typeof(p_changes->'split_partner_a') <> 'number'
      OR (p_changes->>'split_partner_a')::numeric < 0
      OR (p_changes->>'split_partner_a')::numeric > 100 THEN
      RAISE EXCEPTION 'split_partner_a must be a percentage from 0 to 100' USING ERRCODE = '22023';
    END IF;
    v_new.split_partner_a := (p_changes->>'split_partner_a')::numeric;
  END IF;

  IF p_changes ? 'split_partner_b' THEN
    IF pg_catalog.jsonb_typeof(p_changes->'split_partner_b') <> 'number'
      OR (p_changes->>'split_partner_b')::numeric < 0
      OR (p_changes->>'split_partner_b')::numeric > 100 THEN
      RAISE EXCEPTION 'split_partner_b must be a percentage from 0 to 100' USING ERRCODE = '22023';
    END IF;
    v_new.split_partner_b := (p_changes->>'split_partner_b')::numeric;
  END IF;

  IF p_changes ? 'wallet_funding' THEN
    IF pg_catalog.jsonb_typeof(p_changes->'wallet_funding') <> 'string'
      OR pg_catalog.length(p_changes->>'wallet_funding') > 160 THEN
      RAISE EXCEPTION 'wallet_funding must be at most 160 characters' USING ERRCODE = '22023';
    END IF;
    v_new.wallet_funding := pg_catalog.btrim(p_changes->>'wallet_funding');
  END IF;

  IF p_changes ? 'status' THEN
    IF pg_catalog.jsonb_typeof(p_changes->'status') <> 'string'
      OR (p_changes->>'status') NOT IN ('Draft', 'Proposed', 'Active', 'Needs review', 'Paused', 'Completed', 'Archived') THEN
      RAISE EXCEPTION 'Invalid plan status' USING ERRCODE = '22023';
    END IF;
    v_new.status := p_changes->>'status';
  END IF;

  IF p_changes ? 'assumptions' THEN
    IF pg_catalog.jsonb_typeof(p_changes->'assumptions') = 'null' THEN
      v_new.assumptions := NULL;
    ELSIF pg_catalog.jsonb_typeof(p_changes->'assumptions') <> 'string'
      OR pg_catalog.length(pg_catalog.btrim(p_changes->>'assumptions')) > 1000 THEN
      RAISE EXCEPTION 'Assumptions must be at most 1000 characters' USING ERRCODE = '22023';
    ELSE
      v_new.assumptions := NULLIF(pg_catalog.btrim(p_changes->>'assumptions'), '');
    END IF;
  END IF;

  v_role := public.household_role_code(v_household_id, v_user_id);
  v_partner_id := public.household_partner_user_id(v_household_id, v_user_id);
  v_solo := v_partner_id IS NULL
    OR (v_plan.status = 'Draft' AND v_plan.created_by = v_user_id);

  -- split_partner_a/b are percentages; the ratio between them is what the
  -- partners agreed on.
  v_old_ratio := CASE WHEN v_plan.split_partner_a + v_plan.split_partner_b > 0
    THEN pg_catalog.round(v_plan.split_partner_a * 100 / (v_plan.split_partner_a + v_plan.split_partner_b), 1) END;
  v_new_ratio := CASE WHEN v_new.split_partner_a + v_new.split_partner_b > 0
    THEN pg_catalog.round(v_new.split_partner_a * 100 / (v_new.split_partner_a + v_new.split_partner_b), 1) END;
  v_archive := v_new.status = 'Archived' AND v_plan.status <> 'Archived';

  v_gated := v_new.target_amount <> v_plan.target_amount
    OR v_new.currency <> v_plan.currency
    OR v_new_ratio IS DISTINCT FROM v_old_ratio
    OR v_archive;

  IF v_gated AND NOT v_solo THEN
    v_terms := pg_catalog.jsonb_build_object(
      'target_amount', v_new.target_amount,
      'currency', v_new.currency,
      'split_partner_a', v_new.split_partner_a,
      'split_partner_b', v_new.split_partner_b,
      'recommended_monthly', v_new.recommended_monthly
    );
    IF v_archive THEN
      v_terms := v_terms || pg_catalog.jsonb_build_object('status', 'Archived');
    END IF;

    v_summary := pg_catalog.concat_ws('; ',
      CASE WHEN v_new.target_amount <> v_plan.target_amount
        THEN 'target ' || v_plan.target_amount::text || ' → ' || v_new.target_amount::text END,
      CASE WHEN v_new.currency <> v_plan.currency
        THEN 'currency ' || v_plan.currency || ' → ' || v_new.currency END,
      CASE WHEN v_new_ratio IS DISTINCT FROM v_old_ratio
        THEN 'split A/B ' || COALESCE(v_old_ratio::text, '-') || '% → ' || COALESCE(v_new_ratio::text, '-') || '%' END,
      CASE WHEN v_archive THEN 'archive the goal' END
    );

    -- Shared terms stay as they are until the partner approves.
    v_new.target_amount := v_plan.target_amount;
    v_new.currency := v_plan.currency;
    v_new.split_partner_a := v_plan.split_partner_a;
    v_new.split_partner_b := v_plan.split_partner_b;
    v_new.recommended_monthly := v_plan.recommended_monthly;
    IF v_archive THEN
      v_new.status := v_plan.status;
    END IF;
  END IF;

  UPDATE public.plans p
  SET title = v_new.title,
      category = v_new.category,
      target_amount = v_new.target_amount,
      current_amount = v_new.current_amount,
      currency = v_new.currency,
      target_date = v_new.target_date,
      recommended_monthly = v_new.recommended_monthly,
      split_partner_a = v_new.split_partner_a,
      split_partner_b = v_new.split_partner_b,
      wallet_funding = v_new.wallet_funding,
      status = v_new.status,
      assumptions = v_new.assumptions,
      updated_at = pg_catalog.now()
  WHERE p.id = p_plan_id
  RETURNING p.* INTO v_saved;

  IF (v_new.title, v_new.category, v_new.target_amount, v_new.current_amount, v_new.currency,
      v_new.target_date, v_new.recommended_monthly, v_new.split_partner_a, v_new.split_partner_b,
      v_new.wallet_funding, v_new.status, v_new.assumptions)
    IS DISTINCT FROM
     (v_plan.title, v_plan.category, v_plan.target_amount, v_plan.current_amount, v_plan.currency,
      v_plan.target_date, v_plan.recommended_monthly, v_plan.split_partner_a, v_plan.split_partner_b,
      v_plan.wallet_funding, v_plan.status, v_plan.assumptions) THEN
    PERFORM public.insert_household_activity(
      v_household_id,
      'Goal Adjusted: ' || v_saved.title,
      'Plan',
      v_role,
      'INFO',
      v_saved.target_amount,
      v_saved.currency,
      'Goal details adjusted for "' || v_saved.title || '".'
    );
  END IF;

  IF v_terms IS NOT NULL THEN
    -- A newer proposal replaces any earlier one still waiting.
    UPDATE public.approvals a
    SET status = 'cancelled',
        updated_at = pg_catalog.now()
    WHERE a.id IN (
      SELECT cp.approval_id
      FROM public.plan_change_proposals cp
      WHERE cp.plan_id = p_plan_id AND cp.status = 'pending'
    )
      AND a.status = 'pending';

    INSERT INTO public.approvals (
      household_id, title, amount, currency, wallet,
      requester_id, requester_role, approver_id, approver_role,
      status, reason, category, type, target_id,
      expires_in_hours, expires_at
    ) VALUES (
      v_household_id,
      'Adjust Goal: ' || v_saved.title,
      (v_terms->>'target_amount')::numeric,
      v_terms->>'currency',
      'shared',
      v_user_id,
      COALESCE(v_role, 'partner_a'),
      v_partner_id,
      CASE WHEN v_role = 'partner_a' THEN 'partner_b' ELSE 'partner_a' END,
      'pending',
      'Proposed change to "' || v_saved.title || '": ' || v_summary || '. Requires partner approval.',
      'Plans',
      'GOAL',
      p_plan_id::text,
      48,
      pg_catalog.now() + interval '48 hours'
    )
    RETURNING id INTO v_approval_id;

    INSERT INTO public.plan_change_proposals (
      household_id, plan_id, approval_id, requested_by, changes
    ) VALUES (
      v_household_id, p_plan_id, v_approval_id, v_user_id, v_terms
    );

    PERFORM public.insert_household_activity(
      v_household_id,
      'Goal Change Proposed: ' || v_saved.title,
      'Plans',
      v_role,
      'NEED_APPROVAL',
      (v_terms->>'target_amount')::numeric,
      v_terms->>'currency',
      'Proposed ' || v_summary || '. Awaiting partner approval.'
    );
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'plan', pg_catalog.to_jsonb(v_saved),
    'pending_approval_id', v_approval_id
  );
END;
$$;

-- Runs inside decide_household_approval / cancel_household_approval, which
-- are the only writers of approvals.status.
CREATE OR REPLACE FUNCTION public.apply_plan_change_proposal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_proposal public.plan_change_proposals%ROWTYPE;
  v_changes jsonb;
  v_rows integer;
BEGIN
  SELECT cp.* INTO v_proposal
  FROM public.plan_change_proposals cp
  WHERE cp.approval_id = NEW.id
    AND cp.status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF NEW.status <> 'approved' THEN
    UPDATE public.plan_change_proposals cp
    SET status = CASE WHEN NEW.status IN ('declined', 'cancelled', 'expired') THEN NEW.status ELSE 'cancelled' END,
        updated_at = pg_catalog.now()
    WHERE cp.id = v_proposal.id;
    RETURN NEW;
  END IF;

  v_changes := v_proposal.changes;

  IF COALESCE((v_changes->>'target_amount')::numeric, 1) NOT BETWEEN 0.01 AND 999999999999.99
    OR COALESCE((v_changes->>'recommended_monthly')::numeric, 0) NOT BETWEEN 0 AND 999999999999.99
    OR COALESCE((v_changes->>'split_partner_a')::numeric, 0) NOT BETWEEN 0 AND 100
    OR COALESCE((v_changes->>'split_partner_b')::numeric, 0) NOT BETWEEN 0 AND 100
    OR COALESCE(v_changes->>'currency', 'IDR') !~ '^[A-Z]{3}$' THEN
    UPDATE public.plan_change_proposals cp
    SET status = 'stale',
        updated_at = pg_catalog.now()
    WHERE cp.id = v_proposal.id;
    RETURN NEW;
  END IF;

  UPDATE public.plans p
  SET target_amount = COALESCE((v_changes->>'target_amount')::numeric, p.target_amount),
      currency = COALESCE(v_changes->>'currency', p.currency),
      split_partner_a = COALESCE((v_changes->>'split_partner_a')::numeric, p.split_partner_a),
      split_partner_b = COALESCE((v_changes->>'split_partner_b')::numeric, p.split_partner_b),
      recommended_monthly = COALESCE((v_changes->>'recommended_monthly')::numeric, p.recommended_monthly),
      status = COALESCE(v_changes->>'status', p.status),
      updated_at = pg_catalog.now()
  WHERE p.id = v_proposal.plan_id
    AND p.household_id = v_proposal.household_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  UPDATE public.plan_change_proposals cp
  SET status = CASE WHEN v_rows > 0 THEN 'applied' ELSE 'stale' END,
      updated_at = pg_catalog.now()
  WHERE cp.id = v_proposal.id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS approvals_apply_plan_change ON public.approvals;
CREATE TRIGGER approvals_apply_plan_change
AFTER UPDATE OF status ON public.approvals
FOR EACH ROW
WHEN (NEW.type = 'GOAL' AND OLD.status = 'pending' AND NEW.status <> 'pending')
EXECUTE FUNCTION public.apply_plan_change_proposal();

DROP POLICY IF EXISTS plans_update ON public.plans;
REVOKE UPDATE ON public.plans FROM anon, authenticated;

REVOKE ALL ON FUNCTION public.update_household_plan(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_household_plan(uuid, jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.apply_plan_change_proposal() FROM PUBLIC, anon, authenticated;


-- -----------------------------------------------------------------------------
-- 4. Held purchases: only the requester removes their item
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS held_purchases_delete ON public.held_purchases;
CREATE POLICY held_purchases_delete ON public.held_purchases
  FOR DELETE TO authenticated
  USING (public.is_household_member(household_id) AND requester_id = auth.uid());
