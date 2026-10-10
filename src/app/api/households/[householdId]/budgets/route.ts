import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getHouseholdBudgetProgress, upsertHouseholdBudget } from "@/backend/services/bill-budget.service";
import { validateUpsertBudget } from "@/backend/validators/bill-budget";

type RouteContext = { params: Promise<{ householdId: string }> };
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function dbError(code?: string) {
  const map: Record<string, { status: number; message: string }> = {
    "42501": { status: 403, message: "Active household membership is required." },
    "P0002": { status: 404, message: "Household not found." },
    "22023": { status: 400, message: "Invalid budget details, period, or currency." },
  };
  const error = map[code ?? ""];
  return NextResponse.json(
    { success: false, message: error?.message ?? "Unable to process budget request." },
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

    const { data, error } = await getHouseholdBudgetProgress(supabase, householdId);
    if (error) {
      console.error("[budgets/list] RPC failed:", error);
      return dbError(error.code);
    }

    return NextResponse.json({ success: true, ...(data as Record<string, unknown>) });
  } catch (error) {
    console.error("[budgets/list] Unexpected error:", error);
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

  const validation = validateUpsertBudget(body);
  if (!validation.ok) {
    return NextResponse.json({ success: false, message: validation.message }, { status: 400 });
  }

  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, message: "Login required." }, { status: 401 });
    }

    const { data: budget, error } = await upsertHouseholdBudget(supabase, householdId, validation.data);
    if (error) {
      console.error("[budgets/upsert] RPC failed:", error);
      return dbError(error.code);
    }

    return NextResponse.json({ success: true, message: "Budget saved successfully.", budget });
  } catch (error) {
    console.error("[budgets/upsert] Unexpected error:", error);
    return NextResponse.json({ success: false, message: "An unexpected error occurred." }, { status: 500 });
  }
}
