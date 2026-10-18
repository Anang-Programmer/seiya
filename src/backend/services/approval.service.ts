import type { SupabaseClient } from "@supabase/supabase-js";
import type { CreateApprovalInput, ApprovalDecisionInput } from "@/backend/validators/approval";
import { recordHouseholdActivity } from "./activity.service";
import { verifyUserPin } from "./pin.service";

export async function listHouseholdApprovals(supabase: SupabaseClient, householdId: string) {
  return supabase
    .from("approvals")
    .select("*")
    .eq("household_id", householdId)
    .order("created_at", { ascending: false });
}

export async function createHouseholdApproval(
  supabase: SupabaseClient,
  householdId: string,
  userId: string,
  input: CreateApprovalInput
) {
  const expiresInHours = input.expiresInHours || 24;
  const expiresAt = new Date(Date.now() + expiresInHours * 3600 * 1000).toISOString();

  const { data, error } = await supabase
    .from("approvals")
    .insert({
      household_id: householdId,
      title: input.title,
      amount: input.amount,
      currency: input.currency,
      wallet: input.wallet,
      requester_id: userId,
      requester_role: input.requesterRole,
      approver_role: input.approverRole,
      category: input.category,
      type: input.type,
      target_id: input.targetId || null,
      notes: input.notes || null,
      reason: input.reason,
      status: "pending",
      expires_in_hours: expiresInHours,
      expires_at: expiresAt,
    })
    .select()
    .single();

  if (!error && data) {
    await recordHouseholdActivity(supabase, householdId, {
      title: `Approval Requested: ${input.title}`,
      category: input.category || "Approval Request",
      actor: input.requesterRole,
      status: "NEED_APPROVAL",
      amount: input.amount,
      currency: input.currency,
      reason: input.reason || "Dual-Key signature required.",
    });
  }

  return { data, error };
}

export async function decideApprovalRequest(
  supabase: SupabaseClient,
  householdId: string,
  userId: string,
  approvalId: string,
  input: ApprovalDecisionInput
) {
  const { data: item, error: fetchError } = await supabase
    .from("approvals")
    .select("*")
    .eq("household_id", householdId)
    .eq("id", approvalId)
    .maybeSingle();

  if (fetchError || !item) {
    return { success: false, code: "P0002", message: "Approval request not found." };
  }

  if (item.status !== "pending") {
    return { success: false, code: "22023", message: `This request is already ${item.status}.` };
  }

  if (input.decision === "approved" && item.requester_id === userId) {
    return {
      success: false,
      code: "SELF_APPROVAL",
      message: "Security Rule: A requester cannot approve their own financial request.",
    };
  }

  if (input.pin) {
    const pinValid = await verifyUserPin(supabase, userId, input.pin);
    if (!pinValid) {
      return { success: false, code: "INVALID_PIN", message: "Invalid 6-digit security PIN." };
    }
  }

  const newStatus = input.decision === "approved" ? "approved" : "declined";

  const { error: updateError } = await supabase
    .from("approvals")
    .update({
      status: newStatus,
      approver_id: userId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", approvalId);

  if (updateError) {
    return { success: false, code: "DB_ERROR", message: "Failed to update approval status." };
  }

  if (newStatus === "approved") {
    if (item.type === "BILL" || item.category === "Bills") {
      if (item.target_id) {
        await supabase
          .from("bills")
          .update({ status: "paid", updated_at: new Date().toISOString() })
          .eq("household_id", householdId)
          .eq("id", item.target_id);
      }
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
    } else if (item.type === "PLAN_DELETE" || item.category === "Plans") {
      if (item.target_id) {
        await supabase
          .from("plans")
          .delete()
          .eq("household_id", householdId)
          .eq("id", item.target_id);
      }
    } else if (item.type === "EXPENSE" || item.category === "Expenses") {
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
    }

    await recordHouseholdActivity(supabase, householdId, {
      title: `${item.title} Approved & Executed`,
      category: item.category || "Approval",
      actor: item.approver_role || "partner_b",
      status: "ALLOW",
      amount: item.amount,
      currency: item.currency,
      reason: `Dual-Key signature verified. Action executed.`,
    });

    return { success: true, status: "approved", message: "Request approved and executed successfully." };
  }

  if (item.type === "BILL" || item.category === "Bills") {
    if (item.target_id) {
      await supabase
        .from("bills")
        .update({ status: "upcoming", updated_at: new Date().toISOString() })
        .eq("household_id", householdId)
        .eq("id", item.target_id);
    }
  }

  await recordHouseholdActivity(supabase, householdId, {
    title: `${item.title} Declined`,
    category: item.category || "Approval",
    actor: item.approver_role || "partner_b",
    status: "DENY",
    amount: item.amount,
    currency: item.currency,
    reason: input.reason || "Action rejected under mutual veto power.",
  });

  return { success: true, status: "declined", message: "Request declined." };
}
