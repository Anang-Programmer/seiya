-- =============================================================================
-- Migration: 20261017091500_couple_features_dual_key_gateway.sql
-- Description: Adds Couple Goals/Plans, Unified Approvals Queue, Held Purchases /
--              Waiting List, Activities / Audit Log, User PINs for Dual-Key,
--              and Household Settlement tracking.
-- =============================================================================

-- 1. Couple Goals / Plans
CREATE TABLE IF NOT EXISTS public.plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  title text NOT NULL,
  category text NOT NULL DEFAULT 'General',
  target_amount numeric(14,2) NOT NULL CHECK (target_amount > 0),
  current_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (current_amount >= 0),
  currency text NOT NULL DEFAULT 'IDR' CHECK (currency ~ '^[A-Z]{3}$'),
  target_date text NOT NULL,
  recommended_monthly numeric(14,2) NOT NULL DEFAULT 0 CHECK (recommended_monthly >= 0),
  split_partner_b numeric(5,2) NOT NULL DEFAULT 50 CHECK (split_partner_b >= 0 AND split_partner_b <= 100),
  split_partner_a numeric(5,2) NOT NULL DEFAULT 50 CHECK (split_partner_a >= 0 AND split_partner_a <= 100),
  wallet_funding text NOT NULL DEFAULT 'Planned shared contributions',
  status text NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft', 'Proposed', 'Active', 'Needs review', 'Paused', 'Completed', 'Archived')),
  assumptions text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY plans_select ON public.plans
  FOR SELECT TO authenticated
  USING (public.is_household_member(household_id));

CREATE POLICY plans_insert ON public.plans
  FOR INSERT TO authenticated
  WITH CHECK (public.is_household_member(household_id) AND created_by = auth.uid());

CREATE POLICY plans_update ON public.plans
  FOR UPDATE TO authenticated
  USING (public.is_household_member(household_id));

CREATE POLICY plans_delete ON public.plans
  FOR DELETE TO authenticated
  USING (public.is_household_member(household_id));

