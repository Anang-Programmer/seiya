import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { executeHeldSimulatedTransaction } from "@/backend/services/transaction.service";

type RouteContext = { params: Promise<{ transactionId: string }> };
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(_request: Request, context: RouteContext) {
  const { transactionId } = await context.params;
  if (!UUID_PATTERN.test(transactionId)) {
    return NextResponse.json({ success: false, message: "Invalid transaction ID." }, { status: 400 });
  }

  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, message: "Login required." }, { status: 401 });
    }

    const { data, error } = await executeHeldSimulatedTransaction(supabase, transactionId);
    if (error) {
      console.error("[transactions/execute] RPC failed:", error);
      const map: Record<string, { status: number; message: string }> = {
        "42501": { status: 403, message: "You are not allowed to execute this transaction." },
        "P0002": { status: 404, message: "Transaction not found." },
        "22023": { status: 409, message: "Transaction cannot be executed in its current state." },
        P1004: { status: 409, message: "Cooling-off period has not elapsed yet." },
        P1005: { status: 409, message: "Partner approval is still required." },
      };
      const mapped = map[error.code ?? ""];
      return mapped
        ? NextResponse.json({ success: false, message: mapped.message }, { status: mapped.status })
        : NextResponse.json({ success: false, message: "Unable to execute held transaction." }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: "Held transaction processed.",
      result: data,
    });
  } catch (error) {
    console.error("[transactions/execute] Unexpected error:", error);
    return NextResponse.json({ success: false, message: "An unexpected error occurred." }, { status: 500 });
  }
}
