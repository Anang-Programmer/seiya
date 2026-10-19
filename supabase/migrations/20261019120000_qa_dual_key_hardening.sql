-- Seiya QA hardening (2026-10-19).
--
-- 1. Shared goals can no longer be deleted by one partner.
--
-- The plans_delete policy let any household member DELETE a goal directly
-- through PostgREST, which skipped the Dual-Key rule. Goals are now removed
-- only by the SECURITY DEFINER functions that check both partners:
--   * dual_key_delete_household_plan (both PINs, in person)
--   * decide_household_approval      (partner approves a PLAN_DELETE request)

DROP POLICY IF EXISTS plans_delete ON public.plans;
REVOKE DELETE ON public.plans FROM authenticated, anon;

-- 2. A held purchase can only be continued after its cooling-off period ends.
--    Same function as in 20261018120000_household_write_path_rpcs.sql plus the
--    hold_until check after the requester check.

CREATE OR REPLACE FUNCTION public.continue_held_purchase(p_held_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_household_id uuid;
  v_household_status text;
  v_item public.held_purchases%ROWTYPE;
  v_wallet public.wallets%ROWTYPE;
  v_rules jsonb;
  v_approval_flag text;
  v_every_shared_flag text;
  v_threshold_text text;
  v_needs_approval boolean := false;
  v_available numeric;
  v_partner_id uuid;
  v_tx_id uuid;
  v_approval_id uuid;
  v_actor text;
  v_now timestamptz := pg_catalog.now();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT hp.household_id INTO v_household_id
  FROM public.held_purchases hp
  WHERE hp.id = p_held_id;

  IF NOT FOUND OR NOT public.is_household_member(v_household_id) THEN
    RAISE EXCEPTION 'Held purchase not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT h.status INTO v_household_status
  FROM public.households h
  WHERE h.id = v_household_id
  FOR UPDATE;

  IF v_household_status <> 'active' THEN
    RAISE EXCEPTION 'Household must be active' USING ERRCODE = '22023';
  END IF;

  SELECT hp.* INTO v_item
  FROM public.held_purchases hp
  WHERE hp.id = p_held_id
  FOR UPDATE;

  IF v_item.status <> 'held' THEN
    RAISE EXCEPTION 'This purchase is no longer on hold' USING ERRCODE = '22023';
  END IF;

  IF v_item.requester_id <> v_user_id THEN
    RAISE EXCEPTION 'Only the member who requested this purchase can continue it'
      USING ERRCODE = '42501';
  END IF;

  -- The cooling-off safeguard only means something if it cannot be skipped.
  IF v_item.hold_until > v_now THEN
    RAISE EXCEPTION 'The cooling-off period has not ended yet'
      USING ERRCODE = '22023';
  END IF;

  v_actor := public.household_role_code(v_household_id, v_user_id);

  UPDATE public.held_purchases hp
  SET status = 'released', updated_at = v_now
  WHERE hp.id = p_held_id;

  IF v_item.amount <= 0 THEN
    RETURN pg_catalog.jsonb_build_object(
      'outcome', 'ALLOW', 'transaction', NULL, 'approval', NULL
    );
  END IF;

  IF v_item.wallet = 'shared' THEN
    SELECT w.* INTO v_wallet
    FROM public.wallets w
    WHERE w.household_id = v_household_id
      AND w.wallet_type = 'shared'
      AND w.status = 'active'
    ORDER BY w.created_at
    LIMIT 1;
  ELSE
    SELECT w.* INTO v_wallet
    FROM public.wallets w
    JOIN public.household_members hm
      ON hm.household_id = w.household_id
     AND hm.user_id = w.owner_user_id
     AND hm.status = 'active'
    WHERE w.household_id = v_household_id
      AND w.wallet_type = 'personal'
      AND w.status = 'active'
      AND hm.role = CASE v_item.wallet WHEN 'personal_a' THEN 'owner' ELSE 'partner' END
    ORDER BY w.created_at
    LIMIT 1;

    IF FOUND AND v_wallet.owner_user_id <> v_user_id THEN
      RAISE EXCEPTION 'You cannot use another member''s personal wallet'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF v_wallet.id IS NULL THEN
    RAISE EXCEPTION 'Wallet not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_wallet.wallet_type = 'shared' THEN
    SELECT r.rules INTO v_rules
    FROM public.household_finance_rules r
    WHERE r.household_id = v_household_id
      AND r.status = 'active'
    ORDER BY r.version DESC
    LIMIT 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'An active finance agreement is required' USING ERRCODE = '22023';
    END IF;

    v_approval_flag := v_rules #>> '{approval,requirePartnerApprovalAboveThreshold}';
    v_every_shared_flag := COALESCE(v_rules #>> '{approval,approveEverySharedPurchase}', 'false');
    v_threshold_text := v_rules #>> '{approval,sharedWalletThreshold}';

    IF v_approval_flag IS NULL
       OR v_approval_flag NOT IN ('true', 'false')
       OR v_every_shared_flag NOT IN ('true', 'false')
       OR v_threshold_text IS NULL
       OR v_threshold_text !~ '^[0-9]+([.][0-9]{1,2})?$' THEN
      RAISE EXCEPTION 'Active finance agreement has invalid transaction settings'
        USING ERRCODE = 'P1002';
    END IF;

    v_needs_approval :=
      (v_approval_flag = 'true' AND v_item.amount > v_threshold_text::numeric)
      OR v_every_shared_flag = 'true';
  END IF;

  IF v_needs_approval THEN
    PERFORM 1 FROM public.wallets w WHERE w.id = v_wallet.id FOR UPDATE;

    IF v_item.currency <> v_wallet.currency THEN
      RAISE EXCEPTION 'Currency must match the wallet currency' USING ERRCODE = '22023';
    END IF;

    SELECT v_wallet.simulated_balance - COALESCE(pg_catalog.sum(t.amount), 0)
      INTO v_available
    FROM public.transactions t
    WHERE t.wallet_id = v_wallet.id
      AND t.transaction_type = 'expense'
      AND t.status IN ('pending_approval', 'on_hold');

    IF v_item.amount > v_available THEN
      RAISE EXCEPTION 'Insufficient available simulated balance' USING ERRCODE = 'P1001';
    END IF;

    v_partner_id := public.household_partner_user_id(v_household_id, v_user_id);
    IF v_partner_id IS NULL THEN
      RAISE EXCEPTION 'Partner approver not found' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.transactions (
      household_id, wallet_id, created_by, transaction_type, category,
      description, amount, currency, status, source, requires_approval,
      idempotency_key, metadata, occurred_at
    ) VALUES (
      v_household_id, v_wallet.id, v_user_id, 'expense', 'Shopping',
      pg_catalog.left(v_item.title, 250), v_item.amount, v_wallet.currency,
      'pending_approval', 'user', true,
      'held:' || p_held_id::text, '{}'::jsonb, v_now
    )
    RETURNING id INTO v_tx_id;

    INSERT INTO public.transaction_approvals (transaction_id, approver_user_id, decision)
    VALUES (v_tx_id, v_partner_id, 'pending');

    v_approval_id := public.open_expense_approval(
      v_tx_id,
      v_partner_id,
      'User confirmed held item; secondary gateway check routed to partner approval.'
    );

    PERFORM public.insert_household_activity(
      v_household_id,
      'Approval Dispatched: ' || v_item.title,
      'Safeguard',
      v_actor,
      'NEED_APPROVAL',
      v_item.amount,
      v_item.currency,
      'Held purchase confirmed by user and forwarded for partner consent.'
    );

    RETURN pg_catalog.jsonb_build_object(
      'outcome', 'NEED_APPROVAL',
      'transaction', public.transaction_json(v_tx_id),
      'approval', (SELECT pg_catalog.to_jsonb(a.*) FROM public.approvals a WHERE a.id = v_approval_id)
    );
  END IF;

  v_tx_id := public.post_executed_expense(
    v_household_id, v_wallet.id, v_user_id, 'Shopping',
    v_item.title, v_item.amount, v_item.currency,
    'held:' || p_held_id::text
  );

  PERFORM public.insert_household_activity(
    v_household_id,
    v_item.title || ' Confirmed after Cooldown',
    'Safeguard',
    v_actor,
    'ALLOW',
    v_item.amount,
    v_item.currency,
    'Secondary confirmation verified through cooling-off gateway.'
  );

  RETURN pg_catalog.jsonb_build_object(
    'outcome', 'ALLOW',
    'transaction', public.transaction_json(v_tx_id),
    'approval', NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.continue_held_purchase(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.continue_held_purchase(uuid) TO authenticated;

-- 3. Approval rows change only through the decision/cancel functions.
--    The approvals_update policy let any member set status = 'approved' on
--    their own request directly through PostgREST.

DROP POLICY IF EXISTS approvals_update ON public.approvals;
REVOKE UPDATE ON public.approvals FROM authenticated, anon;

DROP POLICY IF EXISTS approvals_insert ON public.approvals;
CREATE POLICY approvals_insert ON public.approvals
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_household_member(household_id)
    AND requester_id = auth.uid()
    AND status = 'pending'
  );

-- 4. The requester can withdraw a pending request before the partner decides.
--    A linked expense is cancelled through undo_simulated_transaction, whose
--    triggers also cancel the approval row and release the reserved amount.

CREATE OR REPLACE FUNCTION public.cancel_household_approval(p_approval_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_household_id uuid;
  v_item public.approvals%ROWTYPE;
  v_target uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT a.household_id INTO v_household_id
  FROM public.approvals a
  WHERE a.id = p_approval_id;

  IF NOT FOUND OR NOT public.is_household_member(v_household_id) THEN
    RAISE EXCEPTION 'Approval request not found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM 1 FROM public.households h WHERE h.id = v_household_id FOR UPDATE;

  SELECT a.* INTO v_item
  FROM public.approvals a
  WHERE a.id = p_approval_id
  FOR UPDATE;

  IF v_item.status = 'cancelled' THEN
    RETURN pg_catalog.jsonb_build_object('id', v_item.id, 'status', 'cancelled', 'idempotent_replay', true);
  END IF;

  IF v_item.status <> 'pending' THEN
    RAISE EXCEPTION 'This request is already %', v_item.status USING ERRCODE = '22023';
  END IF;

  IF v_item.requester_id <> v_user_id THEN
    RAISE EXCEPTION 'Only the member who made this request can cancel it' USING ERRCODE = '42501';
  END IF;

  IF v_item.target_id ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
    v_target := v_item.target_id::uuid;
  END IF;

  IF v_item.type = 'EXPENSE' AND v_target IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.transactions t
    WHERE t.id = v_target AND t.household_id = v_household_id
      AND t.status IN ('pending_approval', 'on_hold')
  ) THEN
    PERFORM public.undo_simulated_transaction(v_target);
  END IF;

  IF v_item.type = 'BILL' AND v_target IS NOT NULL THEN
    UPDATE public.bills b
    SET status = CASE WHEN b.due_date < CURRENT_DATE THEN 'overdue' ELSE 'upcoming' END
    WHERE b.id = v_target
      AND b.household_id = v_household_id
      AND b.status = 'pending_approval'
      AND b.paid_transaction_id IS NULL;
  END IF;

  UPDATE public.approvals a
  SET status = 'cancelled', updated_at = pg_catalog.now()
  WHERE a.id = p_approval_id AND a.status = 'pending';

  PERFORM public.insert_household_activity(
    v_household_id,
    v_item.title || ' Cancelled',
    COALESCE(NULLIF(v_item.category, ''), 'Approval'),
    public.household_role_code(v_household_id, v_user_id),
    'INFO',
    v_item.amount,
    v_item.currency,
    'Request withdrawn by the requester before a decision.'
  );

  RETURN pg_catalog.jsonb_build_object('id', p_approval_id, 'status', 'cancelled', 'idempotent_replay', false);
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_household_approval(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_household_approval(uuid) TO authenticated;
