import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type RouteContext = { params: Promise<{ approvalId: string }> };
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CANCEL_ERRORS: Record<string, { status: number; message: string }> = {
  "42501": { status: 403, message: "Only the member who made this request can cancel it." },
  P0002: { status: 404, message: "Approval request not found." },
  "22023": { status: 409, message: "This request has already been decided." },
};

/** The requester withdraws their own pending request (linked expense included). */
export async function POST(_request: Request, context: RouteContext) {
  const { approvalId } = await context.params;
  if (!UUID_PATTERN.test(approvalId)) {
    return NextResponse.json({ success: false, message: "Invalid approval ID." }, { status: 400 });
  }

  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, message: "Login required." }, { status: 401 });
    }

    const { error } = await supabase.rpc("cancel_household_approval", { p_approval_id: approvalId });
    if (error) {
      const mapped = CANCEL_ERRORS[error.code ?? ""];
      if (!mapped) console.error("[approvals/cancel] RPC failed:", error);
      return NextResponse.json(
        { success: false, message: mapped?.message ?? "Unable to cancel this request." },
        { status: mapped?.status ?? 500 }
      );
    }

    return NextResponse.json({ success: true, status: "cancelled", message: "Request cancelled." });
  } catch (error) {
    console.error("[approvals/cancel] Unexpected error:", error);
    return NextResponse.json({ success: false, message: "An unexpected error occurred." }, { status: 500 });
  }
}
