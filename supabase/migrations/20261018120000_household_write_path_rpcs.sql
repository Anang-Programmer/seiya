-- =============================================================================
-- Migration: 20261018120000_household_write_path_rpcs.sql
-- Description: Moves the remaining direct writes on bills, wallets and
--              transactions into SECURITY DEFINER RPCs (authenticated users only
--              hold SELECT on those tables), accumulates the household settlement
--              from executed shared expenses, mirrors pending engine approvals
--              into the unified approvals queue, derives partner roles from
--              household_members.role, and verifies Dual-Key PINs server-side.
--
-- This migration is additive: it adds functions and triggers and replaces
-- request_simulated_transaction. It does not drop tables or alter existing rows.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Internal helpers (not callable through the API)
-- -----------------------------------------------------------------------------

-- owner = partner_a, partner = partner_b. Prefers the active membership row.
CREATE OR REPLACE FUNCTION public.household_role_code(
  p_household_id uuid,
  p_user_id uuid
)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT CASE hm.role WHEN 'owner' THEN 'partner_a' ELSE 'partner_b' END
  FROM public.household_members hm
  WHERE hm.household_id = p_household_id
    AND hm.user_id = p_user_id
  ORDER BY (hm.status = 'active') DESC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.household_partner_user_id(
  p_household_id uuid,
  p_user_id uuid
)
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT hm.user_id
  FROM public.household_members hm
  WHERE hm.household_id = p_household_id
    AND hm.status = 'active'
    AND hm.user_id <> p_user_id
  ORDER BY hm.joined_at, hm.user_id
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.insert_household_activity(
  p_household_id uuid,
  p_title text,
  p_category text,
  p_actor text,
  p_status text,
  p_amount numeric,
  p_currency text,
  p_reason text
)
RETURNS void
LANGUAGE sql
SET search_path = ''
AS $$
  INSERT INTO public.activities (
    household_id, title, category, actor, status, amount, currency, reason
  ) VALUES (
    p_household_id,
    p_title,
    COALESCE(p_category, 'Activity'),
    COALESCE(p_actor, 'seiya'),
    COALESCE(p_status, 'INFO'),
    p_amount,
    p_currency,
    COALESCE(p_reason, '')
  );
$$;

