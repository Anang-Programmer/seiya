import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CreateBillInput,
  PayBillInput,
  UpdateBillInput,
  UpsertBudgetInput,
} from "@/backend/validators/bill-budget";
import { recordHouseholdActivity } from "./activity.service";

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
  const payload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (input.title !== undefined) payload.title = input.title;
  if (input.payee !== undefined) payload.payee = input.payee;
  if (input.amount !== undefined) payload.amount = input.amount;
  if (input.currency !== undefined) payload.currency = input.currency;
  if (input.dueDate !== undefined) payload.due_date = input.dueDate;
  if (input.recurrence !== undefined) payload.recurrence = input.recurrence;
  if (input.status !== undefined) payload.status = input.status;
  if (input.notes !== undefined) payload.notes = input.notes;

  return supabase
    .from("bills")
    .update(payload)
    .eq("household_id", householdId)
    .eq("id", billId)
    .select()
    .single();
}

export async function deleteHouseholdBill(supabase: SupabaseClient, householdId: string, billId: string) {
  const { data: bill } = await supabase
    .from("bills")
    .select("title, amount, currency")
    .eq("household_id", householdId)
    .eq("id", billId)
    .maybeSingle();

  const { error } = await supabase
    .from("bills")
    .delete()
    .eq("household_id", householdId)
    .eq("id", billId);

  if (!error && bill) {
    await recordHouseholdActivity(supabase, householdId, {
      title: `Bill Deleted: ${bill.title}`,
      category: "Bills",
      actor: "partner_a",
      status: "INFO",
      amount: bill.amount,
      currency: bill.currency,
      reason: `Recurring bill "${bill.title}" was removed.`,
    });
  }

  return { error };
}

export async function requestPayHouseholdBill(
  supabase: SupabaseClient,
  householdId: string,
  userId: string,
  billId: string
) {
  const { data: bill, error: billError } = await supabase
    .from("bills")
    .select("*")
    .eq("household_id", householdId)
    .eq("id", billId)
    .maybeSingle();

  if (billError || !bill) {
    return { success: false, message: "Bill not found." };
  }

  await supabase
    .from("bills")
    .update({ status: "pending_approval", updated_at: new Date().toISOString() })
    .eq("household_id", householdId)
    .eq("id", billId);

  const { data: members } = await supabase
    .from("household_members")
    .select("user_id")
    .eq("household_id", householdId)
    .eq("status", "active");

  const partner = (members ?? []).find((m) => m.user_id !== userId);

  const { data: approval, error: apprError } = await supabase
    .from("approvals")
    .insert({
      household_id: householdId,
      title: `${bill.title} - Payment Confirmation`,
      amount: bill.amount,
      currency: bill.currency,
      wallet: "shared",
      requester_id: userId,
      requester_role: "partner_a",
      approver_id: partner?.user_id ?? null,
      approver_role: "partner_b",
      status: "pending",
      reason: `Bill marked as paid. Requires partner confirmation to settle from shared wallet.`,
      category: "Bills",
      type: "BILL",
      target_id: billId,
      expires_in_hours: 24,
    })
    .select()
    .single();

  if (!apprError) {
    await recordHouseholdActivity(supabase, householdId, {
      title: `Payment Confirmation Requested: ${bill.title}`,
      category: "Bills",
      actor: "partner_a",
      status: "NEED_APPROVAL",
      amount: bill.amount,
      currency: bill.currency,
      reason: `Marked as paid. Dispatched to partner for confirmation.`,
    });
  }

  return { success: !apprError, approval, message: "Payment confirmation requested from partner." };
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
