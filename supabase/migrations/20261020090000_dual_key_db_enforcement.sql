-- Seiya Dual-Key enforcement in the database (2026-10-20).
--
-- Until now the approver PIN check and the 5-failure lockout lived only in the
-- Next.js routes, PIN hashes were plain salted sha256, and held purchases took
-- hold_until from the browser. A signed-in user calling PostgREST directly with
-- their own session could skip all three. This migration moves them into
-- Postgres:
--
--   1. PINs are bcrypt (pgcrypto crypt/gen_salt) with a random per-hash salt.
--      Legacy sha256_hex("<user_id>:<pin>:seiya-dual-key-salt") hashes are
--      accepted once and re-hashed on the next successful verify.
--   2. Every PIN check goes through check_user_pin_attempt: five wrong PINs for
--      the same PIN owner within 15 minutes lock further checks. Failures are
--      recorded in audit_events (action pin.verify_failed, entity = owner).
--      A correct PIN clears the counter (user_pins.last_verified_at).
--   3. Approving goes through decide_household_approval_with_pin and
--      decide_simulated_transaction_with_pin; the PIN-less versions are no
--      longer executable by API roles.
--   4. user_pins is written only by set_user_pin and pin_hash is not readable.
--   5. held_purchases.hold_until is computed from the active finance agreement
--      by a trigger; direct UPDATEs are no longer allowed.
--
-- Wrong PINs return ok=false (instead of raising) so the failed attempt is
-- committed and counts toward the lockout.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

ALTER TABLE public.user_pins
  ADD COLUMN IF NOT EXISTS last_verified_at timestamptz;


-- -----------------------------------------------------------------------------
-- 1. PIN hashing and verification (internal helpers)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hash_user_pin(p_pin text)
RETURNS text
LANGUAGE sql
VOLATILE
SET search_path = ''
AS $$
  SELECT extensions.crypt(p_pin, extensions.gen_salt('bf', 10));
$$;

