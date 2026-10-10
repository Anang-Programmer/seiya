
CREATE OR REPLACE FUNCTION public.create_household(
  p_name text DEFAULT 'Our household',
  p_country text DEFAULT NULL,
  p_base_currency text DEFAULT 'IDR'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_household_id uuid;
  v_name text;
  v_country text;
  v_currency text;
  v_result jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.household_members hm
    WHERE hm.user_id = v_user_id
      AND hm.status = 'active'
  ) THEN
    RAISE EXCEPTION 'User already belongs to an active household'
      USING ERRCODE = '23505';
  END IF;

  v_name := COALESCE(
    NULLIF(pg_catalog.btrim(p_name), ''),
    'Our household'
  );

  v_country := NULLIF(pg_catalog.btrim(p_country), '');

  v_currency := pg_catalog.upper(
    COALESCE(
      NULLIF(pg_catalog.btrim(p_base_currency), ''),
      'IDR'
    )
  );

  IF pg_catalog.length(v_name) > 100 THEN
    RAISE EXCEPTION 'Household name is too long'
      USING ERRCODE = '22023';
  END IF;

  IF v_country IS NOT NULL
     AND pg_catalog.length(v_country) > 100 THEN
    RAISE EXCEPTION 'Country is too long'
      USING ERRCODE = '22023';
  END IF;

  IF v_currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'Invalid currency code'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.households (
    name,
    created_by,
    country,
    base_currency,
    status
  )
  VALUES (
    v_name,
    v_user_id,
    v_country,
    v_currency,
    'setup'
  )
  RETURNING id INTO v_household_id;

  INSERT INTO public.household_members (
    household_id,
    user_id,
    role,
    status
  )
  VALUES (
    v_household_id,
    v_user_id,
    'owner',
    'active'
  );

  SELECT pg_catalog.jsonb_build_object(
    'id', h.id,
    'name', h.name,
    'created_by', h.created_by,
    'country', h.country,
    'base_currency', h.base_currency,
    'status', h.status,
    'created_at', h.created_at
  )
  INTO v_result
  FROM public.households h
  WHERE h.id = v_household_id;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.create_household(text, text, text)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_household(text, text, text)
TO authenticated;
