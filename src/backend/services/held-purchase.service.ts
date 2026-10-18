import type { SupabaseClient } from "@supabase/supabase-js";
import type { CreateHeldPurchaseInput } from "@/backend/validators/held-purchase";
import { recordHouseholdActivity } from "./activity.service";

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
  const { data, error } = await supabase
    .from("held_purchases")
    .insert({
      household_id: householdId,
      title: input.title,
      amount: input.amount,
      currency: input.currency,
      wallet: input.wallet,
      requester_id: userId,
      requester_role: input.requesterRole,
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
      actor: input.requesterRole,
      status: "HOLD",
      amount: input.amount,
      currency: input.currency,
      reason: input.reason || "Cooling-off safeguard triggered.",
    });
  }

  return { data, error };
}

export async function continueHouseholdHeldPurchase(
  supabase: SupabaseClient,
  householdId: string,
  userId: string,
  heldId: string
) {
  const { data: item, error: findError } = await supabase
    .from("held_purchases")
    .select("*")
    .eq("household_id", householdId)
    .eq("id", heldId)
    .maybeSingle();

  if (findError || !item) {
    return { success: false, message: "Held purchase not found." };
  }

  const { data: ruleRow } = await supabase
    .from("household_finance_rules")
    .select("rules")
    .eq("household_id", householdId)
    .eq("status", "active")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const rules = (ruleRow?.rules && typeof ruleRow.rules === "object"
    ? (ruleRow.rules as Record<string, unknown>)
    : {}) as {
    approval?: { sharedWalletThreshold?: unknown; requirePartnerApprovalAboveThreshold?: unknown };
  };
  const threshold = Number(rules?.approval?.sharedWalletThreshold) || 500000;
  const requireApproval = Boolean(rules?.approval?.requirePartnerApprovalAboveThreshold ?? true);

  if (item.wallet === "shared" && requireApproval && Number(item.amount) >= threshold) {
    await supabase.from("held_purchases").delete().eq("id", heldId);

    const { data: members } = await supabase
      .from("household_members")
      .select("user_id")
      .eq("household_id", householdId)
      .eq("status", "active");

    const partner = (members ?? []).find((m) => m.user_id !== userId);

    const { data: approval } = await supabase
      .from("approvals")
      .insert({
        household_id: householdId,
        title: item.title,
        amount: item.amount,
        currency: item.currency,
        wallet: item.wallet,
        requester_id: userId,
        requester_role: item.requester_role || "partner_a",
        approver_id: partner?.user_id ?? null,
        approver_role: item.requester_role === "partner_a" ? "partner_b" : "partner_a",
        status: "pending",
        reason: "User confirmed held item; secondary gateway check routed to partner approval.",
        category: "Expenses",
        type: "EXPENSE",
        expires_in_hours: 24,
      })
      .select()
      .single();

    await recordHouseholdActivity(supabase, householdId, {
      title: `Approval Dispatched: ${item.title}`,
      category: "Safeguard",
      actor: item.requester_role || "partner_a",
      status: "NEED_APPROVAL",
      amount: item.amount,
      currency: item.currency,
      reason: "Held purchase confirmed by user and forwarded for partner consent.",
    });

    return {
      success: true,
      outcome: "NEED_APPROVAL",
      approval,
      message: "Held purchase routed to partner approval.",
    };
  }

  await supabase.from("held_purchases").delete().eq("id", heldId);

  if (item.wallet === "shared") {
    const { data: sharedWallet } = await supabase
      .from("wallets")
      .select("id, simulated_balance")
      .eq("household_id", householdId)
      .eq("wallet_type", "shared")
      .maybeSingle();

    if (sharedWallet) {
      await supabase
        .from("wallets")
        .update({
          simulated_balance: Math.max(0, Number(sharedWallet.simulated_balance) - Number(item.amount)),
        })
        .eq("id", sharedWallet.id);
    }
  }

  await recordHouseholdActivity(supabase, householdId, {
    title: `${item.title} Confirmed after Cooldown`,
    category: "Safeguard",
    actor: item.requester_role || "partner_a",
    status: "ALLOW",
    amount: item.amount,
    currency: item.currency,
    reason: "Secondary confirmation verified through cooling-off gateway.",
  });

  return {
    success: true,
    outcome: "ALLOW",
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
      actor: "partner_a",
      status: "INFO",
      reason: "Cancelled by user after cooling-off review.",
    });
  }

  return { success: !error, error };
}
