-- Seiya Step 11: least-privilege hardening and lifecycle audit events.
-- This migration is additive/permission-tightening. It does not alter financial rows.
-- All changes run in one transaction when applied by Supabase migrations.

BEGIN;

-- 1) Route household creation/member insertion through the validated RPCs only.
-- RPCs are SECURITY DEFINER and retain their owner's table privileges.
REVOKE INSERT ON TABLE public.households
  FROM PUBLIC, anon, authenticated;
REVOKE INSERT ON TABLE public.household_members
  FROM PUBLIC, anon, authenticated;

-- Remove policies that would otherwise suggest direct INSERT is a supported path.
DROP POLICY IF EXISTS households_insert_creator ON public.households;
DROP POLICY IF EXISTS household_members_insert_owner_self ON public.household_members;

-- 2) These helpers are needed by authenticated RLS policies and RPCs, but not anon.
REVOKE EXECUTE ON FUNCTION public.is_household_member(uuid)
  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_household_owner(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_household_member(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_household_owner(uuid)
  TO authenticated;

-- 3) Secure the privileged RAG RPC. Dynamically discover the vector type and
-- the <=> operator schema rather than assuming where pgvector is installed.
DO $step11_rag_search_path$
DECLARE
  v_function_oid oid;
  v_vector_type_oid oid;
  v_vector_type_schema name;
  v_vector_type_name name;
  v_operator_schema name;
  v_function_signature text;
BEGIN
  SELECT p.oid, p.proargtypes[0]::oid
    INTO v_function_oid, v_vector_type_oid
  FROM pg_catalog.pg_proc AS p
  JOIN pg_catalog.pg_namespace AS n
    ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'match_seiya_knowledge_chunks'
    AND p.pronargs = 3
    AND p.proargtypes[1] = 'double precision'::pg_catalog.regtype
    AND p.proargtypes[2] = 'integer'::pg_catalog.regtype;

  IF v_function_oid IS NULL THEN
    RAISE EXCEPTION
      'Expected public.match_seiya_knowledge_chunks(vector, double precision, integer) was not found; migration stopped';
  END IF;

  SELECT tn.nspname, t.typname
    INTO v_vector_type_schema, v_vector_type_name
  FROM pg_catalog.pg_type AS t
  JOIN pg_catalog.pg_namespace AS tn
    ON tn.oid = t.typnamespace
  WHERE t.oid = v_vector_type_oid;

  IF v_vector_type_schema IS NULL OR v_vector_type_name IS NULL THEN
    RAISE EXCEPTION 'Could not resolve pgvector type schema; migration stopped';
  END IF;

  SELECT onsp.nspname
    INTO v_operator_schema
  FROM pg_catalog.pg_operator AS o
  JOIN pg_catalog.pg_namespace AS onsp
    ON onsp.oid = o.oprnamespace
  WHERE o.oprname = '<=>'
    AND o.oprleft = v_vector_type_oid
    AND o.oprright = v_vector_type_oid
  ORDER BY CASE WHEN onsp.nspname = v_vector_type_schema THEN 0 ELSE 1 END
  LIMIT 1;

  IF v_operator_schema IS NULL THEN
    RAISE EXCEPTION 'Could not resolve the pgvector <=> operator schema; migration stopped';
  END IF;

  v_function_signature := pg_catalog.format(
    '%I.%I(%I.%I, double precision, integer)',
    'public',
    'match_seiya_knowledge_chunks',
    v_vector_type_schema,
    v_vector_type_name
  );

  EXECUTE pg_catalog.format(
    'REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon',
    v_function_signature
  );
  EXECUTE pg_catalog.format(
    'GRANT EXECUTE ON FUNCTION %s TO authenticated',
    v_function_signature
  );
  EXECUTE pg_catalog.format(
    'ALTER FUNCTION %s SET search_path = pg_catalog, %I, %I',
    v_function_signature,
    v_operator_schema,
    v_vector_type_schema
  );
END;
$step11_rag_search_path$;

-- 4) Shared trigger function for lifecycle audit events. It logs only minimal
-- metadata (no invitation email/token, wallet balance, bill amount, or bill title).
CREATE OR REPLACE FUNCTION public.audit_household_lifecycle_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $audit_function$
DECLARE
  v_actor_user_id uuid := auth.uid();
  v_household_id uuid;
  v_entity_id uuid;
  v_entity_type text;
  v_action text;
  v_details jsonb := '{}'::jsonb;
  v_changed_fields text[] := ARRAY[]::text[];
