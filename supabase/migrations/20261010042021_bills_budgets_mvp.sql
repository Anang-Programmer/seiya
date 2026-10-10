-- Seiya Bills & Budgets MVP
-- Additive migration: creates narrow SECURITY DEFINER RPCs and a transaction-to-bill status trigger.
-- Does not drop tables or delete existing data.

-- -----------------------------------------------------------------------------
-- Create a household bill. Direct browser writes stay disabled; authenticated users
-- must go through this RPC, which checks household membership and status.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_household_bill(
  p_household_id uuid,
  p_title text,
  p_payee text DEFAULT NULL,
  p_amount numeric DEFAULT NULL,
  p_currency text DEFAULT 'IDR',
  p_due_date date DEFAULT NULL,
  p_recurrence text DEFAULT 'none',
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_household public.households%ROWTYPE;
  v_bill public.bills%ROWTYPE;
  v_title text;
  v_payee text;
  v_currency text;
  v_recurrence text;
  v_notes text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF p_household_id IS NULL THEN
    RAISE EXCEPTION 'Household ID is required' USING ERRCODE = '22023';
  END IF;

  SELECT h.* INTO v_household
  FROM public.households h
  WHERE h.id = p_household_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Household not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_household.status <> 'active' THEN
    RAISE EXCEPTION 'Household must be active' USING ERRCODE = '22023';
  END IF;

  IF NOT public.is_household_member(p_household_id) THEN
    RAISE EXCEPTION 'Active household membership required' USING ERRCODE = '42501';
  END IF;

  v_title := pg_catalog.btrim(COALESCE(p_title, ''));
  v_payee := NULLIF(pg_catalog.btrim(COALESCE(p_payee, '')), '');
  v_notes := NULLIF(pg_catalog.btrim(COALESCE(p_notes, '')), '');
  v_currency := pg_catalog.upper(pg_catalog.btrim(COALESCE(p_currency, '')));
  v_recurrence := COALESCE(p_recurrence, 'none');

  IF v_title = '' OR pg_catalog.length(v_title) > 160 THEN
    RAISE EXCEPTION 'Title is required and must be at most 160 characters' USING ERRCODE = '22023';
  END IF;

  IF v_payee IS NOT NULL AND pg_catalog.length(v_payee) > 160 THEN
    RAISE EXCEPTION 'Payee must be at most 160 characters' USING ERRCODE = '22023';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 999999999999.99
     OR p_amount <> pg_catalog.round(p_amount, 2) THEN
    RAISE EXCEPTION 'Amount must be positive with at most two decimal places' USING ERRCODE = '22023';
  END IF;

  IF p_due_date IS NULL THEN
    RAISE EXCEPTION 'Due date is required' USING ERRCODE = '22023';
  END IF;

  IF v_currency !~ '^[A-Z]{3}$' OR v_currency <> v_household.base_currency THEN
    RAISE EXCEPTION 'Bill currency must match household base currency' USING ERRCODE = '22023';
  END IF;

  IF v_recurrence NOT IN ('none', 'weekly', 'monthly', 'yearly') THEN
    RAISE EXCEPTION 'Invalid recurrence value' USING ERRCODE = '22023';
  END IF;

  IF v_notes IS NOT NULL AND pg_catalog.length(v_notes) > 1000 THEN
    RAISE EXCEPTION 'Notes must be at most 1000 characters' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.bills (
    household_id, created_by, title, payee, amount, currency,
    due_date, recurrence, status, notes
  ) VALUES (
    p_household_id, v_user_id, v_title, v_payee, p_amount, v_currency,
    p_due_date, v_recurrence,
    CASE WHEN p_due_date < CURRENT_DATE THEN 'overdue' ELSE 'upcoming' END,
    v_notes
  )
  RETURNING * INTO v_bill;

  INSERT INTO public.audit_events (
    household_id, actor_user_id, action, entity_type, entity_id, outcome, details
  ) VALUES (
    p_household_id, v_user_id, 'bill.created', 'bill', v_bill.id, 'success',
    pg_catalog.jsonb_build_object('amount', v_bill.amount, 'currency', v_bill.currency, 'due_date', v_bill.due_date)
  );

  RETURN pg_catalog.jsonb_build_object(
    'id', v_bill.id,
    'household_id', v_bill.household_id,
    'created_by', v_bill.created_by,
    'title', v_bill.title,
    'payee', v_bill.payee,
    'amount', v_bill.amount,
    'currency', v_bill.currency,
    'due_date', v_bill.due_date,
    'recurrence', v_bill.recurrence,
    'status', v_bill.status,
    'paid_transaction_id', v_bill.paid_transaction_id,
    'notes', v_bill.notes,
    'created_at', v_bill.created_at,
    'updated_at', v_bill.updated_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_household_bill(uuid, text, text, numeric, text, date, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_household_bill(uuid, text, text, numeric, text, date, text, text) TO authenticated;


-- -----------------------------------------------------------------------------
-- Create or update a shared household budget for the exact category/period tuple.
-- Currency must match the household base currency in this MVP (no FX conversion).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.upsert_household_budget(
  p_household_id uuid,
  p_category text,
  p_amount numeric,
  p_currency text,
  p_period_start date,
  p_period_end date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_household public.households%ROWTYPE;
  v_category text;
  v_currency text;
  v_budget public.budgets%ROWTYPE;
  v_action text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT h.* INTO v_household
  FROM public.households h
  WHERE h.id = p_household_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Household not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_household.status <> 'active' THEN
    RAISE EXCEPTION 'Household must be active' USING ERRCODE = '22023';
  END IF;

  IF NOT public.is_household_member(p_household_id) THEN
    RAISE EXCEPTION 'Active household membership required' USING ERRCODE = '42501';
  END IF;

  v_category := pg_catalog.lower(pg_catalog.btrim(COALESCE(p_category, '')));
  v_currency := pg_catalog.upper(pg_catalog.btrim(COALESCE(p_currency, '')));

  IF v_category !~ '^[a-z0-9][a-z0-9_-]{1,79}$' THEN
    RAISE EXCEPTION 'Category must be a 2-80 character slug' USING ERRCODE = '22023';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 999999999999.99
     OR p_amount <> pg_catalog.round(p_amount, 2) THEN
    RAISE EXCEPTION 'Budget amount must be positive with at most two decimal places' USING ERRCODE = '22023';
  END IF;

  IF v_currency !~ '^[A-Z]{3}$' OR v_currency <> v_household.base_currency THEN
    RAISE EXCEPTION 'Budget currency must match household base currency' USING ERRCODE = '22023';
  END IF;

  IF p_period_start IS NULL OR p_period_end IS NULL OR p_period_end < p_period_start THEN
    RAISE EXCEPTION 'Invalid budget period' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.budgets (
    household_id, created_by, category, amount, currency, period_start, period_end
  ) VALUES (
    p_household_id, v_user_id, v_category, p_amount, v_currency, p_period_start, p_period_end
  )
  ON CONFLICT (household_id, category, period_start, period_end)
  DO UPDATE SET
    amount = EXCLUDED.amount,
    currency = EXCLUDED.currency,
    updated_at = pg_catalog.now()
  RETURNING * INTO v_budget;

  INSERT INTO public.audit_events (
    household_id, actor_user_id, action, entity_type, entity_id, outcome, details
  ) VALUES (
    p_household_id, v_user_id, 'budget.upserted', 'budget', v_budget.id, 'success',
    pg_catalog.jsonb_build_object('category', v_budget.category, 'amount', v_budget.amount, 'period_start', v_budget.period_start, 'period_end', v_budget.period_end)
  );

  RETURN pg_catalog.jsonb_build_object(
    'id', v_budget.id,
    'household_id', v_budget.household_id,
    'created_by', v_budget.created_by,
    'category', v_budget.category,
    'amount', v_budget.amount,
    'currency', v_budget.currency,
    'period_start', v_budget.period_start,
    'period_end', v_budget.period_end,
    'created_at', v_budget.created_at,
    'updated_at', v_budget.updated_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_household_budget(uuid, text, numeric, text, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_household_budget(uuid, text, numeric, text, date, date) TO authenticated;


-- -----------------------------------------------------------------------------
-- Return shared-wallet-only spending for each household budget.
-- This avoids leaking either partner's personal-wallet spending through the
-- shared household budget summary. No currency conversion is attempted.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_household_budget_progress(p_household_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_budgets jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_household_member(p_household_id) THEN
    RAISE EXCEPTION 'Active household membership required' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', x.id,
        'household_id', x.household_id,
        'created_by', x.created_by,
        'category', x.category,
        'amount', x.amount,
        'currency', x.currency,
        'period_start', x.period_start,
        'period_end', x.period_end,
        'created_at', x.created_at,
        'updated_at', x.updated_at,
        'spent', x.spent,
        'remaining', GREATEST(x.amount - x.spent, 0),
        'usage_percent', CASE WHEN x.amount > 0 THEN pg_catalog.round((x.spent / x.amount) * 100, 2) ELSE 0 END,
        'over_budget', x.spent > x.amount
      )
      ORDER BY x.period_start DESC, x.category
    ),
    '[]'::jsonb
  ) INTO v_budgets
  FROM (
    SELECT
      b.id, b.household_id, b.created_by, b.category, b.amount, b.currency,
      b.period_start, b.period_end, b.created_at, b.updated_at,
      COALESCE(s.spent, 0)::numeric(14,2) AS spent
    FROM public.budgets b
    LEFT JOIN LATERAL (
      SELECT pg_catalog.sum(t.amount)::numeric(14,2) AS spent
      FROM public.transactions t
      JOIN public.wallets w ON w.id = t.wallet_id AND w.household_id = t.household_id
      WHERE t.household_id = b.household_id
        AND w.wallet_type = 'shared'
        AND w.status = 'active'
        AND t.transaction_type = 'expense'
        AND t.status = 'executed'
        AND pg_catalog.lower(COALESCE(t.category, '')) = b.category
        AND t.occurred_at >= (b.period_start::timestamp AT TIME ZONE 'UTC')
        AND t.occurred_at < ((b.period_end + 1)::timestamp AT TIME ZONE 'UTC')
    ) s ON TRUE
    WHERE b.household_id = p_household_id
  ) x;

  RETURN pg_catalog.jsonb_build_object(
    'household_id', p_household_id,
    'budgets', v_budgets
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_household_budget_progress(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_household_budget_progress(uuid) TO authenticated;


-- -----------------------------------------------------------------------------
-- Request payment for a bill using the existing atomic simulated transaction
-- engine. A bill remains pending until the linked expense is executed.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.request_household_bill_payment(
  p_household_id uuid,
  p_bill_id uuid,
  p_wallet_id uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_household public.households%ROWTYPE;
  v_bill public.bills%ROWTYPE;
  v_wallet public.wallets%ROWTYPE;
  v_tx_result jsonb;
  v_tx jsonb;
  v_tx_id uuid;
  v_tx_status text;
  v_bill_idempotency_key text;
  v_existing_tx public.transactions%ROWTYPE;
  v_result_bill jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF p_idempotency_key IS NULL
     OR pg_catalog.length(p_idempotency_key) < 8
     OR pg_catalog.length(p_idempotency_key) > 80
     OR p_idempotency_key !~ '^[A-Za-z0-9._:-]+$' THEN
    RAISE EXCEPTION 'Invalid idempotency key' USING ERRCODE = '22023';
  END IF;

  SELECT h.* INTO v_household
  FROM public.households h
  WHERE h.id = p_household_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Household not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_household.status <> 'active' THEN
    RAISE EXCEPTION 'Household must be active' USING ERRCODE = '22023';
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

  v_bill_idempotency_key := 'bill:' || p_bill_id::text || ':' || p_idempotency_key;

  -- Never create a second payment for a bill that already has a linked transaction.
  -- A retry of the original idempotency key replays the original result even after payment.
  IF v_bill.paid_transaction_id IS NOT NULL THEN
    SELECT t.* INTO v_existing_tx
    FROM public.transactions t
    WHERE t.id = v_bill.paid_transaction_id;

    IF FOUND THEN
      IF v_bill.status = 'pending_approval'
         OR (v_bill.status = 'paid'
             AND v_existing_tx.created_by = v_user_id
             AND v_existing_tx.idempotency_key = v_bill_idempotency_key) THEN
        v_tx := pg_catalog.jsonb_build_object(
          'id', v_existing_tx.id, 'household_id', v_existing_tx.household_id,
          'wallet_id', v_existing_tx.wallet_id, 'transaction_type', v_existing_tx.transaction_type,
          'category', v_existing_tx.category, 'description', v_existing_tx.description,
          'amount', v_existing_tx.amount, 'currency', v_existing_tx.currency,
          'status', v_existing_tx.status, 'requires_approval', v_existing_tx.requires_approval,
          'hold_until', v_existing_tx.hold_until, 'executed_at', v_existing_tx.executed_at,
          'created_at', v_existing_tx.created_at
        );

        RETURN pg_catalog.jsonb_build_object(
          'bill_id', v_bill.id,
          'bill_status', v_bill.status,
          'transaction', v_tx,
          'idempotent_replay', true
        );
      END IF;
    END IF;
  END IF;

  IF v_bill.status = 'paid' THEN
    RAISE EXCEPTION 'Bill has already been paid' USING ERRCODE = '23505';
  END IF;

  IF v_bill.status = 'cancelled' THEN
    RAISE EXCEPTION 'Cancelled bill cannot be paid' USING ERRCODE = '22023';
  END IF;

  IF v_bill.status NOT IN ('upcoming', 'overdue') THEN
    RAISE EXCEPTION 'Bill is not eligible for payment' USING ERRCODE = '22023';
  END IF;

  SELECT w.* INTO v_wallet
  FROM public.wallets w
  WHERE w.id = p_wallet_id
    AND w.household_id = p_household_id
  FOR UPDATE;

  IF NOT FOUND OR v_wallet.status <> 'active' THEN
    RAISE EXCEPTION 'Wallet not found or not active' USING ERRCODE = 'P0002';
  END IF;

  IF v_wallet.currency <> v_bill.currency THEN
    RAISE EXCEPTION 'Bill and wallet currencies must match' USING ERRCODE = '22023';
  END IF;

  v_tx_result := public.request_simulated_transaction(
    p_household_id,
    p_wallet_id,
    'expense',
    'bill_payment',
    'Bill payment: ' || v_bill.title,
    v_bill.amount,
    v_bill_idempotency_key
  );

  v_tx := v_tx_result -> 'transaction';
  IF v_tx IS NULL OR v_tx ->> 'id' IS NULL THEN
    RAISE EXCEPTION 'Transaction engine returned an invalid result' USING ERRCODE = 'P1002';
  END IF;

  v_tx_id := (v_tx ->> 'id')::uuid;
  v_tx_status := v_tx ->> 'status';

  UPDATE public.bills b
  SET
    paid_transaction_id = v_tx_id,
    status = CASE WHEN v_tx_status = 'executed' THEN 'paid' ELSE 'pending_approval' END
  WHERE b.id = p_bill_id;

  SELECT pg_catalog.jsonb_build_object(
    'id', b.id, 'household_id', b.household_id, 'created_by', b.created_by,
    'title', b.title, 'payee', b.payee, 'amount', b.amount, 'currency', b.currency,
    'due_date', b.due_date, 'recurrence', b.recurrence, 'status', b.status,
    'paid_transaction_id', b.paid_transaction_id, 'notes', b.notes,
    'created_at', b.created_at, 'updated_at', b.updated_at
  ) INTO v_result_bill
  FROM public.bills b
  WHERE b.id = p_bill_id;

  RETURN pg_catalog.jsonb_build_object(
    'bill', v_result_bill,
    'transaction', v_tx,
    'idempotent_replay', COALESCE((v_tx_result ->> 'idempotent_replay')::boolean, false)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.request_household_bill_payment(uuid, uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_household_bill_payment(uuid, uuid, uuid, text) TO authenticated;


-- When a linked payment transaction changes state, keep the bill status in sync.
CREATE OR REPLACE FUNCTION public.sync_bill_status_from_transaction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status = 'executed' THEN
    UPDATE public.bills b
    SET status = 'paid'
    WHERE b.paid_transaction_id = NEW.id
      AND b.status = 'pending_approval';
  ELSIF NEW.status IN ('rejected', 'cancelled', 'failed') THEN
    UPDATE public.bills b
    SET
      status = CASE WHEN b.due_date < CURRENT_DATE THEN 'overdue' ELSE 'upcoming' END,
      paid_transaction_id = NULL
    WHERE b.paid_transaction_id = NEW.id
      AND b.status = 'pending_approval';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS transactions_sync_bill_status ON public.transactions;
CREATE TRIGGER transactions_sync_bill_status
AFTER UPDATE OF status ON public.transactions
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.sync_bill_status_from_transaction();

REVOKE ALL ON FUNCTION public.sync_bill_status_from_transaction() FROM PUBLIC, anon, authenticated;
