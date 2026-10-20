import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { validateCreatePlan } from "@/backend/validators/plan";
import { listHouseholdPlans, createHouseholdPlan, toApiPlan } from "@/backend/services/plan.service";

async function getActiveHouseholdId(supabase: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await supabase
    .from("household_members")
    .select("household_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  return data?.household_id || null;
}

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, message: "Login required." }, { status: 401 });
    }

    const householdId = await getActiveHouseholdId(supabase, user.id);
    if (!householdId) {
      return NextResponse.json({ success: false, message: "No active household found." }, { status: 404 });
    }

    const { data: plans, error } = await listHouseholdPlans(supabase, householdId);
    if (error) {
      return NextResponse.json({ success: false, message: "Unable to load goals." }, { status: 500 });
    }

    const mapped = (plans ?? []).map(toApiPlan);

    return NextResponse.json({ success: true, plans: mapped });
  } catch (error) {
    console.error("[plans/top-get] Unexpected error:", error);
    return NextResponse.json({ success: false, message: "An unexpected error occurred." }, { status: 500 });
  }
}

export async function POST(request: Request) {
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

    const householdId = await getActiveHouseholdId(supabase, user.id);
    if (!householdId) {
      return NextResponse.json({ success: false, message: "No active household found." }, { status: 404 });
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
    console.error("[plans/top-create] Unexpected error:", error);
    return NextResponse.json({ success: false, message: "An unexpected error occurred." }, { status: 500 });
  }
}