BEGIN
  IF TG_TABLE_NAME = 'households' THEN
    v_household_id := NEW.id;
    v_entity_id := NEW.id;
    v_entity_type := 'household';

    IF TG_OP = 'INSERT' THEN
      v_action := 'household.created';
      v_details := pg_catalog.jsonb_build_object(
        'status', NEW.status,
        'base_currency', NEW.base_currency
      );
    ELSE
      IF OLD.status IS DISTINCT FROM NEW.status THEN
        v_changed_fields := pg_catalog.array_append(v_changed_fields, 'status');
      END IF;
      IF OLD.name IS DISTINCT FROM NEW.name THEN
        v_changed_fields := pg_catalog.array_append(v_changed_fields, 'name');
      END IF;
      IF OLD.country IS DISTINCT FROM NEW.country THEN
        v_changed_fields := pg_catalog.array_append(v_changed_fields, 'country');
      END IF;
      IF OLD.base_currency IS DISTINCT FROM NEW.base_currency THEN
        v_changed_fields := pg_catalog.array_append(v_changed_fields, 'base_currency');
      END IF;

      IF COALESCE(pg_catalog.array_length(v_changed_fields, 1), 0) = 0 THEN
        RETURN NEW;
      END IF;

      IF OLD.status IS DISTINCT FROM NEW.status THEN
        v_action := 'household.status_changed';
        v_details := pg_catalog.jsonb_build_object(
          'changed_fields', pg_catalog.to_jsonb(v_changed_fields),
          'from_status', OLD.status,
          'to_status', NEW.status
        );
      ELSE
        v_action := 'household.settings_changed';
        v_details := pg_catalog.jsonb_build_object(
          'changed_fields', pg_catalog.to_jsonb(v_changed_fields)
        );
      END IF;
    END IF;

  ELSIF TG_TABLE_NAME = 'household_members' THEN
    v_household_id := NEW.household_id;
    v_entity_id := COALESCE(
      NULLIF(pg_catalog.to_jsonb(NEW) ->> 'id', '')::uuid,
      NEW.user_id
    );
    v_entity_type := 'household_member';

    IF TG_OP = 'INSERT' THEN
      v_action := 'household_member.added';
      v_details := pg_catalog.jsonb_build_object(
        'role', NEW.role,
        'status', NEW.status
      );
    ELSE
      IF OLD.role IS DISTINCT FROM NEW.role THEN
        v_changed_fields := pg_catalog.array_append(v_changed_fields, 'role');
      END IF;
      IF OLD.status IS DISTINCT FROM NEW.status THEN
        v_changed_fields := pg_catalog.array_append(v_changed_fields, 'status');
      END IF;

      IF COALESCE(pg_catalog.array_length(v_changed_fields, 1), 0) = 0 THEN
        RETURN NEW;
      END IF;

      v_action := 'household_member.updated';
      v_details := pg_catalog.jsonb_build_object(
        'changed_fields', pg_catalog.to_jsonb(v_changed_fields),
        'previous_role', OLD.role,
        'role', NEW.role,
        'previous_status', OLD.status,
        'status', NEW.status
      );
    END IF;

  ELSIF TG_TABLE_NAME = 'household_invitations' THEN
    v_household_id := NEW.household_id;
    v_entity_id := NEW.id;
    v_entity_type := 'household_invitation';

    IF TG_OP = 'INSERT' THEN
      v_action := 'household_invitation.created';
      v_details := pg_catalog.jsonb_build_object('status', NEW.status);
    ELSIF OLD.status IS DISTINCT FROM NEW.status THEN
      v_action := 'household_invitation.status_changed';
      v_details := pg_catalog.jsonb_build_object(
        'from_status', OLD.status,
        'to_status', NEW.status
      );
    ELSE
      RETURN NEW;
    END IF;

  ELSIF TG_TABLE_NAME = 'wallets' THEN
    v_household_id := NEW.household_id;
    v_entity_id := NEW.id;
    v_entity_type := 'wallet';

    IF TG_OP = 'INSERT' THEN
      v_action := 'wallet.created';
      v_details := pg_catalog.jsonb_build_object(
        'wallet_type', NEW.wallet_type,
        'status', NEW.status,
        'currency', NEW.currency
      );
    ELSE
      IF OLD.status IS DISTINCT FROM NEW.status THEN
        v_changed_fields := pg_catalog.array_append(v_changed_fields, 'status');
      END IF;
      IF OLD.wallet_type IS DISTINCT FROM NEW.wallet_type THEN
        v_changed_fields := pg_catalog.array_append(v_changed_fields, 'wallet_type');
      END IF;
      IF OLD.owner_user_id IS DISTINCT FROM NEW.owner_user_id THEN
        v_changed_fields := pg_catalog.array_append(v_changed_fields, 'owner_user_id');
      END IF;

      IF COALESCE(pg_catalog.array_length(v_changed_fields, 1), 0) = 0 THEN
        RETURN NEW;
      END IF;

      IF OLD.status IS DISTINCT FROM NEW.status THEN
        v_action := 'wallet.status_changed';
      ELSE
        v_action := 'wallet.access_configuration_changed';
      END IF;
      v_details := pg_catalog.jsonb_build_object(
        'changed_fields', pg_catalog.to_jsonb(v_changed_fields),
        'from_status', OLD.status,
        'to_status', NEW.status
      );
    END IF;

  ELSIF TG_TABLE_NAME = 'bills' THEN
    -- Bill creation is already audited by create_household_bill(); auditing only
    -- UPDATE here avoids a duplicate bill.created event. This catches payment
    -- status changes made by sync_bill_status_from_transaction().
    v_household_id := NEW.household_id;
    v_entity_id := NEW.id;
    v_entity_type := 'bill';

    IF TG_OP <> 'UPDATE' THEN
      RETURN NEW;
    END IF;

    IF OLD.status IS DISTINCT FROM NEW.status THEN
      v_changed_fields := pg_catalog.array_append(v_changed_fields, 'status');
    END IF;
    IF OLD.amount IS DISTINCT FROM NEW.amount THEN
      v_changed_fields := pg_catalog.array_append(v_changed_fields, 'amount');
    END IF;
    IF OLD.currency IS DISTINCT FROM NEW.currency THEN
      v_changed_fields := pg_catalog.array_append(v_changed_fields, 'currency');
    END IF;
    IF OLD.due_date IS DISTINCT FROM NEW.due_date THEN
      v_changed_fields := pg_catalog.array_append(v_changed_fields, 'due_date');
    END IF;
    IF OLD.recurrence IS DISTINCT FROM NEW.recurrence THEN
      v_changed_fields := pg_catalog.array_append(v_changed_fields, 'recurrence');
    END IF;

    IF COALESCE(pg_catalog.array_length(v_changed_fields, 1), 0) = 0 THEN
      RETURN NEW;
    END IF;

    IF OLD.status IS DISTINCT FROM NEW.status THEN
      v_action := 'bill.status_changed';
      v_details := pg_catalog.jsonb_build_object(
        'changed_fields', pg_catalog.to_jsonb(v_changed_fields),
        'from_status', OLD.status,
        'to_status', NEW.status
      );
    ELSE
      v_action := 'bill.details_changed';
      v_details := pg_catalog.jsonb_build_object(
        'changed_fields', pg_catalog.to_jsonb(v_changed_fields)
      );
    END IF;
  ELSE
    RAISE EXCEPTION 'Unsupported audit trigger table: %', TG_TABLE_NAME;
  END IF;

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
    v_household_id,
    v_actor_user_id,
    v_action,
    v_entity_type,
    v_entity_id,
    'success',
    COALESCE(v_details, '{}'::jsonb)
  );

  RETURN NEW;
