import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { settleUpHousehold } from "@/backend/services/settlement.service";

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

export async function POST() {
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

    const { data, error } = await settleUpHousehold(supabase, householdId);
    if (error || !data) {
      return NextResponse.json({ success: false, message: "Unable to complete settlement." }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: "Shared expense ledger balance settled between partners.",
      settlement: {
        partnerBOwesA: Number(data.partner_b_owes_a) || 0,
        partnerAOwesB: Number(data.partner_a_owes_b) || 0,
        currency: data.currency,
      },
    });
  } catch (error) {
    console.error("[settlement/top-settle-up] Unexpected error:", error);
    return NextResponse.json({ success: false, message: "An unexpected error occurred." }, { status: 500 });
  }
}
