import type { SupabaseClient } from "@supabase/supabase-js";
import type { CreatePlanInput, UpdatePlanInput } from "@/backend/validators/plan";
import { getHouseholdRole, otherPartnerRole, recordHouseholdActivity, type PartnerRole, type RpcError } from "./activity.service";

export async function listHouseholdPlans(supabase: SupabaseClient, householdId: string) {
  return supabase
    .from("plans")
    .select("*")
    .eq("household_id", householdId)
    .order("created_at", { ascending: false });
}

export async function getHouseholdPlan(supabase: SupabaseClient, householdId: string, planId: string) {
  return supabase
    .from("plans")
    .select("*")
    .eq("household_id", householdId)
    .eq("id", planId)
    .maybeSingle();
}

export async function createHouseholdPlan(
  supabase: SupabaseClient,
  householdId: string,
  userId: string,
  input: CreatePlanInput
) {
  const { data, error } = await supabase
    .from("plans")
    .insert({
      household_id: householdId,
      created_by: userId,
      title: input.title,
      category: input.category,
      target_amount: input.targetAmount,
      current_amount: input.currentAmount,
      currency: input.currency,
      target_date: input.targetDate,
      recommended_monthly: input.recommendedMonthly,
      split_partner_b: input.splitPartnerB,
      split_partner_a: input.splitPartnerA,
      wallet_funding: input.walletFunding,
      status: input.status,
      assumptions: input.assumptions,
    })
    .select()
    .single();

  if (!error && data) {
    await recordHouseholdActivity(supabase, householdId, {
      title: `New Goal Added: ${input.title}`,
      category: "Plan",
      status: "INFO",
      amount: input.targetAmount,
      currency: input.currency,
      reason: `Financial goal "${input.title}" created targeting ${input.targetDate}.`,
    });
  }

  return { data, error };
}

export interface PlanRow {
  id: string;
  household_id: string;
  title: string;
  category: string;
  target_amount: number | string;
  current_amount: number | string;
  currency: string;
  target_date: string;
  recommended_monthly: number | string;
  split_partner_a: number | string;
  split_partner_b: number | string;
  wallet_funding: string;
  status: string;
  assumptions: string | null;
  created_at?: string;
  updated_at?: string;
}

