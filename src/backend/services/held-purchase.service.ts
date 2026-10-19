import type { SupabaseClient } from "@supabase/supabase-js";
import type { CreateHeldPurchaseInput } from "@/backend/validators/held-purchase";
import { getHouseholdRole, recordHouseholdActivity } from "./activity.service";

export async function listHouseholdHeldPurchases(supabase: SupabaseClient, householdId: string) {
  return supabase
    .from("held_purchases")
    .select("*")
    .eq("household_id", householdId)
    .eq("status", "held")
    .order("created_at", { ascending: false });
}

export async function createHouseholdHeldPurchase(
  supabase: SupabaseClient,
  householdId: string,
  userId: string,
  input: CreateHeldPurchaseInput
) {
  const requesterRole = await getHouseholdRole(supabase, householdId, userId);

  const { data, error } = await supabase
    .from("held_purchases")
    .insert({
      household_id: householdId,
      title: input.title,
      amount: input.amount,
      currency: input.currency,
      wallet: input.wallet,
      requester_id: userId,
      requester_role: requesterRole,
      status: "held",
      hold_until: input.holdUntil,
      reason: input.reason,
    })
    .select()
    .single();

  if (!error && data) {
    await recordHouseholdActivity(supabase, householdId, {
      title: `Expense Held by Safeguard: ${input.title}`,
      category: "Safeguard",
      actor: requesterRole,
      status: "HOLD",
      amount: input.amount,
      currency: input.currency,
      reason: input.reason || "Cooling-off safeguard triggered.",
    });
  }

  return { data, error };
}

const CONTINUE_ERRORS: Record<string, string> = {
  P0002: "Held purchase not found.",
  "42501": "Only the member who requested this purchase can continue it.",
  P1001: "Insufficient available simulated balance.",
  P1002: "The active finance agreement has invalid transaction settings.",
};

// The RPC releases the hold and records the expense in the ledger: executed
// directly (ALLOW) or as a pending transaction queued for the partner
// (NEED_APPROVAL). Callers must not record the expense a second time.
export async function continueHouseholdHeldPurchase(
  supabase: SupabaseClient,
  heldId: string
) {
  const { data, error } = await supabase.rpc("continue_held_purchase", { p_held_id: heldId });

  if (error) {
    return {
      success: false,
      code: error.code,
      message: CONTINUE_ERRORS[error.code ?? ""] ?? (error.code === "22023" ? error.message : "Unable to continue this purchase."),
    };
  }

  const payload = data as { outcome?: string; transaction?: unknown; approval?: unknown } | null;

  if (payload?.outcome === "NEED_APPROVAL") {
    return {
      success: true,
      outcome: "NEED_APPROVAL",
      approval: payload.approval ?? null,
      transaction: payload.transaction ?? null,
      message: "Held purchase routed to partner approval.",
    };
  }

  return {
    success: true,
    outcome: "ALLOW",
    transaction: payload?.transaction ?? null,
    message: "Purchase confirmed and debited after cooling-off review.",
  };
}

export async function cancelHouseholdHeldPurchase(
  supabase: SupabaseClient,
  householdId: string,
  userId: string,
  heldId: string
) {
  const { data: item } = await supabase
    .from("held_purchases")
    .select("title")
    .eq("household_id", householdId)
    .eq("id", heldId)
    .maybeSingle();

  const { error } = await supabase
    .from("held_purchases")
    .delete()
    .eq("household_id", householdId)
    .eq("id", heldId);

  if (!error) {
    await recordHouseholdActivity(supabase, householdId, {
      title: `Held Purchase Cancelled: ${item?.title || "Item"}`,
      category: "Safeguard",
      actor: await getHouseholdRole(supabase, householdId, userId),
      status: "INFO",
      reason: "Cancelled by user after cooling-off review.",
    });
  }

  return { success: !error, error };
}