-- Opens the unified-queue approval row for a transaction waiting on the partner.
CREATE OR REPLACE FUNCTION public.open_expense_approval(
  p_transaction_id uuid,
  p_approver_id uuid,
  p_reason text
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_tx public.transactions%ROWTYPE;
  v_wallet public.wallets%ROWTYPE;
  v_requester_role text;
  v_approver_role text;
  v_wallet_label text := 'shared';
  v_approval_id uuid;
BEGIN
  SELECT t.* INTO v_tx FROM public.transactions t WHERE t.id = p_transaction_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaction not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT a.id INTO v_approval_id
  FROM public.approvals a
  WHERE a.household_id = v_tx.household_id
    AND a.type = 'EXPENSE'
    AND a.target_id = p_transaction_id::text
    AND a.status = 'pending'
  LIMIT 1;

  IF v_approval_id IS NOT NULL THEN
    RETURN v_approval_id;
  END IF;

  SELECT w.* INTO v_wallet FROM public.wallets w WHERE w.id = v_tx.wallet_id;
  IF v_wallet.wallet_type = 'personal' THEN
    v_wallet_label := CASE public.household_role_code(v_tx.household_id, v_wallet.owner_user_id)
      WHEN 'partner_b' THEN 'personal_b'
      ELSE 'personal_a'
    END;
  END IF;

  v_requester_role := COALESCE(public.household_role_code(v_tx.household_id, v_tx.created_by), 'partner_a');
  v_approver_role := COALESCE(
    public.household_role_code(v_tx.household_id, p_approver_id),
    CASE v_requester_role WHEN 'partner_a' THEN 'partner_b' ELSE 'partner_a' END
  );

  INSERT INTO public.approvals (
    household_id, title, amount, currency, wallet,
    requester_id, requester_role, approver_id, approver_role,
    status, reason, category, type, target_id,
    expires_in_hours, expires_at
  ) VALUES (
    v_tx.household_id,
    pg_catalog.left('Expense: ' || v_tx.description, 250),
    v_tx.amount,
    v_tx.currency,
    v_wallet_label,
    v_tx.created_by,
    v_requester_role,
    p_approver_id,
    v_approver_role,
    'pending',
    COALESCE(p_reason, ''),
    CASE WHEN v_tx.category = 'bill_payment' THEN 'Bills' ELSE 'Expenses' END,
    'EXPENSE',
    p_transaction_id::text,
    48,
    pg_catalog.now() + interval '48 hours'
  )
  RETURNING id INTO v_approval_id;

  RETURN v_approval_id;
END;
$$;

-- Records an executed expense through the ledger: checks the available balance
-- (balance minus reserved pending expenses), inserts the transaction and
-- deducts the wallet. Callers must already have authorized the action.
CREATE OR REPLACE FUNCTION public.post_executed_expense(
  p_household_id uuid,
  p_wallet_id uuid,
  p_created_by uuid,
  p_category text,
  p_description text,
  p_amount numeric,
  p_currency text,
  p_idempotency_key text
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_wallet public.wallets%ROWTYPE;
  v_available numeric;
  v_tx_id uuid;
  v_now timestamptz := pg_catalog.now();
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount <> pg_catalog.round(p_amount, 2) THEN
    RAISE EXCEPTION 'Amount must be positive and have at most two decimal places'
      USING ERRCODE = '22023';
  END IF;

  SELECT w.* INTO v_wallet
  FROM public.wallets w
  WHERE w.id = p_wallet_id
    AND w.household_id = p_household_id
  FOR UPDATE;

  IF NOT FOUND OR v_wallet.status <> 'active' THEN
    RAISE EXCEPTION 'Wallet not found or not active' USING ERRCODE = 'P0002';
  END IF;

  IF p_currency IS NOT NULL AND p_currency <> v_wallet.currency THEN
    RAISE EXCEPTION 'Currency must match the wallet currency' USING ERRCODE = '22023';
  END IF;

  SELECT v_wallet.simulated_balance - COALESCE(pg_catalog.sum(t.amount), 0)
    INTO v_available
  FROM public.transactions t
  WHERE t.wallet_id = p_wallet_id
    AND t.transaction_type = 'expense'
    AND t.status IN ('pending_approval', 'on_hold');

  IF p_amount > v_available THEN
    RAISE EXCEPTION 'Insufficient available simulated balance' USING ERRCODE = 'P1001';
  END IF;

  INSERT INTO public.transactions (
    household_id, wallet_id, created_by, transaction_type, category,
    description, amount, currency, status, source, requires_approval,
    idempotency_key, metadata, occurred_at, executed_at
  ) VALUES (
    p_household_id,
    p_wallet_id,
    p_created_by,
    'expense',
    NULLIF(pg_catalog.left(pg_catalog.btrim(COALESCE(p_category, '')), 80), ''),
    pg_catalog.left(COALESCE(NULLIF(pg_catalog.btrim(p_description), ''), 'Expense'), 250),
    p_amount,
    v_wallet.currency,
    'executed',
    'user',
    false,
    p_idempotency_key,
    '{}'::jsonb,
    v_now,
    v_now
  )
  RETURNING id INTO v_tx_id;

  UPDATE public.wallets
  SET simulated_balance = simulated_balance - p_amount
  WHERE id = p_wallet_id;

  INSERT INTO public.audit_events (
    household_id, actor_user_id, action, entity_type, entity_id, outcome, details
  ) VALUES (
    p_household_id, auth.uid(), 'transaction.executed', 'transaction', v_tx_id, 'success',
    pg_catalog.jsonb_build_object('amount', p_amount, 'currency', v_wallet.currency)
  );

  RETURN v_tx_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.transaction_json(p_transaction_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT pg_catalog.jsonb_build_object(
    'id', t.id,
    'household_id', t.household_id,
    'wallet_id', t.wallet_id,
    'created_by', t.created_by,
    'transaction_type', t.transaction_type,
    'category', t.category,
    'description', t.description,
    'amount', t.amount,
    'currency', t.currency,
    'status', t.status,
    'requires_approval', t.requires_approval,
    'hold_until', t.hold_until,
    'executed_at', t.executed_at,
    'created_at', t.created_at
  )
  FROM public.transactions t
  WHERE t.id = p_transaction_id;
$$;

REVOKE ALL ON FUNCTION public.household_role_code(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.household_partner_user_id(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.insert_household_activity(uuid, text, text, text, text, numeric, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.open_expense_approval(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.post_executed_expense(uuid, uuid, uuid, text, text, numeric, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.transaction_json(uuid) FROM PUBLIC, anon, authenticated;


-- -----------------------------------------------------------------------------
-- Transaction engine: honour approveEverySharedPurchase and mirror pending
-- approvals into public.approvals (type EXPENSE, target_id = transaction id).
-- Otherwise identical to the version in 20261009183957.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.request_simulated_transaction(
  p_household_id uuid,
  p_wallet_id uuid,
  p_transaction_type text,
  p_category text,
  p_description text,
  p_amount numeric,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_household_status text;
  v_active_members integer;
  v_wallet public.wallets%ROWTYPE;
  v_existing public.transactions%ROWTYPE;
  v_rules jsonb;
  v_wallet_mode text;
  v_approval_flag text;
  v_every_shared_flag text;
  v_approval_threshold_text text;
  v_cooling_flag text;
  v_cooling_threshold_text text;
  v_cooling_hours_text text;
  v_approval_threshold numeric;
  v_cooling_threshold numeric;
  v_cooling_hours integer;
  v_partner_id uuid;
  v_description text;
  v_category text;
  v_available numeric;
  v_requires_approval boolean := false;
  v_hold_until timestamptz := NULL;
  v_status text;
  v_tx_id uuid;
  v_approval_id uuid;
  v_now timestamptz := pg_catalog.now();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF p_transaction_type IS NULL OR p_transaction_type NOT IN ('income', 'expense') THEN
    RAISE EXCEPTION 'Only income and expense are supported in this MVP'
      USING ERRCODE = '22023';
  END IF;

  IF p_amount IS NULL
     OR p_amount <= 0
     OR p_amount > 999999999999.99
     OR p_amount <> pg_catalog.round(p_amount, 2) THEN
    RAISE EXCEPTION 'Amount must be positive and have at most two decimal places'
      USING ERRCODE = '22023';
  END IF;

  v_description := pg_catalog.btrim(COALESCE(p_description, ''));
  v_category := NULLIF(pg_catalog.btrim(COALESCE(p_category, '')), '');

  IF v_description = '' OR pg_catalog.length(v_description) > 250 THEN
    RAISE EXCEPTION 'Description is required and must be at most 250 characters'
      USING ERRCODE = '22023';
  END IF;

  IF v_category IS NOT NULL AND pg_catalog.length(v_category) > 80 THEN
    RAISE EXCEPTION 'Category must be at most 80 characters'
      USING ERRCODE = '22023';
  END IF;

  IF p_idempotency_key IS NULL
     OR pg_catalog.length(p_idempotency_key) < 8
     OR pg_catalog.length(p_idempotency_key) > 128
     OR p_idempotency_key !~ '^[A-Za-z0-9._:-]+$' THEN
    RAISE EXCEPTION 'A valid idempotency key is required'
      USING ERRCODE = '22023';
  END IF;

  -- Serialize money operations per household.
  SELECT h.status
    INTO v_household_status
  FROM public.households h
  WHERE h.id = p_household_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Household not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_household_status <> 'active' THEN
    RAISE EXCEPTION 'Household must be active' USING ERRCODE = '22023';
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

  -- Idempotent retries return the original transaction without another balance change.
  SELECT t.*
    INTO v_existing
  FROM public.transactions t
  WHERE t.created_by = v_user_id
    AND t.idempotency_key = p_idempotency_key;

  IF FOUND THEN
    IF v_existing.household_id IS DISTINCT FROM p_household_id
       OR v_existing.wallet_id IS DISTINCT FROM p_wallet_id
       OR v_existing.transaction_type IS DISTINCT FROM p_transaction_type
       OR v_existing.amount IS DISTINCT FROM p_amount
       OR v_existing.description IS DISTINCT FROM v_description
       OR v_existing.category IS DISTINCT FROM v_category THEN
      RAISE EXCEPTION 'Idempotency key was already used for a different request'
        USING ERRCODE = 'P1003';
    END IF;

    SELECT a.id INTO v_approval_id
    FROM public.approvals a
    WHERE a.household_id = p_household_id
      AND a.type = 'EXPENSE'
      AND a.target_id = v_existing.id::text
    ORDER BY a.created_at DESC
    LIMIT 1;

    RETURN pg_catalog.jsonb_build_object(
      'transaction', public.transaction_json(v_existing.id),
      'approval_id', v_approval_id,
      'idempotent_replay', true
    );
  END IF;

  SELECT pg_catalog.count(*)::integer
    INTO v_active_members
  FROM public.household_members hm
  WHERE hm.household_id = p_household_id
    AND hm.status = 'active';

  IF v_active_members <> 2 THEN
    RAISE EXCEPTION 'Exactly two active household members are required'
      USING ERRCODE = '22023';
  END IF;

  SELECT w.*
    INTO v_wallet
  FROM public.wallets w
  WHERE w.id = p_wallet_id
    AND w.household_id = p_household_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wallet not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_wallet.status <> 'active' THEN
    RAISE EXCEPTION 'Wallet is not active' USING ERRCODE = '22023';
  END IF;

  IF v_wallet.wallet_type = 'personal'
     AND v_wallet.owner_user_id <> v_user_id THEN
    RAISE EXCEPTION 'You cannot use another member''s personal wallet'
      USING ERRCODE = '42501';
  END IF;

  SELECT r.rules
    INTO v_rules
  FROM public.household_finance_rules r
  WHERE r.household_id = p_household_id
    AND r.status = 'active'
  ORDER BY r.version DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'An active finance agreement is required'
      USING ERRCODE = '22023';
  END IF;

  v_wallet_mode := v_rules #>> '{walletMode}';
  v_approval_flag := v_rules #>> '{approval,requirePartnerApprovalAboveThreshold}';
  v_every_shared_flag := COALESCE(v_rules #>> '{approval,approveEverySharedPurchase}', 'false');
  v_approval_threshold_text := v_rules #>> '{approval,sharedWalletThreshold}';
  v_cooling_flag := v_rules #>> '{coolingOff,enabled}';
  v_cooling_threshold_text := v_rules #>> '{coolingOff,threshold}';
  v_cooling_hours_text := v_rules #>> '{coolingOff,durationHours}';

  -- Validate the active rules in SQL; callers must not be able to bypass
  -- application validation by calling an RPC directly.
  IF v_wallet_mode IS NULL
     OR v_wallet_mode NOT IN ('shared_only', 'shared_and_personal', 'separate_only')
     OR v_approval_flag IS NULL
     OR v_approval_flag NOT IN ('true', 'false')
     OR v_every_shared_flag NOT IN ('true', 'false')
     OR v_cooling_flag IS NULL
     OR v_cooling_flag NOT IN ('true', 'false')
     OR v_approval_threshold_text IS NULL
     OR v_approval_threshold_text !~ '^[0-9]+([.][0-9]{1,2})?$'
     OR v_cooling_threshold_text IS NULL
     OR v_cooling_threshold_text !~ '^[0-9]+([.][0-9]{1,2})?$'
     OR v_cooling_hours_text IS NULL
     OR v_cooling_hours_text !~ '^[0-9]{1,2}$' THEN
    RAISE EXCEPTION 'Active finance agreement has invalid transaction settings'
      USING ERRCODE = 'P1002';
  END IF;

  v_approval_threshold := v_approval_threshold_text::numeric;
  v_cooling_threshold := v_cooling_threshold_text::numeric;
  v_cooling_hours := v_cooling_hours_text::integer;

  IF v_cooling_hours < 1 OR v_cooling_hours > 72 THEN
    RAISE EXCEPTION 'Cooling-off duration is invalid' USING ERRCODE = 'P1002';
  END IF;

  IF v_wallet.wallet_type = 'shared' AND v_wallet_mode = 'separate_only' THEN
    RAISE EXCEPTION 'Shared wallets are not enabled by the active agreement'
      USING ERRCODE = '22023';
  END IF;

  IF v_wallet.wallet_type = 'personal' AND v_wallet_mode = 'shared_only' THEN
    RAISE EXCEPTION 'Personal wallets are not enabled by the active agreement'
      USING ERRCODE = '22023';
  END IF;

  -- Pending expenses reserve available balance without deducting it yet.
  -- This prevents multiple pending requests from overcommitting the wallet.
  SELECT v_wallet.simulated_balance - COALESCE(pg_catalog.sum(t.amount), 0)
    INTO v_available
  FROM public.transactions t
  WHERE t.wallet_id = p_wallet_id
    AND t.transaction_type = 'expense'
    AND t.status IN ('pending_approval', 'on_hold');

  IF p_transaction_type = 'expense' AND p_amount > v_available THEN
    RAISE EXCEPTION 'Insufficient available simulated balance'
      USING ERRCODE = 'P1001';
  END IF;

  v_requires_approval :=
    p_transaction_type = 'expense'
    AND v_wallet.wallet_type = 'shared'
    AND (
      (v_approval_flag = 'true' AND p_amount > v_approval_threshold)
      OR v_every_shared_flag = 'true'
    );

  IF p_transaction_type = 'expense'
     AND v_cooling_flag = 'true'
     AND p_amount > v_cooling_threshold THEN
    v_hold_until := v_now + (v_cooling_hours * interval '1 hour');
  END IF;

  IF v_hold_until IS NOT NULL THEN
    v_status := 'on_hold';
  ELSIF v_requires_approval THEN
    v_status := 'pending_approval';
  ELSE
    v_status := 'executed';
  END IF;

  INSERT INTO public.transactions (
    household_id,
    wallet_id,
    created_by,
    transaction_type,
    category,
    description,
    amount,
    currency,
    status,
    source,
    requires_approval,
    idempotency_key,
    metadata,
    occurred_at,
    executed_at,
    hold_until
  )
  VALUES (
    p_household_id,
    p_wallet_id,
    v_user_id,
    p_transaction_type,
    v_category,
    v_description,
    p_amount,
    v_wallet.currency,
    v_status,
    'user',
    v_requires_approval,
    p_idempotency_key,
    '{}'::jsonb,
    v_now,
    CASE WHEN v_status = 'executed' THEN v_now ELSE NULL END,
    v_hold_until
  )
  ON CONFLICT (created_by, idempotency_key)
    WHERE idempotency_key IS NOT NULL
  DO NOTHING
  RETURNING id INTO v_tx_id;

  IF v_tx_id IS NULL THEN
    SELECT t.*
      INTO v_existing
    FROM public.transactions t
    WHERE t.created_by = v_user_id
      AND t.idempotency_key = p_idempotency_key;

    IF NOT FOUND
       OR v_existing.household_id IS DISTINCT FROM p_household_id
       OR v_existing.wallet_id IS DISTINCT FROM p_wallet_id
       OR v_existing.transaction_type IS DISTINCT FROM p_transaction_type
       OR v_existing.amount IS DISTINCT FROM p_amount
       OR v_existing.description IS DISTINCT FROM v_description
       OR v_existing.category IS DISTINCT FROM v_category THEN
      RAISE EXCEPTION 'Idempotency key was already used for a different request'
        USING ERRCODE = 'P1003';
    END IF;

    SELECT a.id INTO v_approval_id
    FROM public.approvals a
    WHERE a.household_id = p_household_id
      AND a.type = 'EXPENSE'
      AND a.target_id = v_existing.id::text
    ORDER BY a.created_at DESC
    LIMIT 1;

    RETURN pg_catalog.jsonb_build_object(
      'transaction', public.transaction_json(v_existing.id),
      'approval_id', v_approval_id,
      'idempotent_replay', true
    );
  END IF;

  IF v_requires_approval THEN
    v_partner_id := public.household_partner_user_id(p_household_id, v_user_id);

    IF v_partner_id IS NULL THEN
      RAISE EXCEPTION 'Partner approver not found' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.transaction_approvals (
      transaction_id,
      approver_user_id,
      decision
    ) VALUES (
      v_tx_id,
      v_partner_id,
      'pending'
    );

    v_approval_id := public.open_expense_approval(
      v_tx_id,
      v_partner_id,
      CASE
        WHEN v_every_shared_flag = 'true'
          THEN 'The couple agreement requires partner approval for every shared purchase.'
        ELSE 'Shared expense exceeds the agreed approval threshold. Partner signature required.'
      END
    );
  END IF;

  IF v_status = 'executed' THEN
    IF p_transaction_type = 'income' THEN
      UPDATE public.wallets
      SET simulated_balance = simulated_balance + p_amount
      WHERE id = p_wallet_id;
    ELSE
      UPDATE public.wallets
      SET simulated_balance = simulated_balance - p_amount
      WHERE id = p_wallet_id;
    END IF;
  END IF;

  INSERT INTO public.audit_events (
    household_id, actor_user_id, action, entity_type,
    entity_id, outcome, details
  ) VALUES (
    p_household_id,
    v_user_id,
    CASE WHEN v_status = 'executed' THEN 'transaction.executed' ELSE 'transaction.requested' END,
    'transaction',
    v_tx_id,
    CASE WHEN v_status = 'executed' THEN 'success' ELSE 'pending' END,
    pg_catalog.jsonb_build_object(
      'transaction_type', p_transaction_type,
      'amount', p_amount,
      'currency', v_wallet.currency,
      'status', v_status,
      'requires_approval', v_requires_approval,
      'hold_until', v_hold_until
    )
  );

  RETURN pg_catalog.jsonb_build_object(
    'transaction', public.transaction_json(v_tx_id),
    'approval_id', v_approval_id,
    'idempotent_replay', false
  );
END;
$$;


-- -----------------------------------------------------------------------------
-- Keep public.approvals in sync with the transaction engine.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_expense_approval_from_decision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tx public.transactions%ROWTYPE;
  v_status text;
  v_updated integer;
  v_title text;
BEGIN
  IF NEW.decision NOT IN ('approved', 'rejected') THEN
    RETURN NEW;
  END IF;

  v_status := CASE NEW.decision WHEN 'approved' THEN 'approved' ELSE 'declined' END;

  SELECT t.* INTO v_tx FROM public.transactions t WHERE t.id = NEW.transaction_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  SELECT a.title INTO v_title
  FROM public.approvals a
  WHERE a.household_id = v_tx.household_id
    AND a.type = 'EXPENSE'
    AND a.target_id = NEW.transaction_id::text
    AND a.status = 'pending'
  ORDER BY a.created_at
  LIMIT 1;

  UPDATE public.approvals a
  SET status = v_status,
      approver_id = NEW.approver_user_id,
      updated_at = pg_catalog.now()
  WHERE a.household_id = v_tx.household_id
    AND a.type = 'EXPENSE'
    AND a.target_id = NEW.transaction_id::text
    AND a.status = 'pending';

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated > 0 THEN
    PERFORM public.insert_household_activity(
      v_tx.household_id,
      v_title || CASE WHEN v_status = 'approved' THEN ' Approved' ELSE ' Declined' END,
      'Expenses',
      public.household_role_code(v_tx.household_id, NEW.approver_user_id),
      CASE WHEN v_status = 'approved' THEN 'ALLOW' ELSE 'DENY' END,
      v_tx.amount,
      v_tx.currency,
      COALESCE(
        NEW.note,
        CASE WHEN v_status = 'approved'
          THEN 'Dual-Key signature verified by partner.'
          ELSE 'Action rejected under mutual veto power.'
        END
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS transaction_approvals_sync_approvals ON public.transaction_approvals;
CREATE TRIGGER transaction_approvals_sync_approvals
AFTER UPDATE OF decision ON public.transaction_approvals
FOR EACH ROW
WHEN (OLD.decision IS DISTINCT FROM NEW.decision)
EXECUTE FUNCTION public.sync_expense_approval_from_decision();

CREATE OR REPLACE FUNCTION public.sync_expense_approval_from_transaction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status IN ('cancelled', 'failed') THEN
    UPDATE public.transaction_approvals ta
    SET decision = 'expired', decided_at = pg_catalog.now()
    WHERE ta.transaction_id = NEW.id
      AND ta.decision = 'pending';

    UPDATE public.approvals a
    SET status = 'cancelled', updated_at = pg_catalog.now()
    WHERE a.household_id = NEW.household_id
      AND a.type = 'EXPENSE'
      AND a.target_id = NEW.id::text
      AND a.status = 'pending';
  ELSIF NEW.status = 'rejected' THEN
    UPDATE public.approvals a
    SET status = 'declined', updated_at = pg_catalog.now()
    WHERE a.household_id = NEW.household_id
      AND a.type = 'EXPENSE'
      AND a.target_id = NEW.id::text
      AND a.status = 'pending';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS transactions_sync_expense_approvals ON public.transactions;
CREATE TRIGGER transactions_sync_expense_approvals
AFTER UPDATE OF status ON public.transactions
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.sync_expense_approval_from_transaction();


-- -----------------------------------------------------------------------------
-- Settlement: every executed shared-wallet expense (and its reversal) moves the
-- household ledger by the other partner's share from the active expenseSplit.
-- The payer is the member who created the transaction. Statement imports
-- (source = 'system') are historical and are not counted.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accumulate_household_settlement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_sign integer := 0;
  v_wallet_type text;
  v_payer_role text;
  v_rules jsonb;
  v_owner_text text;
  v_partner_text text;
  v_owner_pct numeric := 50;
  v_partner_pct numeric := 50;
  v_share numeric;
  v_net numeric;
  v_row public.household_settlements%ROWTYPE;
BEGIN
  IF NEW.transaction_type <> 'expense' OR NEW.source = 'system' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'executed' THEN
      v_sign := 1;
    END IF;
  ELSIF OLD.status IS DISTINCT FROM 'executed' AND NEW.status = 'executed' THEN
    v_sign := 1;
  ELSIF OLD.status = 'executed' AND NEW.status IS DISTINCT FROM 'executed' THEN
    v_sign := -1;
  END IF;

  IF v_sign = 0 THEN
    RETURN NEW;
  END IF;

  SELECT w.wallet_type INTO v_wallet_type FROM public.wallets w WHERE w.id = NEW.wallet_id;
  IF v_wallet_type IS DISTINCT FROM 'shared' THEN
    RETURN NEW;
  END IF;

  v_payer_role := public.household_role_code(NEW.household_id, NEW.created_by);
  IF v_payer_role IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT r.rules INTO v_rules
  FROM public.household_finance_rules r
  WHERE r.household_id = NEW.household_id
    AND r.status = 'active'
  ORDER BY r.version DESC
  LIMIT 1;

  v_owner_text := v_rules #>> '{expenseSplit,ownerPercent}';
  v_partner_text := v_rules #>> '{expenseSplit,partnerPercent}';
  -- Nested IFs: SQL does not guarantee AND short-circuits before the casts.
  IF v_owner_text ~ '^[0-9]{1,3}([.][0-9]+)?$' AND v_partner_text ~ '^[0-9]{1,3}([.][0-9]+)?$' THEN
    IF v_owner_text::numeric + v_partner_text::numeric = 100 THEN
      v_owner_pct := v_owner_text::numeric;
      v_partner_pct := v_partner_text::numeric;
    END IF;
  END IF;

  -- Net position expressed as "partner_b owes partner_a".
  IF v_payer_role = 'partner_a' THEN
    v_share := pg_catalog.round(NEW.amount * v_partner_pct / 100, 2) * v_sign;
  ELSE
    v_share := -pg_catalog.round(NEW.amount * v_owner_pct / 100, 2) * v_sign;
  END IF;

  INSERT INTO public.household_settlements (household_id, currency)
  SELECT h.id, h.base_currency
  FROM public.households h
  WHERE h.id = NEW.household_id
  ON CONFLICT (household_id) DO NOTHING;

  SELECT s.* INTO v_row
  FROM public.household_settlements s
  WHERE s.household_id = NEW.household_id
  FOR UPDATE;

  -- No FX conversion here; foreign-currency expenses are not settled.
  IF NOT FOUND OR v_row.currency <> NEW.currency THEN
    RETURN NEW;
  END IF;

  v_net := v_row.partner_b_owes_a - v_row.partner_a_owes_b + v_share;

  UPDATE public.household_settlements s
  SET partner_b_owes_a = GREATEST(v_net, 0),
      partner_a_owes_b = GREATEST(-v_net, 0),
      updated_at = pg_catalog.now()
  WHERE s.household_id = NEW.household_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS transactions_accumulate_settlement ON public.transactions;
CREATE TRIGGER transactions_accumulate_settlement
AFTER INSERT OR UPDATE OF status ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION public.accumulate_household_settlement();

REVOKE ALL ON FUNCTION public.sync_expense_approval_from_decision() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_expense_approval_from_transaction() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.accumulate_household_settlement() FROM PUBLIC, anon, authenticated;


-- -----------------------------------------------------------------------------
-- Bills: edit, delete, and request partner payment confirmation.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_household_bill(
  p_household_id uuid,
  p_bill_id uuid,
  p_changes jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_bill public.bills%ROWTYPE;
  v_title text;
  v_payee text;
  v_amount numeric;
  v_currency text;
  v_due_date date;
  v_recurrence text;
  v_status text;
  v_notes text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF p_changes IS NULL OR pg_catalog.jsonb_typeof(p_changes) <> 'object' THEN
    RAISE EXCEPTION 'Changes must be an object' USING ERRCODE = '22023';
  END IF;

  IF NOT public.is_household_member(p_household_id) THEN
    RAISE EXCEPTION 'Active household membership required' USING ERRCODE = '42501';
  END IF;

  SELECT b.* INTO v_bill
  FROM public.bills b
  WHERE b.id = p_bill_id AND b.household_id = p_household_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bill not found' USING ERRCODE = 'P0002';
  END IF;

  v_title := v_bill.title;
  v_payee := v_bill.payee;
  v_amount := v_bill.amount;
  v_currency := v_bill.currency;
  v_due_date := v_bill.due_date;
  v_recurrence := v_bill.recurrence;
  v_status := v_bill.status;
  v_notes := v_bill.notes;

  IF p_changes ? 'title' THEN
    v_title := pg_catalog.btrim(COALESCE(p_changes ->> 'title', ''));
    IF v_title = '' OR pg_catalog.length(v_title) > 160 THEN
      RAISE EXCEPTION 'Title must be 1 to 160 characters' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF p_changes ? 'payee' THEN
    v_payee := NULLIF(pg_catalog.btrim(COALESCE(p_changes ->> 'payee', '')), '');
    IF v_payee IS NOT NULL AND pg_catalog.length(v_payee) > 160 THEN
      RAISE EXCEPTION 'Payee is too long' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF p_changes ? 'amount' THEN
    IF pg_catalog.jsonb_typeof(p_changes -> 'amount') <> 'number' THEN
      RAISE EXCEPTION 'Amount must be a number' USING ERRCODE = '22023';
    END IF;
    v_amount := (p_changes ->> 'amount')::numeric;
    IF v_amount <= 0 OR v_amount > 999999999999.99 OR v_amount <> pg_catalog.round(v_amount, 2) THEN
      RAISE EXCEPTION 'Amount must be positive with at most two decimal places' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF p_changes ? 'currency' THEN
    v_currency := pg_catalog.upper(pg_catalog.btrim(COALESCE(p_changes ->> 'currency', '')));
    IF v_currency !~ '^[A-Z]{3}$' THEN
      RAISE EXCEPTION 'Currency must be a three-letter code' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF p_changes ? 'due_date' THEN
    IF COALESCE(p_changes ->> 'due_date', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
      RAISE EXCEPTION 'Due date must use YYYY-MM-DD format' USING ERRCODE = '22023';
    END IF;
    v_due_date := (p_changes ->> 'due_date')::date;
  END IF;

  IF p_changes ? 'recurrence' THEN
    v_recurrence := p_changes ->> 'recurrence';
    IF v_recurrence IS NULL OR v_recurrence NOT IN ('none', 'weekly', 'monthly', 'yearly') THEN
      RAISE EXCEPTION 'Invalid recurrence value' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF p_changes ? 'notes' THEN
    v_notes := NULLIF(pg_catalog.btrim(COALESCE(p_changes ->> 'notes', '')), '');
    IF v_notes IS NOT NULL AND pg_catalog.length(v_notes) > 1000 THEN
      RAISE EXCEPTION 'Notes are too long' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- Paid / pending states are owned by the payment and approval flows. A plain
  -- edit may only move an open bill between upcoming and overdue.
  IF p_changes ? 'status' AND (p_changes ->> 'status') IS DISTINCT FROM v_bill.status THEN
    v_status := p_changes ->> 'status';
    IF v_status IS NULL
       OR v_status NOT IN ('upcoming', 'overdue')
       OR v_bill.status NOT IN ('upcoming', 'overdue') THEN
      RAISE EXCEPTION 'Bill payment status changes must go through the payment or approval flow'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  IF v_bill.status = 'pending_approval'
     AND (v_amount <> v_bill.amount OR v_currency <> v_bill.currency) THEN
    RAISE EXCEPTION 'Amount and currency cannot change while a payment is pending'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.bills b
  SET title = v_title,
      payee = v_payee,
      amount = v_amount,
      currency = v_currency,
      due_date = v_due_date,
      recurrence = v_recurrence,
      status = v_status,
      notes = v_notes
  WHERE b.id = p_bill_id;

  RETURN (SELECT pg_catalog.to_jsonb(b.*) FROM public.bills b WHERE b.id = p_bill_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_household_bill(
  p_household_id uuid,
  p_bill_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_bill public.bills%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_household_member(p_household_id) THEN
    RAISE EXCEPTION 'Active household membership required' USING ERRCODE = '42501';
  END IF;

  SELECT b.* INTO v_bill
  FROM public.bills b
  WHERE b.id = p_bill_id AND b.household_id = p_household_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bill not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_bill.status = 'pending_approval' AND v_bill.paid_transaction_id IS NOT NULL THEN
    RAISE EXCEPTION 'A bill with a pending payment cannot be deleted' USING ERRCODE = '22023';
  END IF;

  UPDATE public.approvals a
  SET status = 'cancelled', updated_at = pg_catalog.now()
  WHERE a.household_id = p_household_id
    AND a.type = 'BILL'
    AND a.target_id = p_bill_id::text
    AND a.status = 'pending';

  DELETE FROM public.bills b WHERE b.id = p_bill_id;

  INSERT INTO public.audit_events (
    household_id, actor_user_id, action, entity_type, entity_id, outcome, details
  ) VALUES (
    p_household_id, v_user_id, 'bill.deleted', 'bill', p_bill_id, 'success',
    pg_catalog.jsonb_build_object('status', v_bill.status)
  );

  PERFORM public.insert_household_activity(
    p_household_id,
    'Bill Deleted: ' || v_bill.title,
    'Bills',
    public.household_role_code(p_household_id, v_user_id),
    'INFO',
    v_bill.amount,
    v_bill.currency,
    'Recurring bill "' || v_bill.title || '" was removed.'
  );

  RETURN pg_catalog.jsonb_build_object(
    'id', v_bill.id,
    'title', v_bill.title,
    'amount', v_bill.amount,
    'currency', v_bill.currency
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.request_household_bill_confirmation(
  p_household_id uuid,
  p_bill_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_bill public.bills%ROWTYPE;
  v_partner_id uuid;
  v_requester_role text;
  v_approval public.approvals%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_household_member(p_household_id) THEN
    RAISE EXCEPTION 'Active household membership required' USING ERRCODE = '42501';
  END IF;

  PERFORM 1 FROM public.households h WHERE h.id = p_household_id FOR UPDATE;

  SELECT b.* INTO v_bill
  FROM public.bills b
  WHERE b.id = p_bill_id AND b.household_id = p_household_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bill not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT a.* INTO v_approval
  FROM public.approvals a
  WHERE a.household_id = p_household_id
    AND a.type = 'BILL'
    AND a.target_id = p_bill_id::text
    AND a.status = 'pending'
  ORDER BY a.created_at DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN pg_catalog.jsonb_build_object(
      'approval', pg_catalog.to_jsonb(v_approval),
      'idempotent_replay', true
    );
  END IF;

  IF v_bill.status NOT IN ('upcoming', 'overdue') OR v_bill.paid_transaction_id IS NOT NULL THEN
    RAISE EXCEPTION 'Bill is not eligible for payment confirmation' USING ERRCODE = '22023';
  END IF;

  v_partner_id := public.household_partner_user_id(p_household_id, v_user_id);
  IF v_partner_id IS NULL THEN
    RAISE EXCEPTION 'Partner approver not found' USING ERRCODE = '22023';
  END IF;

  v_requester_role := public.household_role_code(p_household_id, v_user_id);

  UPDATE public.bills b SET status = 'pending_approval' WHERE b.id = p_bill_id;

  INSERT INTO public.approvals (
    household_id, title, amount, currency, wallet,
    requester_id, requester_role, approver_id, approver_role,
    status, reason, category, type, target_id,
    expires_in_hours, expires_at
  ) VALUES (
    p_household_id,
    v_bill.title || ' - Payment Confirmation',
    v_bill.amount,
    v_bill.currency,
    'shared',
    v_user_id,
    v_requester_role,
    v_partner_id,
    public.household_role_code(p_household_id, v_partner_id),
    'pending',
    'Bill marked as paid. Requires partner confirmation to settle from shared wallet.',
    'Bills',
    'BILL',
    p_bill_id::text,
    24,
    pg_catalog.now() + interval '24 hours'
  )
  RETURNING * INTO v_approval;

  PERFORM public.insert_household_activity(
    p_household_id,
    'Payment Confirmation Requested: ' || v_bill.title,
    'Bills',
    v_requester_role,
    'NEED_APPROVAL',
    v_bill.amount,
    v_bill.currency,
    'Marked as paid. Dispatched to partner for confirmation.'
  );

  RETURN pg_catalog.jsonb_build_object(
    'approval', pg_catalog.to_jsonb(v_approval),
    'idempotent_replay', false
  );
END;
$$;


-- -----------------------------------------------------------------------------
-- Unified approvals queue decision with its side effects.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.decide_household_approval(
  p_approval_id uuid,
  p_decision text,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_household_id uuid;
  v_item public.approvals%ROWTYPE;
  v_target_status text;
  v_target uuid;
  v_reason text;
  v_actor text;
  v_tx public.transactions%ROWTYPE;
  v_bill public.bills%ROWTYPE;
  v_wallet_id uuid;
  v_tx_id uuid;
  v_activity_recorded boolean := false;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF p_decision IS NULL OR p_decision NOT IN ('approved', 'declined') THEN
    RAISE EXCEPTION 'Decision must be approved or declined' USING ERRCODE = '22023';
  END IF;

  v_reason := NULLIF(pg_catalog.btrim(COALESCE(p_reason, '')), '');
  IF v_reason IS NOT NULL AND pg_catalog.length(v_reason) > 500 THEN
    RAISE EXCEPTION 'Reason is too long' USING ERRCODE = '22023';
  END IF;

  SELECT a.household_id INTO v_household_id
  FROM public.approvals a
  WHERE a.id = p_approval_id;

  IF NOT FOUND OR NOT public.is_household_member(v_household_id) THEN
    RAISE EXCEPTION 'Approval request not found' USING ERRCODE = 'P0002';
  END IF;

  -- Serialize money operations per household.
  PERFORM 1 FROM public.households h WHERE h.id = v_household_id FOR UPDATE;

  SELECT a.* INTO v_item
  FROM public.approvals a
  WHERE a.id = p_approval_id
  FOR UPDATE;

  v_target_status := p_decision;

  IF v_item.status <> 'pending' THEN
    IF v_item.status = v_target_status THEN
      RETURN pg_catalog.jsonb_build_object(
        'id', v_item.id,
        'status', v_item.status,
        'idempotent_replay', true
      );
    END IF;
    RAISE EXCEPTION 'This request is already %', v_item.status USING ERRCODE = '22023';
  END IF;

  IF p_decision = 'approved' AND v_item.requester_id = v_user_id THEN
    RAISE EXCEPTION 'A requester cannot approve their own financial request'
      USING ERRCODE = '42501';
  END IF;

  v_actor := public.household_role_code(v_household_id, v_user_id);

  IF v_item.target_id ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
    v_target := v_item.target_id::uuid;
  END IF;

  IF v_item.type = 'EXPENSE' AND v_target IS NOT NULL THEN
    SELECT t.* INTO v_tx
    FROM public.transactions t
    WHERE t.id = v_target AND t.household_id = v_household_id;
  END IF;

  IF v_item.type = 'EXPENSE' AND v_tx.id IS NOT NULL THEN
    -- Expense linked to the ledger: the transaction engine owns the money.
    IF EXISTS (
      SELECT 1 FROM public.transaction_approvals ta
      WHERE ta.transaction_id = v_tx.id
        AND ta.approver_user_id = v_user_id
        AND ta.decision = 'pending'
    ) THEN
      PERFORM public.decide_simulated_transaction(
        v_tx.id,
        CASE p_decision WHEN 'approved' THEN 'approved' ELSE 'rejected' END,
        v_reason
      );
      -- transaction_approvals_sync_approvals updated this row and logged the activity.
      v_activity_recorded := true;
    ELSIF p_decision = 'declined'
      AND v_tx.created_by = v_user_id
      AND v_tx.status IN ('pending_approval', 'on_hold') THEN
      -- The requester withdraws their own pending expense.
      UPDATE public.transactions SET status = 'cancelled' WHERE id = v_tx.id;
    ELSE
      RAISE EXCEPTION 'The linked expense is no longer awaiting your approval'
        USING ERRCODE = '22023';
    END IF;

  ELSIF v_item.type = 'EXPENSE' AND p_decision = 'approved' AND v_item.amount > 0 THEN
    -- Expense without a ledger entry: record it now.
    IF v_item.wallet = 'shared' THEN
      SELECT w.id INTO v_wallet_id
      FROM public.wallets w
      WHERE w.household_id = v_household_id
        AND w.wallet_type = 'shared'
        AND w.status = 'active'
      ORDER BY w.created_at
      LIMIT 1;
    ELSE
      SELECT w.id INTO v_wallet_id
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
    END IF;

    IF v_wallet_id IS NULL THEN
      RAISE EXCEPTION 'Wallet not found' USING ERRCODE = 'P0002';
    END IF;

    v_tx_id := public.post_executed_expense(
      v_household_id, v_wallet_id, v_item.requester_id, 'Expenses',
      v_item.title, v_item.amount, v_item.currency,
      'approval:' || p_approval_id::text
    );

  ELSIF v_item.type = 'BILL' AND v_target IS NOT NULL THEN
    SELECT b.* INTO v_bill
    FROM public.bills b
    WHERE b.id = v_target AND b.household_id = v_household_id
    FOR UPDATE;

    IF p_decision = 'approved' THEN
      IF v_bill.id IS NULL THEN
        RAISE EXCEPTION 'Bill not found' USING ERRCODE = 'P0002';
      END IF;
      IF v_bill.status IN ('paid', 'cancelled') OR v_bill.paid_transaction_id IS NOT NULL THEN
        RAISE EXCEPTION 'Bill is no longer awaiting payment confirmation' USING ERRCODE = '22023';
      END IF;

      SELECT w.id INTO v_wallet_id
      FROM public.wallets w
      WHERE w.household_id = v_household_id
        AND w.wallet_type = 'shared'
        AND w.status = 'active'
      ORDER BY w.created_at
      LIMIT 1;

      IF v_wallet_id IS NULL THEN
        RAISE EXCEPTION 'Shared wallet not found' USING ERRCODE = 'P0002';
      END IF;

      v_tx_id := public.post_executed_expense(
        v_household_id, v_wallet_id, v_item.requester_id, 'bill_payment',
        'Bill payment: ' || v_bill.title, v_bill.amount, v_bill.currency,
        'approval:' || p_approval_id::text
      );

      UPDATE public.bills b
      SET status = 'paid', paid_transaction_id = v_tx_id
      WHERE b.id = v_bill.id;
    ELSIF v_bill.id IS NOT NULL
      AND v_bill.status = 'pending_approval'
      AND v_bill.paid_transaction_id IS NULL THEN
      UPDATE public.bills b
      SET status = CASE WHEN b.due_date < CURRENT_DATE THEN 'overdue' ELSE 'upcoming' END
      WHERE b.id = v_bill.id;
    END IF;

  ELSIF v_item.type = 'PLAN_DELETE' AND p_decision = 'approved' AND v_target IS NOT NULL THEN
    DELETE FROM public.plans p
    WHERE p.id = v_target AND p.household_id = v_household_id;
  END IF;

  UPDATE public.approvals a
  SET status = v_target_status,
      approver_id = v_user_id,
      updated_at = pg_catalog.now()
  WHERE a.id = p_approval_id;

  IF NOT v_activity_recorded THEN
    PERFORM public.insert_household_activity(
      v_household_id,
      v_item.title || CASE WHEN p_decision = 'approved' THEN ' Approved & Executed' ELSE ' Declined' END,
      COALESCE(NULLIF(v_item.category, ''), 'Approval'),
      v_actor,
      CASE WHEN p_decision = 'approved' THEN 'ALLOW' ELSE 'DENY' END,
      v_item.amount,
      v_item.currency,
      CASE WHEN p_decision = 'approved'
        THEN 'Dual-Key signature verified. Action executed.'
        ELSE COALESCE(v_reason, 'Action rejected under mutual veto power.')
      END
    );
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'id', p_approval_id,
    'status', v_target_status,
    'transaction_id', COALESCE(v_tx_id, v_tx.id),
    'idempotent_replay', false
  );
END;
$$;


-- -----------------------------------------------------------------------------
-- Waiting list: continue a held purchase after its cooling-off review.
-- The expense goes through the ledger (executed, or pending partner approval).
-- -----------------------------------------------------------------------------
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


-- -----------------------------------------------------------------------------
-- Undo a transaction within 10 minutes of creating it.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.undo_simulated_transaction(p_transaction_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_household_id uuid;
  v_tx public.transactions%ROWTYPE;
  v_wallet public.wallets%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT t.household_id INTO v_household_id
  FROM public.transactions t
  WHERE t.id = p_transaction_id;

  IF NOT FOUND OR NOT public.is_household_member(v_household_id) THEN
    RAISE EXCEPTION 'Transaction not found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM 1 FROM public.households h WHERE h.id = v_household_id FOR UPDATE;

  SELECT t.* INTO v_tx
  FROM public.transactions t
  WHERE t.id = p_transaction_id
  FOR UPDATE;

  IF v_tx.status = 'cancelled' THEN
    RETURN pg_catalog.jsonb_build_object(
      'id', v_tx.id, 'status', v_tx.status, 'already_cancelled', true
    );
  END IF;

  IF v_tx.created_by <> v_user_id THEN
    RAISE EXCEPTION 'Only the member who created a transaction can undo it'
      USING ERRCODE = '42501';
  END IF;

  IF v_tx.created_at < pg_catalog.now() - interval '10 minutes' THEN
    RAISE EXCEPTION 'Undo window (10 minutes) has elapsed' USING ERRCODE = 'P1007';
  END IF;

  IF v_tx.status NOT IN ('executed', 'pending_approval', 'on_hold', 'approved') THEN
    RAISE EXCEPTION 'This transaction can no longer be undone' USING ERRCODE = '22023';
  END IF;

  IF v_tx.status = 'executed' THEN
    SELECT w.* INTO v_wallet
    FROM public.wallets w
    WHERE w.id = v_tx.wallet_id
    FOR UPDATE;

    IF v_tx.transaction_type = 'income' THEN
      IF v_wallet.simulated_balance < v_tx.amount THEN
        RAISE EXCEPTION 'This income has already been spent and cannot be undone'
          USING ERRCODE = 'P1001';
      END IF;
      UPDATE public.wallets
      SET simulated_balance = simulated_balance - v_tx.amount
      WHERE id = v_tx.wallet_id;
    ELSIF v_tx.transaction_type = 'expense' THEN
      UPDATE public.wallets
      SET simulated_balance = simulated_balance + v_tx.amount
      WHERE id = v_tx.wallet_id;
    END IF;
  END IF;

  -- Triggers expire pending approvals, cancel the queued approval, release a
  -- pending bill and reverse the settlement share.
  UPDATE public.transactions SET status = 'cancelled' WHERE id = p_transaction_id;

  UPDATE public.bills b
  SET status = CASE WHEN b.due_date < CURRENT_DATE THEN 'overdue' ELSE 'upcoming' END,
      paid_transaction_id = NULL
  WHERE b.paid_transaction_id = p_transaction_id
    AND b.status IN ('paid', 'pending_approval');

  INSERT INTO public.audit_events (
    household_id, actor_user_id, action, entity_type, entity_id, outcome, details
  ) VALUES (
    v_household_id, v_user_id, 'transaction.undone', 'transaction', p_transaction_id, 'success',
    pg_catalog.jsonb_build_object('previous_status', v_tx.status, 'amount', v_tx.amount, 'currency', v_tx.currency)
  );

  PERFORM public.insert_household_activity(
    v_household_id,
    'Undo: ' || COALESCE(NULLIF(v_tx.description, ''), 'Transaction'),
    'Undo',
    public.household_role_code(v_household_id, v_user_id),
    'INFO',
    v_tx.amount,
    v_tx.currency,
    'Eligible transaction entry reverted within 10-minute undo window.'
  );

  RETURN pg_catalog.jsonb_build_object(
    'id', p_transaction_id, 'status', 'cancelled', 'already_cancelled', false
  );
END;
$$;


-- -----------------------------------------------------------------------------
-- Dual-Key plan deletion: verifies both partners' PINs against user_pins.
-- Hash format matches src/backend/services/pin.service.ts:
--   sha256_hex("<user_id>:<pin>:seiya-dual-key-salt")
-- Five failed attempts within 15 minutes lock the caller out for that window.
-- Failures return ok=false (instead of raising) so the attempt is recorded.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dual_key_delete_household_plan(
  p_household_id uuid,
  p_plan_id uuid,
  p_partner_a_pin text,
  p_partner_b_pin text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_owner_id uuid;
  v_partner_id uuid;
  v_owner_hash text;
  v_partner_hash text;
  v_failures integer;
  v_plan public.plans%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_household_member(p_household_id) THEN
    RAISE EXCEPTION 'Active household membership required' USING ERRCODE = '42501';
  END IF;

  SELECT pg_catalog.count(*)::integer INTO v_failures
  FROM public.audit_events e
  WHERE e.actor_user_id = v_user_id
    AND e.action = 'plan.dual_key_failed'
    AND e.created_at > pg_catalog.now() - interval '15 minutes';

  IF v_failures >= 5 THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'locked');
  END IF;

  SELECT p.* INTO v_plan
  FROM public.plans p
  WHERE p.id = p_plan_id AND p.household_id = p_household_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Goal not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT hm.user_id INTO v_owner_id
  FROM public.household_members hm
  WHERE hm.household_id = p_household_id AND hm.role = 'owner' AND hm.status = 'active'
  LIMIT 1;

  SELECT hm.user_id INTO v_partner_id
  FROM public.household_members hm
  WHERE hm.household_id = p_household_id AND hm.role = 'partner' AND hm.status = 'active'
  ORDER BY hm.joined_at
  LIMIT 1;

  IF v_owner_id IS NULL OR v_partner_id IS NULL THEN
    RAISE EXCEPTION 'Both partners must be active household members' USING ERRCODE = '22023';
  END IF;

  SELECT up.pin_hash INTO v_owner_hash FROM public.user_pins up WHERE up.user_id = v_owner_id;
  SELECT up.pin_hash INTO v_partner_hash FROM public.user_pins up WHERE up.user_id = v_partner_id;

  IF COALESCE(p_partner_a_pin, '') !~ '^[0-9]{6}$'
     OR COALESCE(p_partner_b_pin, '') !~ '^[0-9]{6}$'
     OR v_owner_hash IS NULL
     OR v_partner_hash IS NULL
     OR v_owner_hash <> pg_catalog.encode(
          pg_catalog.sha256(pg_catalog.convert_to(
            v_owner_id::text || ':' || p_partner_a_pin || ':seiya-dual-key-salt', 'UTF8')),
          'hex')
     OR v_partner_hash <> pg_catalog.encode(
          pg_catalog.sha256(pg_catalog.convert_to(
            v_partner_id::text || ':' || p_partner_b_pin || ':seiya-dual-key-salt', 'UTF8')),
          'hex') THEN
    INSERT INTO public.audit_events (
      household_id, actor_user_id, action, entity_type, entity_id, outcome, details
    ) VALUES (
      p_household_id, v_user_id, 'plan.dual_key_failed', 'plan', p_plan_id, 'denied', '{}'::jsonb
    );
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'invalid_pin');
  END IF;

  DELETE FROM public.plans p WHERE p.id = p_plan_id;

  UPDATE public.approvals a
  SET status = 'cancelled', updated_at = pg_catalog.now()
  WHERE a.household_id = p_household_id
    AND a.type = 'PLAN_DELETE'
    AND a.target_id = p_plan_id::text
    AND a.status = 'pending';

  INSERT INTO public.audit_events (
    household_id, actor_user_id, action, entity_type, entity_id, outcome, details
  ) VALUES (
    p_household_id, v_user_id, 'plan.deleted', 'plan', p_plan_id, 'success',
    pg_catalog.jsonb_build_object('dual_key', true)
  );

  PERFORM public.insert_household_activity(
    p_household_id,
    'Goal Dissolved: ' || v_plan.title,
    'Plans',
    public.household_role_code(p_household_id, v_user_id),
    'ALLOW',
    v_plan.target_amount,
    v_plan.currency,
    'Both partners entered their cryptographic PINs to confirm goal dissolution.'
  );

  RETURN pg_catalog.jsonb_build_object(
    'ok', true,
    'plan', pg_catalog.jsonb_build_object('id', v_plan.id, 'title', v_plan.title)
  );
END;
$$;


-- -----------------------------------------------------------------------------
-- API permissions
-- -----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.update_household_bill(uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_household_bill(uuid, uuid, jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.delete_household_bill(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_household_bill(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.request_household_bill_confirmation(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_household_bill_confirmation(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.decide_household_approval(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decide_household_approval(uuid, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.continue_held_purchase(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.continue_held_purchase(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.undo_simulated_transaction(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.undo_simulated_transaction(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.dual_key_delete_household_plan(uuid, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dual_key_delete_household_plan(uuid, uuid, text, text) TO authenticated;
