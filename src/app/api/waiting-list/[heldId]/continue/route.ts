import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { continueHouseholdHeldPurchase } from "@/backend/services/held-purchase.service";

type RouteContext = { params: Promise<{ heldId: string }> };
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

export async function POST(_request: Request, context: RouteContext) {
  const { heldId } = await context.params;
  if (!UUID_PATTERN.test(heldId)) {
    return NextResponse.json({ success: false, message: "Invalid held ID." }, { status: 400 });
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

    const result = await continueHouseholdHeldPurchase(supabase, heldId);
    const status = result.success
      ? 200
      : result.code === "P0002" ? 404 : result.code === "42501" ? 403 : result.code === "P1001" ? 409 : 400;
    return NextResponse.json(result, { status });
  } catch (error) {
    console.error("[waiting-list/continue] Unexpected error:", error);
    return NextResponse.json({ success: false, message: "An unexpected error occurred." }, { status: 500 });
  }
}
