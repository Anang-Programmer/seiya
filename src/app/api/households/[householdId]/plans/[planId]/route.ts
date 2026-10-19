import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { validateUpdatePlan } from "@/backend/validators/plan";
import {
  getHouseholdPlan,
  updateHouseholdPlan,
} from "@/backend/services/plan.service";

type RouteContext = { params: Promise<{ householdId: string; planId: string }> };
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_request: Request, context: RouteContext) {
  const { householdId, planId } = await context.params;
  if (!UUID_PATTERN.test(householdId) || !UUID_PATTERN.test(planId)) {
    return NextResponse.json({ success: false, message: "Invalid parameters." }, { status: 400 });
  }

  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, message: "Login required." }, { status: 401 });
    }

    const { data: plan, error } = await getHouseholdPlan(supabase, householdId, planId);
    if (error || !plan) {
      return NextResponse.json({ success: false, message: "Goal not found." }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      plan: {
        id: plan.id,
        title: plan.title,
        category: plan.category,
        targetAmount: Number(plan.target_amount),
        currentAmount: Number(plan.current_amount),
        currency: plan.currency,
        targetDate: plan.target_date,
        recommendedMonthly: Number(plan.recommended_monthly),
        splitRecommendation: {
          partnerB: Number(plan.split_partner_b),
          partnerA: Number(plan.split_partner_a),
        },
        walletFunding: plan.wallet_funding,
        status: plan.status,
        assumptions: plan.assumptions,
      },
    });
  } catch (error) {
    console.error("[plans/get] Unexpected error:", error);
    return NextResponse.json({ success: false, message: "An unexpected error occurred." }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const { householdId, planId } = await context.params;
  if (!UUID_PATTERN.test(householdId) || !UUID_PATTERN.test(planId)) {
    return NextResponse.json({ success: false, message: "Invalid parameters." }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON body." }, { status: 400 });
  }

  const validation = validateUpdatePlan(body);
  if (!validation.ok) {
    return NextResponse.json({ success: false, message: validation.message }, { status: 400 });
  }

  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, message: "Login required." }, { status: 401 });
    }

    const { data: plan, error } = await updateHouseholdPlan(supabase, householdId, planId, validation.data, user.id);
    if (error) {
      return NextResponse.json({ success: false, message: "Unable to update goal." }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: "Goal updated successfully.",
      plan: {
        id: plan.id,
        title: plan.title,
        category: plan.category,
        targetAmount: Number(plan.target_amount),
        currentAmount: Number(plan.current_amount),
        currency: plan.currency,
        targetDate: plan.target_date,
        recommendedMonthly: Number(plan.recommended_monthly),
        splitRecommendation: {
          partnerB: Number(plan.split_partner_b),
          partnerA: Number(plan.split_partner_a),
        },
        walletFunding: plan.wallet_funding,
        status: plan.status,
        assumptions: plan.assumptions,
      },
    });
  } catch (error) {
    console.error("[plans/update] Unexpected error:", error);
    return NextResponse.json({ success: false, message: "An unexpected error occurred." }, { status: 500 });
  }
}

// No DELETE: a shared goal is removed only with both partners, through
// POST ./request-delete (dual PIN in person, or a PLAN_DELETE approval).
