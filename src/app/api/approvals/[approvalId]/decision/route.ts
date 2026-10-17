import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { validateApprovalDecision } from "@/backend/validators/approval";
import { decideApprovalRequest } from "@/backend/services/approval.service";

type RouteContext = { params: Promise<{ approvalId: string }> };
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

  const validation = validateApprovalDecision(body);
  if (!validation.ok) {
    return NextResponse.json({ success: false, message: validation.message }, { status: 400 });
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

    const result = await decideApprovalRequest(
      supabase,
      householdId,
      user.id,
      approvalId,
      validation.data
    );

    if (!result.success) {
      const statusMap: Record<string, number> = {
        P0002: 404,
        "22023": 409,
        SELF_APPROVAL: 403,
        INVALID_PIN: 401,
      };
      return NextResponse.json(
        { success: false, code: result.code, message: result.message },
        { status: statusMap[result.code || ""] || 500 }
      );
    }

    return NextResponse.json({
      success: true,
      status: result.status,
      message: result.message,
    });
  } catch (error) {
    console.error("[approvals/decision] Unexpected error:", error);
    return NextResponse.json({ success: false, message: "An unexpected error occurred." }, { status: 500 });
  }
}
