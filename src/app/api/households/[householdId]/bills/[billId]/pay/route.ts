import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { payHouseholdBill } from "@/backend/services/bill-budget.service";
import { validatePayBill } from "@/backend/validators/bill-budget";

type RouteContext = { params: Promise<{ householdId: string; billId: string }> };
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function paymentError(code?: string) {
  const map: Record<string, { status: number; message: string }> = {
    "42501": { status: 403, message: "Active household membership or wallet access is required." },
    "P0002": { status: 404, message: "Bill, household, or wallet not found." },
    "22023": { status: 409, message: "The bill cannot be paid with these details or its current status." },
    "23505": { status: 409, message: "This bill has already been paid." },
    "P1001": { status: 409, message: "Not enough money in this wallet. Add money first, or choose another wallet." },
    "P1002": { status: 409, message: "The active transaction rules are invalid." },
    "P1003": { status: 409, message: "Idempotency key was already used for a different request." },
  };
  const error = map[code ?? ""];
  return NextResponse.json(
    { success: false, message: error?.message ?? "Unable to request bill payment." },
    { status: error?.status ?? 500 }
  );
}

export async function POST(request: Request, context: RouteContext) {
  const { householdId, billId } = await context.params;
  if (!UUID_PATTERN.test(householdId) || !UUID_PATTERN.test(billId)) {
    return NextResponse.json({ success: false, message: "Invalid household or bill ID." }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON body." }, { status: 400 });
  }

  const validation = validatePayBill(body);
  if (!validation.ok) {
    return NextResponse.json({ success: false, message: validation.message }, { status: 400 });
  }

  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, message: "Login required." }, { status: 401 });
    }

    const { data, error } = await payHouseholdBill(supabase, householdId, billId, validation.data);
    if (error) {
      console.error("[bills/pay] RPC failed:", error);
      return paymentError(error.code);
    }

    const response = data as { bill?: { status?: string }; bill_status?: string; idempotent_replay?: boolean } | null;
    const billStatus = response?.bill?.status ?? response?.bill_status;

    return NextResponse.json({
      success: true,
      message: response?.idempotent_replay
        ? "Existing bill payment request returned."
        : billStatus === "paid"
          ? "Bill paid successfully."
          : "Bill payment requested and is awaiting required approval or cooling-off.",
      result: data,
    });
  } catch (error) {
    console.error("[bills/pay] Unexpected error:", error);
    return NextResponse.json({ success: false, message: "An unexpected error occurred." }, { status: 500 });
  }
}
