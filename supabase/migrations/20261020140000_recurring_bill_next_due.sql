-- Seiya: paying a recurring bill schedules its next occurrence.
--
-- A monthly bill that was paid stayed "paid" with this month's due date, so
-- the reminder for next month never appeared. When a weekly, monthly or
-- yearly bill becomes paid, the next bill (same title, payee, amount,
-- currency and recurrence) is created as "upcoming" one period later.
-- Paying the same bill again (e.g. after an undo) never creates a duplicate.

CREATE OR REPLACE FUNCTION public.schedule_next_recurring_bill()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_next_due date;
BEGIN
  IF NEW.status <> 'paid' OR OLD.status = 'paid' OR NEW.recurrence = 'none' THEN
    RETURN NEW;
  END IF;

  v_next_due := CASE NEW.recurrence
    WHEN 'weekly' THEN NEW.due_date + 7
    WHEN 'monthly' THEN (NEW.due_date + interval '1 month')::date
    WHEN 'yearly' THEN (NEW.due_date + interval '1 year')::date
  END;

  IF v_next_due IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.bills b
    WHERE b.household_id = NEW.household_id
      AND b.title = NEW.title
      AND b.recurrence = NEW.recurrence
      AND b.due_date = v_next_due
      AND b.status <> 'cancelled'
  ) THEN
    INSERT INTO public.bills (
      household_id, created_by, title, payee, amount, currency,
      due_date, recurrence, status, notes
    ) VALUES (
      NEW.household_id, NEW.created_by, NEW.title, NEW.payee, NEW.amount, NEW.currency,
      v_next_due, NEW.recurrence, 'upcoming', NEW.notes
    );
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.schedule_next_recurring_bill() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS bills_schedule_next_recurring ON public.bills;
CREATE TRIGGER bills_schedule_next_recurring
  AFTER UPDATE OF status ON public.bills
  FOR EACH ROW
  WHEN (NEW.status = 'paid' AND OLD.status IS DISTINCT FROM 'paid')
  EXECUTE FUNCTION public.schedule_next_recurring_bill();
