import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { validateUpdatePlan } from "@/backend/validators/plan";
import {
  getHouseholdPlan,
  updateHouseholdPlan,
  toApiPlan,
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
      plan: toApiPlan(plan),
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

    const { data: plan, pendingApprovalId, error } = await updateHouseholdPlan(supabase, householdId, planId, validation.data);
    if (error || !plan) {
      if (error?.code === "P0002") {
        return NextResponse.json({ success: false, message: "Goal not found." }, { status: 404 });
      }
      if (error?.code === "22023" || error?.code === "23514") {
        return NextResponse.json({ success: false, message: "Invalid goal values." }, { status: 400 });
      }
      return NextResponse.json({ success: false, message: "Unable to update goal." }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: pendingApprovalId
        ? "Goal updated. Target, currency, split or archive changes are waiting for your partner's approval."
        : "Goal updated successfully.",
      pendingApprovalId,
      plan: toApiPlan(plan),
    });
  } catch (error) {
    console.error("[plans/update] Unexpected error:", error);
    return NextResponse.json({ success: false, message: "An unexpected error occurred." }, { status: 500 });
  }
}

// No DELETE: a shared goal is removed only with both partners, through
// POST ./request-delete (dual PIN in person, or a PLAN_DELETE approval).
