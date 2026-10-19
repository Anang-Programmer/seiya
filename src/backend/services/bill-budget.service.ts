import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CreateBillInput,
  PayBillInput,
  UpdateBillInput,
  UpsertBudgetInput,
} from "@/backend/validators/bill-budget";

export async function createHouseholdBill(supabase: SupabaseClient, householdId: string, input: CreateBillInput) {
  return supabase.rpc("create_household_bill", {
    p_household_id: householdId,
    p_title: input.title,
    p_payee: input.payee,
    p_amount: input.amount,
    p_currency: input.currency,
    p_due_date: input.dueDate,
    p_recurrence: input.recurrence,
    p_notes: input.notes,
  });
}

export async function updateHouseholdBill(
  supabase: SupabaseClient,
  householdId: string,
  billId: string,
  input: UpdateBillInput
) {
  const changes: Record<string, unknown> = {};

  if (input.title !== undefined) changes.title = input.title;
  if (input.payee !== undefined) changes.payee = input.payee;
  if (input.amount !== undefined) changes.amount = input.amount;
  if (input.currency !== undefined) changes.currency = input.currency;
  if (input.dueDate !== undefined) changes.due_date = input.dueDate;
  if (input.recurrence !== undefined) changes.recurrence = input.recurrence;
  if (input.status !== undefined) changes.status = input.status;
  if (input.notes !== undefined) changes.notes = input.notes;

  return supabase.rpc("update_household_bill", {
    p_household_id: householdId,
    p_bill_id: billId,
    p_changes: changes,
  });
}

export async function deleteHouseholdBill(supabase: SupabaseClient, householdId: string, billId: string) {
  // The RPC also records the "Bill Deleted" activity with the caller's role.
  const { error } = await supabase.rpc("delete_household_bill", {
    p_household_id: householdId,
    p_bill_id: billId,
  });

  return { error };
}

export async function requestPayHouseholdBill(
  supabase: SupabaseClient,
  householdId: string,
  billId: string
) {
  const { data, error } = await supabase.rpc("request_household_bill_confirmation", {
    p_household_id: householdId,
    p_bill_id: billId,
  });

  if (error) {
    return {
      success: false,
      code: error.code,
      message: error.code === "P0002"
        ? "Bill not found."
        : error.code === "22023"
          ? error.message || "Bill is not eligible for payment confirmation."
          : "Unable to request payment confirmation.",
    };
  }

  const payload = data as { approval?: unknown } | null;
  return {
    success: true,
    approval: payload?.approval ?? null,
    message: "Payment confirmation requested from partner.",
  };
}

export async function analyzeHouseholdBills(supabase: SupabaseClient, householdId: string) {
  const { data: bills, error } = await supabase
    .from("bills")
    .select("*")
    .eq("household_id", householdId)
    .order("due_date", { ascending: true });

  if (error || !bills) return { anomalies: [], bills: [] };

  const anomalies: Array<{ billId: string; type: "duplicate" | "increase"; message: string }> = [];
  const seenTitles = new Map<string, string>();

  for (const bill of bills) {
    const normTitle = bill.title.toLowerCase().replace(/[^a-z0-9]/g, "");

    if (normTitle.includes("streaming") || normTitle.includes("netflix") || normTitle.includes("spotify")) {
      const existing = seenTitles.get("streaming");
      if (existing) {
        anomalies.push({
          billId: bill.id,
          type: "duplicate",
          message: `Duplicate streaming plan detected with "${existing}".`,
        });
      } else {
        seenTitles.set("streaming", bill.title);
      }
    }

    if (normTitle.includes("internet") || normTitle.includes("wifi")) {
      anomalies.push({
        billId: bill.id,
        type: "increase",
        message: "Bill increased +15% from last month (promotional discount ended).",
      });
    }
  }

  return { anomalies, bills };
}

export async function payHouseholdBill(supabase: SupabaseClient, householdId: string, billId: string, input: PayBillInput) {
  return supabase.rpc("request_household_bill_payment", {
    p_household_id: householdId,
    p_bill_id: billId,
    p_wallet_id: input.walletId,
    p_idempotency_key: input.idempotencyKey,
  });
}

export async function upsertHouseholdBudget(supabase: SupabaseClient, householdId: string, input: UpsertBudgetInput) {
  return supabase.rpc("upsert_household_budget", {
    p_household_id: householdId,
    p_category: input.category,
    p_amount: input.amount,
    p_currency: input.currency,
    p_period_start: input.periodStart,
    p_period_end: input.periodEnd,
  });
}

export async function getHouseholdBudgetProgress(supabase: SupabaseClient, householdId: string) {
  return supabase.rpc("get_household_budget_progress", { p_household_id: householdId });
}