-- 2. User Security PINs (Dual-Key Security)
CREATE TABLE IF NOT EXISTS public.user_pins (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  pin_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_pins ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_pins_select ON public.user_pins
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY user_pins_insert ON public.user_pins
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY user_pins_update ON public.user_pins
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

-- 3. Unified Approvals Queue (Dual-Key Action Queue)
CREATE TABLE IF NOT EXISTS public.approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  title text NOT NULL,
  amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  currency text NOT NULL DEFAULT 'IDR' CHECK (currency ~ '^[A-Z]{3}$'),
  wallet text NOT NULL DEFAULT 'shared' CHECK (wallet IN ('shared', 'personal_a', 'personal_b')),
  requester_id uuid NOT NULL REFERENCES auth.users(id),
  requester_role text NOT NULL DEFAULT 'partner_a' CHECK (requester_role IN ('partner_a', 'partner_b')),
  approver_id uuid REFERENCES auth.users(id),
  approver_role text NOT NULL DEFAULT 'partner_b' CHECK (approver_role IN ('partner_a', 'partner_b')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined', 'cancelled', 'expired')),
  reason text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'Other' CHECK (category IN ('Bills', 'Plans', 'Expenses', 'Contracts', 'Other')),
  type text NOT NULL DEFAULT 'OTHER' CHECK (type IN ('BILL', 'PLAN_DELETE', 'EXPENSE', 'CONTRACT', 'GOAL', 'OTHER')),
  target_id text,
  notes text,
  expires_in_hours integer NOT NULL DEFAULT 24,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY approvals_select ON public.approvals
  FOR SELECT TO authenticated
  USING (public.is_household_member(household_id));

CREATE POLICY approvals_insert ON public.approvals
  FOR INSERT TO authenticated
  WITH CHECK (public.is_household_member(household_id) AND requester_id = auth.uid());

CREATE POLICY approvals_update ON public.approvals
  FOR UPDATE TO authenticated
  USING (public.is_household_member(household_id));

-- 4. Held Purchases (Waiting List / Cooling-Off Safeguard)
CREATE TABLE IF NOT EXISTS public.held_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  title text NOT NULL,
  amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  currency text NOT NULL DEFAULT 'IDR' CHECK (currency ~ '^[A-Z]{3}$'),
  wallet text NOT NULL DEFAULT 'shared' CHECK (wallet IN ('shared', 'personal_a', 'personal_b')),
  requester_id uuid NOT NULL REFERENCES auth.users(id),
  requester_role text NOT NULL DEFAULT 'partner_a' CHECK (requester_role IN ('partner_a', 'partner_b')),
  status text NOT NULL DEFAULT 'held' CHECK (status IN ('held', 'released', 'cancelled')),
  hold_until timestamptz NOT NULL,
  hold_until_display text NOT NULL DEFAULT 'Tomorrow at 08:00 (Local Time)',
  reason text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.held_purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY held_purchases_select ON public.held_purchases
  FOR SELECT TO authenticated
  USING (public.is_household_member(household_id));

CREATE POLICY held_purchases_insert ON public.held_purchases
  FOR INSERT TO authenticated
  WITH CHECK (public.is_household_member(household_id) AND requester_id = auth.uid());

CREATE POLICY held_purchases_update ON public.held_purchases
  FOR UPDATE TO authenticated
  USING (public.is_household_member(household_id));

CREATE POLICY held_purchases_delete ON public.held_purchases
  FOR DELETE TO authenticated
  USING (public.is_household_member(household_id));

-- 5. Activities (Audit Log / Decision Feed)
CREATE TABLE IF NOT EXISTS public.activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  title text NOT NULL,
  category text NOT NULL DEFAULT 'Activity',
  actor text NOT NULL DEFAULT 'partner_a' CHECK (actor IN ('partner_a', 'partner_b', 'seiya')),
  status text NOT NULL DEFAULT 'INFO' CHECK (status IN ('ALLOW', 'NEED_APPROVAL', 'HOLD', 'DENY', 'INFO')),
  amount numeric(14,2),
  currency text,
  reason text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY activities_select ON public.activities
  FOR SELECT TO authenticated
  USING (public.is_household_member(household_id));

CREATE POLICY activities_insert ON public.activities
  FOR INSERT TO authenticated
  WITH CHECK (public.is_household_member(household_id));

-- 6. Household Settlement State
CREATE TABLE IF NOT EXISTS public.household_settlements (
  household_id uuid PRIMARY KEY REFERENCES public.households(id) ON DELETE CASCADE,
  partner_b_owes_a numeric(14,2) NOT NULL DEFAULT 0 CHECK (partner_b_owes_a >= 0),
  partner_a_owes_b numeric(14,2) NOT NULL DEFAULT 0 CHECK (partner_a_owes_b >= 0),
  currency text NOT NULL DEFAULT 'IDR' CHECK (currency ~ '^[A-Z]{3}$'),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.household_settlements ENABLE ROW LEVEL SECURITY;

CREATE POLICY settlements_select ON public.household_settlements
  FOR SELECT TO authenticated
  USING (public.is_household_member(household_id));

CREATE POLICY settlements_insert ON public.household_settlements
  FOR INSERT TO authenticated
  WITH CHECK (public.is_household_member(household_id));

CREATE POLICY settlements_update ON public.household_settlements
  FOR UPDATE TO authenticated
  USING (public.is_household_member(household_id));

-- Helper function to record activity
CREATE OR REPLACE FUNCTION public.record_activity(
  p_household_id uuid,
  p_title text,
  p_category text DEFAULT 'Activity',
  p_actor text DEFAULT 'seiya',
  p_status text DEFAULT 'INFO',
  p_amount numeric DEFAULT NULL,
  p_currency text DEFAULT NULL,
  p_reason text DEFAULT ''
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT public.is_household_member(p_household_id) THEN
    RAISE EXCEPTION 'Active household membership required' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.activities (
    household_id, title, category, actor, status, amount, currency, reason
  ) VALUES (
    p_household_id, p_title, p_category, p_actor, p_status, p_amount, p_currency, p_reason
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;
