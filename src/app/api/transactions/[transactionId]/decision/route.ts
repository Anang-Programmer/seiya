import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { validateTransactionDecision } from "@/backend/validators/transaction";
import { decideSimulatedTransaction } from "@/backend/services/transaction.service";
import { checkUserPin, PIN_LOCKED_MESSAGE } from "@/backend/services/pin.service";

type RouteContext = { params: Promise<{ transactionId: string }> };
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request, context: RouteContext) {
  const { transactionId } = await context.params;
  if (!UUID_PATTERN.test(transactionId)) {
    return NextResponse.json({ success: false, message: "Invalid transaction ID." }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON body." }, { status: 400 });
  }

  const validation = validateTransactionDecision(body);
  if (!validation.ok) {
    return NextResponse.json({ success: false, message: validation.message }, { status: 400 });
  }

  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, message: "Login required." }, { status: 401 });
    }

    // Same rule as /api/approvals/:id/decision: approving needs the approver's PIN.
    if (validation.data.decision === "approved") {
      const pinCheck = validation.data.pin ? await checkUserPin(supabase, user.id, validation.data.pin) : "invalid";
      if (pinCheck !== "valid") {
        return NextResponse.json(
          {
            success: false,
            message: pinCheck === "locked"
              ? PIN_LOCKED_MESSAGE
              : validation.data.pin ? "Invalid 6-digit security PIN." : "Enter your 6-digit security PIN to approve.",
          },
          { status: pinCheck === "locked" ? 429 : 401 }
        );
      }
    }

    const { data, error } = await decideSimulatedTransaction(supabase, transactionId, {
      decision: validation.data.decision,
      note: validation.data.note,
    });
    if (error) {
      console.error("[transactions/decision] RPC failed:", error);
      const map: Record<string, { status: number; message: string }> = {
        "42501": { status: 403, message: "You are not allowed to decide this transaction." },
        "P0002": { status: 404, message: "Transaction not found." },
        "22023": { status: 409, message: "This transaction is no longer awaiting a decision." },
        "23505": { status: 409, message: "No pending approval exists for this user." },
      };
      const mapped = map[error.code ?? ""];
      return mapped
        ? NextResponse.json({ success: false, message: mapped.message }, { status: mapped.status })
        : NextResponse.json({ success: false, message: "Unable to process transaction decision." }, { status: 500 });
    }

    const result = data as { status?: string } | null;
    return NextResponse.json({
      success: true,
      message: result?.status === "executed"
        ? "Transaction approved and executed."
        : result?.status === "on_hold"
          ? "Approval recorded. The cooling-off period still applies."
          : validation.data.decision === "rejected"
            ? "Transaction rejected."
            : "Transaction decision recorded.",
      transaction: data,
    });
  } catch (error) {
    console.error("[transactions/decision] Unexpected error:", error);
    return NextResponse.json({ success: false, message: "An unexpected error occurred." }, { status: 500 });
  }
}
