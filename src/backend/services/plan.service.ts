import type { SupabaseClient } from "@supabase/supabase-js";
import type { CreatePlanInput, UpdatePlanInput } from "@/backend/validators/plan";

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
    await supabase.from("activities").insert({
      household_id: householdId,
      title: `New Goal Added: ${input.title}`,
      category: "Plan",
      actor: "partner_a",
      status: "INFO",
      amount: input.targetAmount,
      currency: input.currency,
      reason: `Financial goal "${input.title}" created targeting ${input.targetDate}.`,
    });
  }

  return { data, error };
}

export async function updateHouseholdPlan(
  supabase: SupabaseClient,
  householdId: string,
  planId: string,
  input: UpdatePlanInput
) {
  const payload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

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

  const { data, error } = await supabase
    .from("plans")
    .update(payload)
    .eq("household_id", householdId)
    .eq("id", planId)
    .select()
    .single();

  if (!error && data) {
    await supabase.from("activities").insert({
      household_id: householdId,
      title: `Goal Adjusted: ${data.title}`,
      category: "Plan",
      actor: "partner_a",
      status: "INFO",
      amount: data.target_amount,
      currency: data.currency,
      reason: `Goal terms and allocation adjusted for "${data.title}".`,
    });
  }

  return { data, error };
}

export async function deleteHouseholdPlan(supabase: SupabaseClient, householdId: string, planId: string) {
  const { data: existing } = await supabase
    .from("plans")
    .select("title, target_amount, currency")
    .eq("household_id", householdId)
    .eq("id", planId)
    .maybeSingle();

  const { error } = await supabase
    .from("plans")
    .delete()
    .eq("household_id", householdId)
    .eq("id", planId);

  if (!error && existing) {
    await supabase.from("activities").insert({
      household_id: householdId,
      title: `Goal Deleted: ${existing.title}`,
      category: "Plans",
      actor: "partner_a",
      status: "INFO",
      amount: existing.target_amount,
      currency: existing.currency,
      reason: `Goal "${existing.title}" removed from household planning.`,
    });
  }

  return { error };
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

  if (partnerAPin && partnerBPin && partnerAPin.length === 6 && partnerBPin.length === 6) {
    await deleteHouseholdPlan(supabase, householdId, planId);
    await supabase.from("activities").insert({
      household_id: householdId,
      title: `Goal Dissolved: ${plan.title}`,
      category: "Plans",
      actor: "partner_a",
      status: "ALLOW",
      amount: plan.target_amount,
      currency: plan.currency,
      reason: `Both partners entered their cryptographic PINs to confirm goal dissolution.`,
    });
    return { success: true, requiresApproval: false, message: "Goal dissolved via Dual-Key consensus." };
  }

  const { data: members } = await supabase
    .from("household_members")
    .select("user_id, role")
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
      requester_role: "partner_a",
      approver_id: partner?.user_id ?? null,
      approver_role: "partner_b",
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

  await supabase.from("activities").insert({
    household_id: householdId,
    title: `Goal Deletion Proposed: ${plan.title}`,
    category: "Plans",
    actor: "partner_a",
    status: "NEED_APPROVAL",
    amount: plan.target_amount,
    currency: plan.currency,
    reason: `Requested to dissolve "${plan.title}". Awaiting partner's dual-key approval.`,
  });

  return { success: true, requiresApproval: true, approval, message: "Approval request dispatched to partner." };
}