END;
$audit_function$;

-- This function is invoked only through triggers, never as an API RPC.
REVOKE ALL ON FUNCTION public.audit_household_lifecycle_mutation()
  FROM PUBLIC, anon, authenticated;

-- Household and membership lifecycle: RPC calls emit the row changes; these
-- triggers audit only committed state changes inside the same transaction.
DROP TRIGGER IF EXISTS audit_households_lifecycle ON public.households;
CREATE TRIGGER audit_households_lifecycle
AFTER INSERT OR UPDATE ON public.households
FOR EACH ROW EXECUTE FUNCTION public.audit_household_lifecycle_mutation();

DROP TRIGGER IF EXISTS audit_household_members_lifecycle ON public.household_members;
CREATE TRIGGER audit_household_members_lifecycle
AFTER INSERT OR UPDATE ON public.household_members
FOR EACH ROW EXECUTE FUNCTION public.audit_household_lifecycle_mutation();

DROP TRIGGER IF EXISTS audit_household_invitations_lifecycle ON public.household_invitations;
CREATE TRIGGER audit_household_invitations_lifecycle
AFTER INSERT OR UPDATE ON public.household_invitations
FOR EACH ROW EXECUTE FUNCTION public.audit_household_lifecycle_mutation();

DROP TRIGGER IF EXISTS audit_wallets_lifecycle ON public.wallets;
CREATE TRIGGER audit_wallets_lifecycle
AFTER INSERT OR UPDATE ON public.wallets
FOR EACH ROW EXECUTE FUNCTION public.audit_household_lifecycle_mutation();

-- create_household_bill already emits bill.created; this trigger only covers
-- changes afterwards, including the status update from the payment transaction.
DROP TRIGGER IF EXISTS audit_bills_lifecycle ON public.bills;
CREATE TRIGGER audit_bills_lifecycle
AFTER UPDATE ON public.bills
FOR EACH ROW EXECUTE FUNCTION public.audit_household_lifecycle_mutation();

COMMIT;
