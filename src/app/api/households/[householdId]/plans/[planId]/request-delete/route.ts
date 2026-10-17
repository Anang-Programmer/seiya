import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { validateDeletePlanRequest } from "@/backend/validators/plan";
import { requestDeleteHouseholdPlan } from "@/backend/services/plan.service";

type RouteContext = { params: Promise<{ householdId: string; planId: string }> };
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request, context: RouteContext) {
  const { householdId, planId } = await context.params;
  if (!UUID_PATTERN.test(householdId) || !UUID_PATTERN.test(planId)) {
    return NextResponse.json({ success: false, message: "Invalid parameters." }, { status: 400 });
  }

  let body: unknown;
  try {
    const text = await request.text();
    body = text ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON body." }, { status: 400 });
  }

  const validation = validateDeletePlanRequest(body);
  if (!validation.ok) {
    return NextResponse.json({ success: false, message: validation.message }, { status: 400 });
  }

  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, message: "Login required." }, { status: 401 });
    }

    const result = await requestDeleteHouseholdPlan(
      supabase,
      householdId,
      user.id,
      planId,
      validation.data.partnerAPin,
      validation.data.partnerBPin
    );

    return NextResponse.json(result, { status: result.success ? 200 : 400 });
  } catch (error) {
    console.error("[plans/request-delete] Unexpected error:", error);
    return NextResponse.json({ success: false, message: "An unexpected error occurred." }, { status: 500 });
  }
}