-- True when p_pin is p_owner_id's PIN. On a match, upgrades a legacy sha256
-- hash to bcrypt and records the successful check.
CREATE OR REPLACE FUNCTION public.user_pin_matches(p_owner_id uuid, p_pin text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_hash text;
BEGIN
  IF p_owner_id IS NULL OR COALESCE(p_pin, '') !~ '^[0-9]{6}$' THEN
    RETURN false;
  END IF;

  SELECT up.pin_hash INTO v_hash
  FROM public.user_pins up
  WHERE up.user_id = p_owner_id
  FOR UPDATE;

  IF v_hash IS NULL THEN
    RETURN false;
  END IF;

  IF v_hash LIKE '$2%' THEN
    IF extensions.crypt(p_pin, v_hash) <> v_hash THEN
      RETURN false;
    END IF;
  ELSIF v_hash = pg_catalog.encode(
          pg_catalog.sha256(pg_catalog.convert_to(
            p_owner_id::text || ':' || p_pin || ':seiya-dual-key-salt', 'UTF8')),
          'hex') THEN
    v_hash := public.hash_user_pin(p_pin);
  ELSE
    RETURN false;
  END IF;

  UPDATE public.user_pins up
  SET pin_hash = v_hash,
      last_verified_at = pg_catalog.now()
  WHERE up.user_id = p_owner_id;

  RETURN true;
END;
$$;

-- Wrong PINs for p_owner_id in the last 15 minutes, since their last correct PIN.
CREATE OR REPLACE FUNCTION public.pin_failure_count(p_owner_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT pg_catalog.count(*)::integer
  FROM public.audit_events e
  WHERE e.action = 'pin.verify_failed'
    AND e.entity_type = 'user_pin'
    AND e.entity_id = p_owner_id
    AND e.created_at > GREATEST(
      pg_catalog.now() - interval '15 minutes',
      COALESCE(
        (SELECT up.last_verified_at FROM public.user_pins up WHERE up.user_id = p_owner_id),
        '-infinity'::timestamptz
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.record_pin_failure(
  p_owner_id uuid,
  p_household_id uuid,
  p_purpose text,
  p_details jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  INSERT INTO public.audit_events (
    household_id, actor_user_id, action, entity_type, entity_id, outcome, details
  ) VALUES (
    p_household_id, auth.uid(), 'pin.verify_failed', 'user_pin', p_owner_id, 'denied',
    COALESCE(p_details, '{}'::jsonb) || pg_catalog.jsonb_build_object('purpose', p_purpose)
  );
$$;

-- Serializes PIN checks per owner so parallel requests cannot exceed the limit.
CREATE OR REPLACE FUNCTION public.lock_pin_owner(p_owner_id uuid)
RETURNS void
LANGUAGE sql
SET search_path = ''
AS $$
  SELECT pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('seiya-pin:' || p_owner_id::text, 0)
  );
$$;

-- The one PIN check: 'valid', 'invalid' or 'locked'. The fifth wrong PIN
-- already answers 'locked'.
CREATE OR REPLACE FUNCTION public.check_user_pin_attempt(
  p_owner_id uuid,
  p_pin text,
  p_household_id uuid,
  p_purpose text,
  p_details jsonb DEFAULT '{}'::jsonb
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_failures integer;
BEGIN
  PERFORM public.lock_pin_owner(p_owner_id);

  v_failures := public.pin_failure_count(p_owner_id);
  IF v_failures >= 5 THEN
    RETURN 'locked';
  END IF;

  IF public.user_pin_matches(p_owner_id, p_pin) THEN
    RETURN 'valid';
  END IF;

  PERFORM public.record_pin_failure(p_owner_id, p_household_id, p_purpose, p_details);
  RETURN CASE WHEN v_failures + 1 >= 5 THEN 'locked' ELSE 'invalid' END;
END;
$$;


-- -----------------------------------------------------------------------------
-- 2. PIN API for the signed-in user
-- -----------------------------------------------------------------------------

-- Checks the caller's own PIN (PIN prompts that do not decide anything).
CREATE OR REPLACE FUNCTION public.verify_user_pin(p_pin text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  RETURN public.check_user_pin_attempt(v_user_id, p_pin, NULL, 'pin.verify');
END;
$$;

-- Sets the caller's PIN. Changing an existing PIN needs the current one, so a
-- signed-in but unlocked phone cannot replace it and approve requests.
CREATE OR REPLACE FUNCTION public.set_user_pin(p_pin text, p_current_pin text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_check text;
  v_now timestamptz := pg_catalog.now();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF COALESCE(p_pin, '') !~ '^[0-9]{6}$' THEN
    RAISE EXCEPTION 'PIN must be exactly 6 digits' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (SELECT 1 FROM public.user_pins up WHERE up.user_id = v_user_id) THEN
    IF COALESCE(p_current_pin, '') !~ '^[0-9]{6}$' THEN
      RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'current_pin_required');
    END IF;

    v_check := public.check_user_pin_attempt(v_user_id, p_current_pin, NULL, 'pin.change');
    IF v_check <> 'valid' THEN
      RETURN pg_catalog.jsonb_build_object(
        'ok', false,
        'reason', CASE v_check WHEN 'locked' THEN 'locked' ELSE 'invalid_pin' END
      );
    END IF;
  END IF;

  INSERT INTO public.user_pins (user_id, pin_hash, created_at, updated_at, last_verified_at)
  VALUES (v_user_id, public.hash_user_pin(p_pin), v_now, v_now, v_now)
  ON CONFLICT (user_id) DO UPDATE
  SET pin_hash = EXCLUDED.pin_hash,
      updated_at = EXCLUDED.updated_at,
      last_verified_at = EXCLUDED.last_verified_at;

  RETURN pg_catalog.jsonb_build_object('ok', true);
END;
$$;

-- user_pins: written only by set_user_pin; the hash is never readable.
DROP POLICY IF EXISTS user_pins_insert ON public.user_pins;
DROP POLICY IF EXISTS user_pins_update ON public.user_pins;
REVOKE ALL ON public.user_pins FROM anon, authenticated;
GRANT SELECT (user_id, created_at, updated_at) ON public.user_pins TO authenticated;


-- -----------------------------------------------------------------------------
-- 3. Approving needs the approver's PIN, checked here.
--    Declining does not. The PIN-less functions stay as internals.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.decide_household_approval_with_pin(
  p_approval_id uuid,
  p_decision text,
  p_reason text DEFAULT NULL,
  p_pin text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_household_id uuid;
  v_check text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF p_decision = 'approved' THEN
    SELECT a.household_id INTO v_household_id
    FROM public.approvals a
    WHERE a.id = p_approval_id;

    IF NOT FOUND OR NOT public.is_household_member(v_household_id) THEN
      RAISE EXCEPTION 'Approval request not found' USING ERRCODE = 'P0002';
    END IF;

    IF NULLIF(pg_catalog.btrim(COALESCE(p_pin, '')), '') IS NULL THEN
      RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'pin_required');
    END IF;

    v_check := public.check_user_pin_attempt(
      v_user_id, p_pin, v_household_id, 'approval.decide',
      pg_catalog.jsonb_build_object('approval_id', p_approval_id)
    );
    IF v_check <> 'valid' THEN
      RETURN pg_catalog.jsonb_build_object(
        'ok', false,
        'reason', CASE v_check WHEN 'locked' THEN 'locked' ELSE 'invalid_pin' END
      );
    END IF;
  END IF;

  RETURN public.decide_household_approval(p_approval_id, p_decision, p_reason)
    || pg_catalog.jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.decide_simulated_transaction_with_pin(
  p_transaction_id uuid,
  p_decision text,
  p_note text DEFAULT NULL,
  p_pin text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_household_id uuid;
  v_check text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF p_decision = 'approved' THEN
    SELECT t.household_id INTO v_household_id
    FROM public.transactions t
    WHERE t.id = p_transaction_id;

    IF NOT FOUND OR NOT public.is_household_member(v_household_id) THEN
      RAISE EXCEPTION 'Transaction not found' USING ERRCODE = 'P0002';
    END IF;

    IF NULLIF(pg_catalog.btrim(COALESCE(p_pin, '')), '') IS NULL THEN
      RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'pin_required');
    END IF;

    v_check := public.check_user_pin_attempt(
      v_user_id, p_pin, v_household_id, 'transaction.decide',
      pg_catalog.jsonb_build_object('transaction_id', p_transaction_id)
    );
    IF v_check <> 'valid' THEN
      RETURN pg_catalog.jsonb_build_object(
        'ok', false,
        'reason', CASE v_check WHEN 'locked' THEN 'locked' ELSE 'invalid_pin' END
      );
    END IF;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'ok', true,
    'transaction', public.decide_simulated_transaction(p_transaction_id, p_decision, p_note)
  );
END;
$$;


-- -----------------------------------------------------------------------------
-- 4. Dual-Key plan deletion: same contract as 20261018120000, now through the
--    shared PIN check. Each partner's PIN counts toward that partner's lockout.
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
  v_owner_check text;
  v_partner_check text;
  v_details jsonb;
  v_plan public.plans%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_household_member(p_household_id) THEN
    RAISE EXCEPTION 'Active household membership required' USING ERRCODE = '42501';
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

  -- Take both owner locks in a fixed order before either check.
  PERFORM public.lock_pin_owner(LEAST(v_owner_id, v_partner_id));
  PERFORM public.lock_pin_owner(GREATEST(v_owner_id, v_partner_id));

  IF public.pin_failure_count(v_owner_id) >= 5 OR public.pin_failure_count(v_partner_id) >= 5 THEN
    RETURN pg_catalog.jsonb_build_object('ok', false, 'reason', 'locked');
  END IF;

  v_details := pg_catalog.jsonb_build_object('plan_id', p_plan_id);
  v_owner_check := public.check_user_pin_attempt(
    v_owner_id, p_partner_a_pin, p_household_id, 'plan.dual_key_delete', v_details
  );
  v_partner_check := public.check_user_pin_attempt(
    v_partner_id, p_partner_b_pin, p_household_id, 'plan.dual_key_delete', v_details
  );

  IF v_owner_check <> 'valid' OR v_partner_check <> 'valid' THEN
    RETURN pg_catalog.jsonb_build_object(
      'ok', false,
      'reason', CASE WHEN 'locked' IN (v_owner_check, v_partner_check) THEN 'locked' ELSE 'invalid_pin' END
    );
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
-- 5. Held purchases: the database sets the cooling-off end.
--    hold_until = now + coolingOff.durationHours (1-72, default 24) from the
--    active finance agreement; whatever the client sent is ignored.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.held_purchases_set_server_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_hours_text text;
  v_hours numeric := 24;
  v_now timestamptz := pg_catalog.now();
BEGIN
  SELECT r.rules #>> '{coolingOff,durationHours}' INTO v_hours_text
  FROM public.household_finance_rules r
  WHERE r.household_id = NEW.household_id
    AND r.status = 'active'
  ORDER BY r.version DESC
  LIMIT 1;

  IF v_hours_text ~ '^[0-9]{1,2}([.][0-9]{1,4})?$' AND v_hours_text::numeric BETWEEN 1 AND 72 THEN
    v_hours := v_hours_text::numeric;
  END IF;

  NEW.status := 'held';
  NEW.hold_until := v_now + v_hours::double precision * interval '1 hour';
  NEW.hold_until_display := 'After a ' || v_hours || '-hour cooling-off period';
  NEW.requester_role := COALESCE(
    public.household_role_code(NEW.household_id, NEW.requester_id),
    NEW.requester_role
  );
  NEW.created_at := v_now;
  NEW.updated_at := v_now;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS held_purchases_set_server_fields ON public.held_purchases;
CREATE TRIGGER held_purchases_set_server_fields
  BEFORE INSERT ON public.held_purchases
  FOR EACH ROW EXECUTE FUNCTION public.held_purchases_set_server_fields();

-- Holds change only through continue_held_purchase (or are deleted on cancel);
-- the old update policy let a member move hold_until into the past.
DROP POLICY IF EXISTS held_purchases_update ON public.held_purchases;
REVOKE UPDATE ON public.held_purchases FROM anon, authenticated;


-- -----------------------------------------------------------------------------
-- API permissions
-- -----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.hash_user_pin(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.user_pin_matches(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pin_failure_count(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_pin_failure(uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lock_pin_owner(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.check_user_pin_attempt(uuid, text, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.held_purchases_set_server_fields() FROM PUBLIC, anon, authenticated;

-- The PIN-less decision functions remain callable from the SECURITY DEFINER
-- functions above (they run as the owner), but not through the API.
REVOKE ALL ON FUNCTION public.decide_household_approval(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.decide_simulated_transaction(uuid, text, text) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.verify_user_pin(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_user_pin(text) TO authenticated;

REVOKE ALL ON FUNCTION public.set_user_pin(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_user_pin(text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.decide_household_approval_with_pin(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decide_household_approval_with_pin(uuid, text, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.decide_simulated_transaction_with_pin(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decide_simulated_transaction_with_pin(uuid, text, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.dual_key_delete_household_plan(uuid, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dual_key_delete_household_plan(uuid, uuid, text, text) TO authenticated;
