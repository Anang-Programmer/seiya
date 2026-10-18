import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { validateCreatePlan } from "@/backend/validators/plan";
import { listHouseholdPlans, createHouseholdPlan } from "@/backend/services/plan.service";

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

    const mapped = (plans ?? []).map((p) => ({
      id: p.id,
      title: p.title,
      category: p.category,
      targetAmount: Number(p.target_amount),
      currentAmount: Number(p.current_amount),
      currency: p.currency,
      targetDate: p.target_date,
      recommendedMonthly: Number(p.recommended_monthly),
      splitRecommendation: {
        partnerB: Number(p.split_partner_b),
        partnerA: Number(p.split_partner_a),
      },
      walletFunding: p.wallet_funding,
      status: p.status,
      assumptions: p.assumptions,
      createdAt: p.created_at,
      updatedAt: p.updated_at,
    }));

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
    }, { status: 201 });
  } catch (error) {
    console.error("[plans/top-create] Unexpected error:", error);
    return NextResponse.json({ success: false, message: "An unexpected error occurred." }, { status: 500 });
  }
}
