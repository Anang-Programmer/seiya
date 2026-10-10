-- Seiya simulated transaction engine
-- Adds atomic, server-side transaction request / approval / hold execution.
-- This migration is additive: it adds one column, an index, and RPC functions.
-- It does not drop tables or delete existing records.

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS hold_until timestamptz;

CREATE INDEX IF NOT EXISTS transactions_wallet_reservations_idx
  ON public.transactions (wallet_id, status)
  WHERE transaction_type = 'expense'
    AND status IN ('pending_approval', 'on_hold');


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
  v_tx public.transactions%ROWTYPE;
  v_rules jsonb;
  v_wallet_mode text;
  v_approval_flag text;
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
  v_now timestamptz := pg_catalog.now();
  v_result jsonb;
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

    RETURN pg_catalog.jsonb_build_object(
      'transaction', pg_catalog.jsonb_build_object(
        'id', v_existing.id,
        'household_id', v_existing.household_id,
        'wallet_id', v_existing.wallet_id,
        'transaction_type', v_existing.transaction_type,
        'category', v_existing.category,
        'description', v_existing.description,
        'amount', v_existing.amount,
        'currency', v_existing.currency,
        'status', v_existing.status,
        'requires_approval', v_existing.requires_approval,
        'hold_until', v_existing.hold_until,
        'executed_at', v_existing.executed_at,
        'created_at', v_existing.created_at
      ),
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
    AND v_approval_flag = 'true'
    AND p_amount > v_approval_threshold;

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

    RETURN pg_catalog.jsonb_build_object(
      'transaction', pg_catalog.jsonb_build_object(
        'id', v_existing.id,
        'household_id', v_existing.household_id,
        'wallet_id', v_existing.wallet_id,
        'transaction_type', v_existing.transaction_type,
        'category', v_existing.category,
        'description', v_existing.description,
        'amount', v_existing.amount,
        'currency', v_existing.currency,
        'status', v_existing.status,
        'requires_approval', v_existing.requires_approval,
        'hold_until', v_existing.hold_until,
        'executed_at', v_existing.executed_at,
        'created_at', v_existing.created_at
      ),
      'idempotent_replay', true
    );
  END IF;

  IF v_requires_approval THEN
    SELECT hm.user_id
      INTO v_partner_id
    FROM public.household_members hm
    WHERE hm.household_id = p_household_id
      AND hm.status = 'active'
      AND hm.user_id <> v_user_id
    ORDER BY hm.joined_at, hm.user_id
    LIMIT 1;

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

  SELECT t.* INTO v_tx
  FROM public.transactions t
  WHERE t.id = v_tx_id;

  RETURN pg_catalog.jsonb_build_object(
    'transaction', pg_catalog.jsonb_build_object(
      'id', v_tx.id,
      'household_id', v_tx.household_id,
      'wallet_id', v_tx.wallet_id,
      'created_by', v_tx.created_by,
      'transaction_type', v_tx.transaction_type,
      'category', v_tx.category,
      'description', v_tx.description,
      'amount', v_tx.amount,
      'currency', v_tx.currency,
      'status', v_tx.status,
      'requires_approval', v_tx.requires_approval,
      'hold_until', v_tx.hold_until,
      'executed_at', v_tx.executed_at,
      'created_at', v_tx.created_at
    ),
    'idempotent_replay', false
  );
END;
$$;


CREATE OR REPLACE FUNCTION public.decide_simulated_transaction(
  p_transaction_id uuid,
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
  v_tx public.transactions%ROWTYPE;
  v_wallet public.wallets%ROWTYPE;
  v_available numeric;
  v_result jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF p_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Decision must be approved or rejected'
      USING ERRCODE = '22023';
  END IF;

  IF p_note IS NOT NULL AND pg_catalog.length(p_note) > 500 THEN
    RAISE EXCEPTION 'Note is too long' USING ERRCODE = '22023';
  END IF;

  SELECT t.household_id INTO v_household_id
  FROM public.transactions t
  WHERE t.id = p_transaction_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaction not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT h.status INTO v_household_status
  FROM public.households h
  WHERE h.id = v_household_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Household not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_household_status <> 'active' THEN
    RAISE EXCEPTION 'Household must be active' USING ERRCODE = '22023';
  END IF;

  SELECT t.* INTO v_tx
  FROM public.transactions t
  WHERE t.id = p_transaction_id
  FOR UPDATE;

  IF v_tx.status NOT IN ('pending_approval', 'on_hold')
     OR v_tx.requires_approval IS NOT TRUE THEN
    RAISE EXCEPTION 'Transaction does not require a pending approval'
      USING ERRCODE = '22023';
  END IF;

  IF v_tx.created_by = v_user_id THEN
    RAISE EXCEPTION 'The requester cannot approve their own transaction'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.household_members hm
    WHERE hm.household_id = v_household_id
      AND hm.user_id = v_user_id
      AND hm.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Active household membership required'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.transaction_approvals a
  SET
    decision = p_decision,
    decided_at = pg_catalog.now(),
    note = NULLIF(pg_catalog.btrim(COALESCE(p_note, '')), '')
  WHERE a.transaction_id = p_transaction_id
    AND a.approver_user_id = v_user_id
    AND a.decision = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No pending approval exists for this user'
      USING ERRCODE = '23505';
  END IF;

  IF p_decision = 'rejected' THEN
    UPDATE public.transactions
    SET status = 'rejected'
    WHERE id = p_transaction_id;

    INSERT INTO public.audit_events (
      household_id, actor_user_id, action, entity_type,
      entity_id, outcome, details
    ) VALUES (
      v_household_id, v_user_id, 'transaction.rejected',
      'transaction', p_transaction_id, 'denied',
      pg_catalog.jsonb_build_object('note', p_note)
    );
  ELSE
    -- Leave the transaction on hold until its cooling-off period expires.
    IF v_tx.hold_until IS NOT NULL AND v_tx.hold_until > pg_catalog.now() THEN
      INSERT INTO public.audit_events (
        household_id, actor_user_id, action, entity_type,
        entity_id, outcome, details
      ) VALUES (
        v_household_id, v_user_id, 'transaction.approved',
        'transaction', p_transaction_id, 'pending',
        pg_catalog.jsonb_build_object('hold_until', v_tx.hold_until)
      );
    ELSE
      IF EXISTS (
        SELECT 1 FROM public.transaction_approvals a
        WHERE a.transaction_id = p_transaction_id
          AND a.decision <> 'approved'
      ) THEN
        RAISE EXCEPTION 'All required approvals must be approved'
          USING ERRCODE = '22023';
      END IF;

      SELECT w.* INTO v_wallet
      FROM public.wallets w
      WHERE w.id = v_tx.wallet_id
      FOR UPDATE;

      IF NOT FOUND OR v_wallet.status <> 'active' THEN
        UPDATE public.transactions
        SET status = 'failed'
        WHERE id = p_transaction_id;

        INSERT INTO public.audit_events (
          household_id, actor_user_id, action, entity_type,
          entity_id, outcome, details
        ) VALUES (
          v_household_id, v_user_id, 'transaction.execution_failed',
          'transaction', p_transaction_id, 'failed',
          pg_catalog.jsonb_build_object('reason', 'Wallet unavailable')
        );
      ELSIF v_tx.transaction_type = 'expense'
        AND v_wallet.simulated_balance < v_tx.amount THEN
        UPDATE public.transactions
        SET status = 'failed'
        WHERE id = p_transaction_id;

        INSERT INTO public.audit_events (
          household_id, actor_user_id, action, entity_type,
          entity_id, outcome, details
        ) VALUES (
          v_household_id, v_user_id, 'transaction.execution_failed',
          'transaction', p_transaction_id, 'failed',
          pg_catalog.jsonb_build_object('reason', 'Insufficient balance at execution')
        );
      ELSE
        UPDATE public.wallets
        SET simulated_balance = simulated_balance - v_tx.amount
        WHERE id = v_tx.wallet_id;

        UPDATE public.transactions
        SET status = 'executed', executed_at = pg_catalog.now()
        WHERE id = p_transaction_id;

        INSERT INTO public.audit_events (
          household_id, actor_user_id, action, entity_type,
          entity_id, outcome, details
        ) VALUES (
          v_household_id, v_user_id, 'transaction.executed',
          'transaction', p_transaction_id, 'success',
          pg_catalog.jsonb_build_object('amount', v_tx.amount, 'currency', v_tx.currency)
        );
      END IF;
    END IF;
  END IF;

  SELECT pg_catalog.jsonb_build_object(
    'id', t.id,
    'household_id', t.household_id,
    'wallet_id', t.wallet_id,
    'transaction_type', t.transaction_type,
    'category', t.category,
    'description', t.description,
    'amount', t.amount,
    'currency', t.currency,
    'status', t.status,
    'requires_approval', t.requires_approval,
    'hold_until', t.hold_until,
    'executed_at', t.executed_at
  ) INTO v_result
  FROM public.transactions t
  WHERE t.id = p_transaction_id;

  RETURN v_result;
END;
$$;


CREATE OR REPLACE FUNCTION public.execute_held_simulated_transaction(
  p_transaction_id uuid
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
  v_tx public.transactions%ROWTYPE;
  v_wallet public.wallets%ROWTYPE;
  v_result jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT t.household_id INTO v_household_id
  FROM public.transactions t
  WHERE t.id = p_transaction_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaction not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT h.status INTO v_household_status
  FROM public.households h
  WHERE h.id = v_household_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Household not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_household_status <> 'active' THEN
    RAISE EXCEPTION 'Household must be active' USING ERRCODE = '22023';
  END IF;

  SELECT t.* INTO v_tx
  FROM public.transactions t
  WHERE t.id = p_transaction_id
  FOR UPDATE;

  IF NOT EXISTS (
    SELECT 1 FROM public.household_members hm
    WHERE hm.household_id = v_household_id
      AND hm.user_id = v_user_id
      AND hm.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Active household membership required'
      USING ERRCODE = '42501';
  END IF;

  SELECT w.* INTO v_wallet
  FROM public.wallets w
  WHERE w.id = v_tx.wallet_id
  FOR UPDATE;

  IF NOT FOUND OR v_wallet.status <> 'active' THEN
    RAISE EXCEPTION 'Wallet is unavailable' USING ERRCODE = '22023';
  END IF;

  IF v_wallet.wallet_type = 'personal'
     AND v_wallet.owner_user_id <> v_user_id THEN
    RAISE EXCEPTION 'You cannot execute another member''s personal wallet transaction'
      USING ERRCODE = '42501';
  END IF;

  IF v_tx.status = 'executed' THEN
    RETURN pg_catalog.jsonb_build_object(
      'transaction_id', v_tx.id,
      'status', v_tx.status,
      'already_executed', true
    );
  END IF;

  IF v_tx.status <> 'on_hold' THEN
    RAISE EXCEPTION 'Transaction is not on hold'
      USING ERRCODE = '22023';
  END IF;

  IF v_tx.hold_until IS NULL OR v_tx.hold_until > pg_catalog.now() THEN
    RAISE EXCEPTION 'Cooling-off period has not elapsed'
      USING ERRCODE = 'P1004';
  END IF;

  IF v_tx.requires_approval THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.transaction_approvals a
      WHERE a.transaction_id = p_transaction_id
        AND a.decision = 'approved'
    ) OR EXISTS (
      SELECT 1 FROM public.transaction_approvals a
      WHERE a.transaction_id = p_transaction_id
        AND a.decision <> 'approved'
    ) THEN
      RAISE EXCEPTION 'Partner approval is still required'
        USING ERRCODE = 'P1005';
    END IF;
  END IF;

  IF v_wallet.simulated_balance < v_tx.amount THEN
    UPDATE public.transactions SET status = 'failed' WHERE id = p_transaction_id;

    INSERT INTO public.audit_events (
      household_id, actor_user_id, action, entity_type,
      entity_id, outcome, details
    ) VALUES (
      v_household_id, v_user_id, 'transaction.execution_failed',
      'transaction', p_transaction_id, 'failed',
      pg_catalog.jsonb_build_object('reason', 'Insufficient balance at execution')
    );

    RETURN pg_catalog.jsonb_build_object(
      'transaction_id', p_transaction_id,
      'status', 'failed',
      'reason', 'Insufficient balance at execution'
    );
  END IF;

  UPDATE public.wallets
  SET simulated_balance = simulated_balance - v_tx.amount
  WHERE id = v_tx.wallet_id;

  UPDATE public.transactions
  SET status = 'executed', executed_at = pg_catalog.now()
  WHERE id = p_transaction_id;

  INSERT INTO public.audit_events (
    household_id, actor_user_id, action, entity_type,
    entity_id, outcome, details
  ) VALUES (
    v_household_id, v_user_id, 'transaction.executed',
    'transaction', p_transaction_id, 'success',
    pg_catalog.jsonb_build_object(
      'amount', v_tx.amount,
      'currency', v_tx.currency,
      'released_from_hold', true
    )
  );

  SELECT pg_catalog.jsonb_build_object(
    'id', t.id,
    'household_id', t.household_id,
    'wallet_id', t.wallet_id,
    'transaction_type', t.transaction_type,
    'category', t.category,
    'description', t.description,
    'amount', t.amount,
    'currency', t.currency,
    'status', t.status,
    'requires_approval', t.requires_approval,
    'hold_until', t.hold_until,
    'executed_at', t.executed_at
  ) INTO v_result
  FROM public.transactions t
  WHERE t.id = p_transaction_id;

  RETURN v_result;
END;
$$;


REVOKE ALL ON FUNCTION public.request_simulated_transaction(
  uuid, uuid, text, text, text, numeric, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_simulated_transaction(
  uuid, uuid, text, text, text, numeric, text
) TO authenticated;

REVOKE ALL ON FUNCTION public.decide_simulated_transaction(uuid, text, text)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decide_simulated_transaction(uuid, text, text)
TO authenticated;

REVOKE ALL ON FUNCTION public.execute_held_simulated_transaction(uuid)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.execute_held_simulated_transaction(uuid)
TO authenticated;
