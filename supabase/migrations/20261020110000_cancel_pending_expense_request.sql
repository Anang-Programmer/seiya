-- Seiya: the requester can cancel a pending expense request at any time.
--
-- cancel_household_approval used undo_simulated_transaction for expense
-- requests, whose 10-minute undo window made "Cancel request" fail with a 500
-- once a request had waited more than 10 minutes for the partner. A pending
-- request has not moved money, so it is now cancelled directly.

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

  -- A request still waiting for the partner has not moved any money, so it is
  -- cancelled directly. (undo_simulated_transaction has a 10-minute window
  -- meant for executed entries, which blocked most real cancellations.)
  -- Triggers expire the partner's pending decision and cancel the approval row.
  IF v_item.type = 'EXPENSE' AND v_target IS NOT NULL THEN
    UPDATE public.transactions t
       SET status = 'cancelled'
     WHERE t.id = v_target
       AND t.household_id = v_household_id
       AND t.created_by = v_user_id
       AND t.status IN ('pending_approval', 'on_hold');

    IF FOUND THEN
      UPDATE public.bills b
         SET status = CASE WHEN b.due_date < CURRENT_DATE THEN 'overdue' ELSE 'upcoming' END,
             paid_transaction_id = NULL
       WHERE b.paid_transaction_id = v_target
         AND b.status = 'pending_approval';

      INSERT INTO public.audit_events (
        household_id, actor_user_id, action, entity_type, entity_id, outcome, details
      ) VALUES (
        v_household_id, v_user_id, 'transaction.request_cancelled', 'transaction', v_target, 'success',
        pg_catalog.jsonb_build_object('approval_id', p_approval_id)
      );
    END IF;
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
