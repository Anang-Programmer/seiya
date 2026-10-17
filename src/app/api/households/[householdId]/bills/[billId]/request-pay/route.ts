import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requestPayHouseholdBill } from "@/backend/services/bill-budget.service";

type RouteContext = { params: Promise<{ householdId: string; billId: string }> };
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(_request: Request, context: RouteContext) {
  const { householdId, billId } = await context.params;
  if (!UUID_PATTERN.test(householdId) || !UUID_PATTERN.test(billId)) {
    return NextResponse.json({ success: false, message: "Invalid parameters." }, { status: 400 });
  }

  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, message: "Login required." }, { status: 401 });
    }

    const result = await requestPayHouseholdBill(supabase, householdId, user.id, billId);
    return NextResponse.json(result, { status: result.success ? 200 : 400 });
  } catch (error) {
    console.error("[bills/request-pay] Unexpected error:", error);
    return NextResponse.json({ success: false, message: "An unexpected error occurred." }, { status: 500 });
  }
}
