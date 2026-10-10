import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { validateCreateTransaction } from "@/backend/validators/transaction";
import { requestSimulatedTransaction } from "@/backend/services/transaction.service";

type RouteContext = {
  params: Promise<{ householdId: string }>;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function transactionErrorResponse(code?: string) {
  const known: Record<string, { status: number; message: string }> = {
    "42501": { status: 403, message: "You are not allowed to perform this transaction." },
    "P0002": { status: 404, message: "Household or wallet not found." },
    "22023": { status: 409, message: "Household, wallet, or active finance agreement is not ready for this transaction." },
    "23505": { status: 409, message: "A conflicting transaction request already exists." },
    P1001: { status: 409, message: "Insufficient available simulated balance." },
    P1002: { status: 409, message: "The active finance agreement has invalid transaction settings." },
    P1003: { status: 409, message: "Idempotency key was already used for a different request." },
  };

  const mapped = known[code ?? ""];
  return mapped
    ? NextResponse.json({ success: false, message: mapped.message }, { status: mapped.status })
    : NextResponse.json({ success: false, message: "Unable to process transaction." }, { status: 500 });
}

export async function POST(request: Request, context: RouteContext) {
  const { householdId } = await context.params;

  if (!UUID_PATTERN.test(householdId)) {
    return NextResponse.json(
      { success: false, message: "Invalid household ID." },
      { status: 400 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, message: "Invalid JSON body." },
      { status: 400 }
    );
  }

  const validation = validateCreateTransaction(body);
  if (!validation.ok) {
    return NextResponse.json(
      { success: false, message: validation.message },
      { status: 400 }
    );
  }

  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, message: "Login required." },
        { status: 401 }
      );
    }

    const { data, error } = await requestSimulatedTransaction(
      supabase,
      householdId,
      validation.data
    );

    if (error) {
      console.error("[transactions/create] RPC failed:", error);
      return transactionErrorResponse(error.code);
    }

    const payload = data as {
      transaction?: { status?: string };
      idempotent_replay?: boolean;
    } | null;
    const status = payload?.transaction?.status;
    const httpStatus = payload?.idempotent_replay ? 200 : 201;

    return NextResponse.json(
      {
        success: true,
        message:
          status === "executed"
            ? "Transaction executed successfully."
            : status === "pending_approval"
              ? "Transaction is waiting for partner approval."
              : status === "on_hold"
                ? "Transaction is on hold according to the household rules."
                : "Transaction request created.",
        ...payload,
      },
      { status: httpStatus }
    );
  } catch (error) {
    console.error("[transactions/create] Unexpected error:", error);
    return NextResponse.json(
      { success: false, message: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}

export async function GET(request: Request, context: RouteContext) {
  const { householdId } = await context.params;

  if (!UUID_PATTERN.test(householdId)) {
    return NextResponse.json(
      { success: false, message: "Invalid household ID." },
      { status: 400 }
    );
  }

  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, message: "Login required." },
        { status: 401 }
      );
    }

    const { data: membership, error: membershipError } = await supabase
      .from("household_members")
      .select("id")
      .eq("household_id", householdId)
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();

    if (membershipError) {
      console.error("[transactions/list] Membership lookup failed:", membershipError);
      return NextResponse.json(
        { success: false, message: "Unable to verify household membership." },
        { status: 500 }
      );
    }

    if (!membership) {
      return NextResponse.json(
        { success: false, message: "Active household membership required." },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const rawLimit = Number(searchParams.get("limit") ?? "30");
    const limit = Number.isInteger(rawLimit) ? Math.min(Math.max(rawLimit, 1), 100) : 30;

    const { data: transactions, error } = await supabase
      .from("transactions")
      .select("id, household_id, wallet_id, created_by, transaction_type, category, description, amount, currency, status, source, requires_approval, hold_until, occurred_at, executed_at, created_at")
      .eq("household_id", householdId)
      .order("occurred_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("[transactions/list] Query failed:", error);
      return NextResponse.json(
        { success: false, message: "Unable to load transactions." },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, transactions: transactions ?? [] });
  } catch (error) {
    console.error("[transactions/list] Unexpected error:", error);
    return NextResponse.json(
      { success: false, message: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}
