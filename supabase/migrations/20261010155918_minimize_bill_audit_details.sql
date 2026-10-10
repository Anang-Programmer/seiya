BEGIN;

-- Keep bill.created audit events useful while avoiding duplicate storage
-- of the bill's financial details in the audit log.
-- Existing audit_events rows are deliberately preserved.
CREATE OR REPLACE FUNCTION public.create_household_bill(
  p_household_id uuid,
  p_title text,
  p_payee text DEFAULT NULL::text,
  p_amount numeric DEFAULT NULL::numeric,
  p_currency text DEFAULT 'IDR'::text,
  p_due_date date DEFAULT NULL::date,
  p_recurrence text DEFAULT 'none'::text,
  p_notes text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
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

  IF p_amount IS NULL
     OR p_amount <= 0
     OR p_amount > 999999999999.99
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
    household_id,
    created_by,
    title,
    payee,
    amount,
    currency,
    due_date,
    recurrence,
    status,
    notes
  )
  VALUES (
    p_household_id,
    v_user_id,
    v_title,
    v_payee,
    p_amount,
    v_currency,
    p_due_date,
    v_recurrence,
    CASE WHEN p_due_date < CURRENT_DATE THEN 'overdue' ELSE 'upcoming' END,
    v_notes
  )
  RETURNING * INTO v_bill;

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
    'bill.created',
    'bill',
    v_bill.id,
    'success',
    -- Do not duplicate amount, currency, due date, title, payee or notes
    -- into the audit log. The bill record itself remains the source of truth.
    pg_catalog.jsonb_build_object('status', v_bill.status)
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
$function$;

COMMIT;
