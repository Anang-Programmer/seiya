-- -----------------------------------------------------------------------------
-- Expense notes reach the partner.
--
-- request_simulated_transaction queues the partner's approval itself, so the
-- notes typed in Propose Expense were dropped. The requester can now attach
-- notes to their own still-pending request (UPDATE on approvals is revoked
-- from API roles, hence an RPC).
--
-- Cancelling a pending expense request is handled by
-- 20261020110000_cancel_pending_expense_request; this migration does not touch it.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_household_approval_notes(p_approval_id uuid, p_notes text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_item public.approvals%ROWTYPE;
  v_notes text := NULLIF(pg_catalog.btrim(COALESCE(p_notes, '')), '');
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF v_notes IS NOT NULL AND pg_catalog.length(v_notes) > 1000 THEN
    RAISE EXCEPTION 'Notes must be at most 1000 characters' USING ERRCODE = '22023';
  END IF;

  SELECT a.* INTO v_item
  FROM public.approvals a
  WHERE a.id = p_approval_id
  FOR UPDATE;

  IF NOT FOUND OR NOT public.is_household_member(v_item.household_id) THEN
    RAISE EXCEPTION 'Approval request not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_item.requester_id <> v_user_id THEN
    RAISE EXCEPTION 'Only the member who made this request can add notes' USING ERRCODE = '42501';
  END IF;

  IF v_item.status <> 'pending' THEN
    RAISE EXCEPTION 'This request is already %', v_item.status USING ERRCODE = '22023';
  END IF;

  UPDATE public.approvals a
  SET notes = v_notes, updated_at = pg_catalog.now()
  WHERE a.id = p_approval_id;

  RETURN pg_catalog.jsonb_build_object('id', p_approval_id, 'notes', v_notes);
END;
$$;

REVOKE ALL ON FUNCTION public.set_household_approval_notes(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_household_approval_notes(uuid, text) TO authenticated;
