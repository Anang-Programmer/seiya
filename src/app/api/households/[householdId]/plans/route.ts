import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { validateCreatePlan } from "@/backend/validators/plan";
import { listHouseholdPlans, createHouseholdPlan, toApiPlan } from "@/backend/services/plan.service";
import { forbidUnlessMember } from "@/backend/services/membership.service";

type RouteContext = { params: Promise<{ householdId: string }> };
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_request: Request, context: RouteContext) {
  const { householdId } = await context.params;
  if (!UUID_PATTERN.test(householdId)) {
    return NextResponse.json({ success: false, message: "Invalid household ID." }, { status: 400 });
  }

  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, message: "Login required." }, { status: 401 });
    }
    const notMember = await forbidUnlessMember(supabase, householdId, user.id);
    if (notMember) return notMember;

    const { data: plans, error } = await listHouseholdPlans(supabase, householdId);
    if (error) {
      return NextResponse.json({ success: false, message: "Unable to load goals." }, { status: 500 });
    }

    const mapped = (plans ?? []).map(toApiPlan);

    return NextResponse.json({ success: true, plans: mapped });
  } catch (error) {
    console.error("[plans/list] Unexpected error:", error);
    return NextResponse.json({ success: false, message: "An unexpected error occurred." }, { status: 500 });
  }
}

export async function POST(request: Request, context: RouteContext) {
  const { householdId } = await context.params;
  if (!UUID_PATTERN.test(householdId)) {
    return NextResponse.json({ success: false, message: "Invalid household ID." }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON body." }, { status: 400 });
  }

  const validation = validateCreatePlan(body);
  if (!validation.ok) {
    return NextResponse.json({ success: false, message: validation.message }, { status: 400 });
  }

  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, message: "Login required." }, { status: 401 });
    }

    const { data: plan, error } = await createHouseholdPlan(supabase, householdId, user.id, validation.data);
    if (error) {
      return NextResponse.json({ success: false, message: "Unable to create goal." }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: "Goal created successfully.",
      plan: toApiPlan(plan),
    }, { status: 201 });
  } catch (error) {
    console.error("[plans/create] Unexpected error:", error);
    return NextResponse.json({ success: false, message: "An unexpected error occurred." }, { status: 500 });
  }
}
