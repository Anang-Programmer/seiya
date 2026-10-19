import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { SETTLE_UP_FORBIDDEN_MESSAGE, settleUpHousehold } from "@/backend/services/settlement.service";
import { forbidUnlessMember } from "@/backend/services/membership.service";

type RouteContext = { params: Promise<{ householdId: string }> };
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(_request: Request, context: RouteContext) {
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

    const { data, error } = await settleUpHousehold(supabase, householdId);
    if (error?.code === "42501") {
      return NextResponse.json({ success: false, message: SETTLE_UP_FORBIDDEN_MESSAGE }, { status: 403 });
    }
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
    console.error("[settlement/settle-up] Unexpected error:", error);
    return NextResponse.json({ success: false, message: "An unexpected error occurred." }, { status: 500 });
  }
}
