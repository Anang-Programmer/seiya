import type { SupabaseClient } from "@supabase/supabase-js";
import type { CreateBillInput, PayBillInput, UpsertBudgetInput } from "@/backend/validators/bill-budget";

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
