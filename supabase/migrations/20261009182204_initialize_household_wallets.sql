
-- Ensure each household can have at most one active shared wallet.
CREATE UNIQUE INDEX IF NOT EXISTS wallets_one_active_shared_per_household_idx
ON public.wallets (household_id)
WHERE wallet_type = 'shared' AND status = 'active';

-- Ensure each member can have at most one active personal wallet per household.
CREATE UNIQUE INDEX IF NOT EXISTS wallets_one_active_personal_per_owner_idx
ON public.wallets (household_id, owner_user_id)
WHERE wallet_type = 'personal' AND status = 'active';


CREATE OR REPLACE FUNCTION public.initialize_household_wallets(
  p_household_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_household public.households%ROWTYPE;
  v_rules jsonb;
  v_wallet_mode text;
  v_member_count integer;
  v_member record;
  v_created_count integer := 0;
  v_wallets jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '42501';
  END IF;

  -- Lock the household so concurrent calls cannot initialize
  -- the same wallets at the same time.
  SELECT h.*
  INTO v_household
  FROM public.households h
  WHERE h.id = p_household_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Household not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.is_household_member(p_household_id) THEN
    RAISE EXCEPTION 'Active household membership required'
      USING ERRCODE = '42501';
  END IF;

  IF v_household.status <> 'active' THEN
    RAISE EXCEPTION 'Household must be active'
      USING ERRCODE = '22023';
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

  v_wallet_mode := v_rules ->> 'walletMode';

  IF v_wallet_mode IS NULL OR v_wallet_mode NOT IN (
    'shared_and_personal',
    'shared_only',
    'separate_only'
  ) THEN
    RAISE EXCEPTION 'Unsupported wallet mode in finance agreement'
      USING ERRCODE = '22023';
  END IF;

  SELECT pg_catalog.count(*)::integer
  INTO v_member_count
  FROM public.household_members hm
  WHERE hm.household_id = p_household_id
    AND hm.status = 'active';

  IF v_member_count <> 2 THEN
    RAISE EXCEPTION 'Exactly two active members are required'
      USING ERRCODE = '22023';
  END IF;

  -- Create the shared wallet only for modes that require it.
  IF v_wallet_mode IN ('shared_and_personal', 'shared_only') THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.wallets w
      WHERE w.household_id = p_household_id
        AND w.wallet_type = 'shared'
        AND w.status = 'active'
    ) THEN
      INSERT INTO public.wallets (
        household_id,
        wallet_type,
        owner_user_id,
        name,
        currency,
        simulated_balance,
        status,
        created_by
      )
      VALUES (
        p_household_id,
        'shared',
        NULL,
        'Shared Wallet',
        v_household.base_currency,
        0,
        'active',
        v_user_id
      );

      v_created_count := v_created_count + 1;
    END IF;
  END IF;

  -- Personal wallets are provisioned for both active members.
  IF v_wallet_mode IN ('shared_and_personal', 'separate_only') THEN
    FOR v_member IN
      SELECT hm.user_id
      FROM public.household_members hm
      WHERE hm.household_id = p_household_id
        AND hm.status = 'active'
      ORDER BY hm.joined_at, hm.user_id
    LOOP
      IF NOT EXISTS (
        SELECT 1
        FROM public.wallets w
        WHERE w.household_id = p_household_id
          AND w.wallet_type = 'personal'
          AND w.owner_user_id = v_member.user_id
          AND w.status = 'active'
      ) THEN
        INSERT INTO public.wallets (
          household_id,
          wallet_type,
          owner_user_id,
          name,
          currency,
          simulated_balance,
          status,
          created_by
        )
        VALUES (
          p_household_id,
          'personal',
          v_member.user_id,
          'Personal Wallet',
          v_household.base_currency,
          0,
          'active',
          v_user_id
        );

        v_created_count := v_created_count + 1;
      END IF;
    END LOOP;
  END IF;

  -- Return only the shared wallet and the caller's personal wallet.
  -- Never expose the partner's personal wallet through this RPC.
  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', w.id,
        'household_id', w.household_id,
        'wallet_type', w.wallet_type,
        'owner_user_id', w.owner_user_id,
        'name', w.name,
        'currency', w.currency,
        'simulated_balance', w.simulated_balance,
        'status', w.status,
        'created_at', w.created_at
      )
      ORDER BY w.wallet_type
    ),
    '[]'::jsonb
  )
  INTO v_wallets
  FROM public.wallets w
  WHERE w.household_id = p_household_id
    AND w.status = 'active'
    AND (
      w.wallet_type = 'shared'
      OR (
        w.wallet_type = 'personal'
        AND w.owner_user_id = v_user_id
      )
    );

  RETURN pg_catalog.jsonb_build_object(
    'household_id', p_household_id,
    'wallet_mode', v_wallet_mode,
    'created_count', v_created_count,
    'wallets', v_wallets
  );
END;
$$;


REVOKE ALL ON FUNCTION public.initialize_household_wallets(uuid)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.initialize_household_wallets(uuid)
TO authenticated;