// split_partner_a/b hold the ratio as percentages; the app shows each
// partner's share of recommended_monthly (A rounded, B the remainder, as the
// goal dialogs compute it).
export function toApiPlan(row: PlanRow) {
  const monthly = Number(row.recommended_monthly) || 0;
  const a = Number(row.split_partner_a) || 0;
  const b = Number(row.split_partner_b) || 0;
  const shareA = a + b > 0 ? a / (a + b) : 0.5;
  const partnerA = Math.round(monthly * shareA);
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    targetAmount: Number(row.target_amount),
    currentAmount: Number(row.current_amount),
    currency: row.currency,
    targetDate: row.target_date,
    recommendedMonthly: monthly,
    splitRecommendation: { partnerB: monthly - partnerA, partnerA },
    splitPercent: { partnerB: b, partnerA: a },
    walletFunding: row.wallet_funding,
    status: row.status,
    assumptions: row.assumptions,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// update_household_plan applies solo fields (title, contributions, dates,
// notes, status other than Archived) at once. Target, currency, split ratio and
// archiving become a GOAL approval for the partner (pendingApprovalId), unless
// there is no partner yet or the caller is still drafting their own goal.
export async function updateHouseholdPlan(
  supabase: SupabaseClient,
  householdId: string,
  planId: string,
  input: UpdatePlanInput
): Promise<{ data: PlanRow | null; pendingApprovalId: string | null; error: RpcError }> {
  const { data: existing } = await getHouseholdPlan(supabase, householdId, planId);
  if (!existing) {
    return { data: null, pendingApprovalId: null, error: { code: "P0002", message: "Goal not found." } };
  }

  const payload: Record<string, unknown> = {};

  if (input.title !== undefined) payload.title = input.title;
  if (input.category !== undefined) payload.category = input.category;
  if (input.targetAmount !== undefined) payload.target_amount = input.targetAmount;
  if (input.currentAmount !== undefined) payload.current_amount = input.currentAmount;
  if (input.currency !== undefined) payload.currency = input.currency;
  if (input.targetDate !== undefined) payload.target_date = input.targetDate;
  if (input.recommendedMonthly !== undefined) payload.recommended_monthly = input.recommendedMonthly;
  if (input.splitPartnerB !== undefined) payload.split_partner_b = input.splitPartnerB;
  if (input.splitPartnerA !== undefined) payload.split_partner_a = input.splitPartnerA;
  if (input.walletFunding !== undefined) payload.wallet_funding = input.walletFunding;
  if (input.status !== undefined) payload.status = input.status;
  if (input.assumptions !== undefined) payload.assumptions = input.assumptions;

  const { data, error } = await supabase.rpc("update_household_plan", {
    p_plan_id: planId,
    p_changes: payload,
  });

  const result = data as { plan?: PlanRow; pending_approval_id?: string | null } | null;
  if (error || !result?.plan) {
    return { data: null, pendingApprovalId: null, error: error ?? { message: "Unable to update goal." } };
  }

  return { data: result.plan, pendingApprovalId: result.pending_approval_id ?? null, error: null };
}

export async function requestDeleteHouseholdPlan(
  supabase: SupabaseClient,
  householdId: string,
  userId: string,
  planId: string,
  partnerAPin?: string,
  partnerBPin?: string
) {
  const { data: plan, error: planError } = await getHouseholdPlan(supabase, householdId, planId);
  if (planError || !plan) {
    return { success: false, message: "Goal not found." };
  }

  if (partnerAPin && partnerBPin) {
    // Both PINs are checked against user_pins inside the RPC, which also
    // deletes the goal and records the activity atomically.
    const { data, error } = await supabase.rpc("dual_key_delete_household_plan", {
      p_household_id: householdId,
      p_plan_id: planId,
      p_partner_a_pin: partnerAPin,
      p_partner_b_pin: partnerBPin,
    });

    if (error) {
      return {
        success: false,
        message: error.code === "P0002" ? "Goal not found." : error.message || "Unable to dissolve this goal.",
      };
    }

    const result = data as { ok?: boolean; reason?: string } | null;
    if (!result?.ok) {
      return {
        success: false,
        code: result?.reason === "locked" ? "PIN_LOCKED" : "INVALID_PIN",
        message: result?.reason === "locked"
          ? "Too many incorrect PIN attempts. Try again in 15 minutes."
          : "One or both security PINs are incorrect.",
      };
    }

    return { success: true, requiresApproval: false, message: "Goal dissolved via Dual-Key consensus." };
  }

  const requesterRole: PartnerRole = await getHouseholdRole(supabase, householdId, userId);

  const { data: existingApproval } = await supabase
    .from("approvals")
    .select("*")
    .eq("household_id", householdId)
    .eq("type", "PLAN_DELETE")
    .eq("target_id", planId)
    .eq("status", "pending")
    .limit(1)
    .maybeSingle();

  if (existingApproval) {
    return {
      success: true,
      requiresApproval: true,
      approval: existingApproval,
      message: "Approval request already waiting for your partner.",
    };
  }

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
      title: `Delete Goal: ${plan.title}`,
      amount: plan.target_amount,
      currency: plan.currency,
      wallet: "shared",
      requester_id: userId,
      requester_role: requesterRole,
      approver_id: partner?.user_id ?? null,
      approver_role: otherPartnerRole(requesterRole),
      status: "pending",
      reason: `Request to dissolve collaborative goal "${plan.title}". Requires partner dual-key PIN signature.`,
      category: "Plans",
      type: "PLAN_DELETE",
      target_id: planId,
      expires_in_hours: 48,
    })
    .select()
    .single();

  if (apprError) {
    return { success: false, message: "Failed to dispatch approval request." };
  }

  await recordHouseholdActivity(supabase, householdId, {
    title: `Goal Deletion Proposed: ${plan.title}`,
    category: "Plans",
    status: "NEED_APPROVAL",
    amount: plan.target_amount,
    currency: plan.currency,
    reason: `Requested to dissolve "${plan.title}". Awaiting partner's dual-key approval.`,
  });

  return { success: true, requiresApproval: true, approval, message: "Approval request dispatched to partner." };
}
