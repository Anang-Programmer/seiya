import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { validateUpdateBill } from "@/backend/validators/bill-budget";
import { updateHouseholdBill, deleteHouseholdBill } from "@/backend/services/bill-budget.service";

type RouteContext = { params: Promise<{ householdId: string; billId: string }> };
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(request: Request, context: RouteContext) {
  const { householdId, billId } = await context.params;
  if (!UUID_PATTERN.test(householdId) || !UUID_PATTERN.test(billId)) {
    return NextResponse.json({ success: false, message: "Invalid parameters." }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON body." }, { status: 400 });
  }

  const validation = validateUpdateBill(body);
  if (!validation.ok) {
    return NextResponse.json({ success: false, message: validation.message }, { status: 400 });
  }

  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, message: "Login required." }, { status: 401 });
    }

    const { data, error } = await updateHouseholdBill(supabase, householdId, billId, validation.data);
    if (error) {
      return NextResponse.json({ success: false, message: "Unable to update bill." }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: "Bill updated successfully.", bill: data });
  } catch (error) {
    console.error("[bills/update] Unexpected error:", error);
    return NextResponse.json({ success: false, message: "An unexpected error occurred." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
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

    const { error } = await deleteHouseholdBill(supabase, householdId, billId);
    if (error) {
      return NextResponse.json({ success: false, message: "Unable to delete bill." }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: "Bill deleted successfully." });
  } catch (error) {
    console.error("[bills/delete] Unexpected error:", error);
    return NextResponse.json({ success: false, message: "An unexpected error occurred." }, { status: 500 });
  }
}
