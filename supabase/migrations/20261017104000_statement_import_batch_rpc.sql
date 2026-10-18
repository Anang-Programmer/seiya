-- =============================================================================
-- Migration: 20261017104000_statement_import_batch_rpc.sql
-- Description: Batch statement import RPC function for historical transactions
-- =============================================================================

CREATE OR REPLACE FUNCTION public.import_statement_batch(
  p_household_id uuid,
  p_wallet_id uuid,
  p_transactions jsonb,
  p_paid_by text DEFAULT 'partner_a'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_item jsonb;
  v_count integer := 0;
  v_total_delta numeric := 0;
  v_amount numeric;
  v_type text;
  v_date timestamptz;
  v_wallet public.wallets%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_household_member(p_household_id) THEN
    RAISE EXCEPTION 'Active household membership required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_wallet
  FROM public.wallets
  WHERE id = p_wallet_id AND household_id = p_household_id AND status = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target wallet not found in household' USING ERRCODE = 'P0002';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_transactions)
  LOOP
    v_amount := (v_item->>'amount')::numeric;
    v_type := coalesce(v_item->>'type', 'expense');
    
    IF v_amount > 0 THEN
      BEGIN
        v_date := (v_item->>'date')::timestamptz;
      EXCEPTION WHEN OTHERS THEN
        v_date := pg_catalog.now();
      END;

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
        occurred_at,
        executed_at,
        created_at,
        updated_at
      ) VALUES (
        p_household_id,
        p_wallet_id,
        v_user_id,
        v_type,
        coalesce(v_item->>'category', 'Others'),
        coalesce(v_item->>'title', 'Imported Transaction'),
        v_amount,
        coalesce(v_item->>'currency', v_wallet.currency),
        'executed',
        'system',
        false,
        coalesce(v_item->>'idempotencyKey', 'stmt-' || gen_random_uuid()),
        v_date,
        v_date,
        v_date,
        v_date
      );

      v_count := v_count + 1;
      IF v_type = 'income' THEN
        v_total_delta := v_total_delta + v_amount;
      ELSE
        v_total_delta := v_total_delta - v_amount;
      END IF;
    END IF;
  END LOOP;

  IF v_count > 0 THEN
    UPDATE public.wallets
    SET simulated_balance = GREATEST(0, simulated_balance + v_total_delta),
        updated_at = pg_catalog.now()
    WHERE id = p_wallet_id;

    PERFORM public.record_activity(
      p_household_id,
      'Statement Import: ' || v_count || ' Transactions',
      'Statement Import',
      p_paid_by,
      'INFO',
      abs(v_total_delta),
      v_wallet.currency,
      'Historical transactions imported into ' || v_wallet.name || '.'
    );
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'importedCount', v_count,
    'netBalanceDelta', v_total_delta
  );
END;
$$;

REVOKE ALL ON FUNCTION public.import_statement_batch(uuid, uuid, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.import_statement_batch(uuid, uuid, jsonb, text) TO authenticated;
