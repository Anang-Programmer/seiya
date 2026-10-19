import type { SupabaseClient } from "@supabase/supabase-js";
import type { CreateApprovalInput, ApprovalDecisionInput } from "@/backend/validators/approval";
import { getHouseholdRole, otherPartnerRole, recordHouseholdActivity } from "./activity.service";
import { checkUserPin, PIN_LOCKED_MESSAGE } from "./pin.service";

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
  // request_simulated_transaction already queues an approval for every pending
  // expense; a second request for the same transaction returns that row.
  if (input.type === "EXPENSE" && input.targetId) {
    const { data: existing } = await supabase
      .from("approvals")
      .select("*")
      .eq("household_id", householdId)
      .eq("type", "EXPENSE")
      .eq("target_id", input.targetId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing) {
      return { data: existing, error: null };
    }
  }

  const requesterRole = await getHouseholdRole(supabase, householdId, userId);
  const approverRole = otherPartnerRole(requesterRole);
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
      requester_role: requesterRole,
      approver_role: approverRole,
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
      actor: requesterRole,
      status: "NEED_APPROVAL",
      amount: input.amount,
      currency: input.currency,
      reason: input.reason || "Dual-Key signature required.",
    });
  }

  return { data, error };
}

const DECISION_ERRORS: Record<string, string> = {
  P0002: "P0002",
  "22023": "22023",
  "42501": "FORBIDDEN",
  P1001: "INSUFFICIENT_BALANCE",
};

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

  // A linked expense decided through /api/transactions/:id/decision has
  // already moved this row; repeating the same decision is a no-op.
  if (item.status === input.decision) {
    return {
      success: true,
      status: item.status,
      message: input.decision === "approved" ? "Request approved and executed successfully." : "Request declined.",
    };
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

  // Approving moves money or deletes shared data, so it always needs the
  // approver's PIN. Declining does not.
  if (input.decision === "approved") {
    if (!input.pin) {
      return { success: false, code: "PIN_REQUIRED", message: "Enter your 6-digit security PIN to approve." };
    }
    const pinCheck = await checkUserPin(supabase, userId, input.pin);
    if (pinCheck === "locked") {
      return { success: false, code: "PIN_LOCKED", message: PIN_LOCKED_MESSAGE };
    }
    if (pinCheck === "invalid") {
      return { success: false, code: "INVALID_PIN", message: "Invalid 6-digit security PIN." };
    }
  }

  // Status change, money movement (bill payment, expense execution), plan
  // deletion and the activity entry all happen atomically in the RPC.
  const { error } = await supabase.rpc("decide_household_approval", {
    p_approval_id: approvalId,
    p_decision: input.decision,
    p_reason: input.reason ?? null,
  });

  if (error) {
    const code = DECISION_ERRORS[error.code ?? ""] ?? "DB_ERROR";
    const message = code === "INSUFFICIENT_BALANCE"
      ? "Insufficient shared wallet balance to execute this request."
      : code === "DB_ERROR"
        ? "Failed to update approval status."
        : error.message || "Unable to decide this request.";
    return { success: false, code, message };
  }

  return input.decision === "approved"
    ? { success: true, status: "approved", message: "Request approved and executed successfully." }
    : { success: true, status: "declined", message: "Request declined." };
}
