import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createHouseholdBill } from "@/backend/services/bill-budget.service";
import { validateCreateBill } from "@/backend/validators/bill-budget";

type RouteContext = { params: Promise<{ householdId: string }> };
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function dbError(code?: string) {
  const map: Record<string, { status: number; message: string }> = {
    "42501": { status: 403, message: "Active household membership is required." },
    "P0002": { status: 404, message: "Household not found." },
    "22023": { status: 400, message: "Invalid bill details or currency." },
  };
  const error = map[code ?? ""];
  return NextResponse.json(
    { success: false, message: error?.message ?? "Unable to process bill request." },
    { status: error?.status ?? 500 }
  );
}

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

    const { data: membership, error: memberError } = await supabase
      .from("household_members")
      .select("id")
      .eq("household_id", householdId)
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();

    if (memberError) {
      console.error("[bills/list] Membership lookup failed:", memberError);
      return NextResponse.json({ success: false, message: "Unable to verify household membership." }, { status: 500 });
    }
    if (!membership) {
      return NextResponse.json({ success: false, message: "Active household membership required." }, { status: 403 });
    }

    const { data, error } = await supabase
      .from("bills")
      .select("id, household_id, created_by, title, payee, amount, currency, due_date, recurrence, status, paid_transaction_id, notes, created_at, updated_at")
      .eq("household_id", householdId)
      .order("due_date", { ascending: true })
      .limit(100);

    if (error) {
      console.error("[bills/list] Query failed:", error);
      return NextResponse.json({ success: false, message: "Unable to load bills." }, { status: 500 });
    }

    const today = new Date().toISOString().slice(0, 10);
    const bills = (data ?? []).map((bill) => ({
      ...bill,
      display_status: bill.status === "upcoming" && bill.due_date < today ? "overdue" : bill.status,
    }));

    return NextResponse.json({ success: true, bills });
  } catch (error) {
    console.error("[bills/list] Unexpected error:", error);
    return NextResponse.json({ success: false, message: "An unexpected error occurred." }, { status: 500 });
  }
}

export async function POST(request: Request, context: RouteContext) {
  const { householdId } = await context.params;
  if (!UUID_PATTERN.test(householdId)) {
    return NextResponse.json({ success: false, message: "Invalid household ID." }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON body." }, { status: 400 });
  }

  const validation = validateCreateBill(body);
  if (!validation.ok) {
    return NextResponse.json({ success: false, message: validation.message }, { status: 400 });
  }

  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, message: "Login required." }, { status: 401 });
    }

    const { data: bill, error } = await createHouseholdBill(supabase, householdId, validation.data);
    if (error) {
      console.error("[bills/create] RPC failed:", error);
      return dbError(error.code);
    }

    return NextResponse.json({ success: true, message: "Bill created successfully.", bill }, { status: 201 });
  } catch (error) {
    console.error("[bills/create] Unexpected error:", error);
    return NextResponse.json({ success: false, message: "An unexpected error occurred." }, { status: 500 });
  }
}
