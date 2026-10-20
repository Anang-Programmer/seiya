import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type RouteContext = { params: Promise<{ approvalId: string }> };
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_NOTES = 1000;

const NOTES_ERRORS: Record<string, { status: number; message: string }> = {
  "42501": { status: 403, message: "Only the member who made this request can add notes." },
  P0002: { status: 404, message: "Approval request not found." },
  "22023": { status: 409, message: "This request has already been decided." },
};

/** The requester attaches notes to their own pending request so the partner sees the context. */
export async function POST(request: Request, context: RouteContext) {
  const { approvalId } = await context.params;
  if (!UUID_PATTERN.test(approvalId)) {
    return NextResponse.json({ success: false, message: "Invalid approval ID." }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON body." }, { status: 400 });
  }

  const raw = (body as { notes?: unknown } | null)?.notes;
  if (raw !== null && raw !== undefined && typeof raw !== "string") {
    return NextResponse.json({ success: false, message: "Notes must be text." }, { status: 400 });
  }
  const notes = typeof raw === "string" ? raw.trim() : "";
  if (notes.length > MAX_NOTES) {
    return NextResponse.json(
      { success: false, message: `Notes must be at most ${MAX_NOTES} characters.` },
      { status: 400 }
    );
  }

  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, message: "Login required." }, { status: 401 });
    }

    const { error } = await supabase.rpc("set_household_approval_notes", {
      p_approval_id: approvalId,
      p_notes: notes || null,
    });
    if (error) {
      const mapped = NOTES_ERRORS[error.code ?? ""];
      if (!mapped) console.error("[approvals/notes] RPC failed:", error);
      return NextResponse.json(
        { success: false, message: mapped?.message ?? "Unable to save these notes." },
        { status: mapped?.status ?? 500 }
      );
    }

    return NextResponse.json({ success: true, notes: notes || null });
  } catch (error) {
    console.error("[approvals/notes] Unexpected error:", error);
    return NextResponse.json({ success: false, message: "An unexpected error occurred." }, { status: 500 });
  }
}
