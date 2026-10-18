import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getHouseholdSettlement } from "@/backend/services/settlement.service";

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

    const { data, error } = await getHouseholdSettlement(supabase, householdId);
    if (error) {
      return NextResponse.json({ success: false, message: "Unable to load settlement." }, { status: 500 });
    }

    return NextResponse.json({ success: true, settlement: data });
  } catch (error) {
    console.error("[settlement/get] Unexpected error:", error);
    return NextResponse.json({ success: false, message: "An unexpected error occurred." }, { status: 500 });
  }
}
