import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { validateCreateApproval } from "@/backend/validators/approval";
import { listHouseholdApprovals, createHouseholdApproval } from "@/backend/services/approval.service";

type RouteContext = { params: Promise<{ householdId: string }> };
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

    const { data, error } = await listHouseholdApprovals(supabase, householdId);
    if (error) {
      return NextResponse.json({ success: false, message: "Unable to load approvals." }, { status: 500 });
    }

    const mapped = (data ?? []).map((a) => ({
      id: a.id,
      title: a.title,
      amount: Number(a.amount),
      currency: a.currency,
      wallet: a.wallet,
      requester: a.requester_role,
      approver: a.approver_role,
      status: a.status,
      reason: a.reason,
      createdAt: a.created_at,
      expiresInHours: a.expires_in_hours,
      category: a.category,
      type: a.type,
      targetId: a.target_id,
      notes: a.notes,
    }));

    return NextResponse.json({ success: true, approvals: mapped });
  } catch (error) {
    console.error("[household/approvals/list] Unexpected error:", error);
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

  const validation = validateCreateApproval(body);
  if (!validation.ok) {
    return NextResponse.json({ success: false, message: validation.message }, { status: 400 });
  }

  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, message: "Login required." }, { status: 401 });
    }

    const { data, error } = await createHouseholdApproval(supabase, householdId, user.id, validation.data);
    if (error) {
      return NextResponse.json({ success: false, message: "Unable to create approval request." }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: "Approval request created successfully.",
      approval: {
        id: data.id,
        title: data.title,
        amount: Number(data.amount),
        currency: data.currency,
        wallet: data.wallet,
        requester: data.requester_role,
        approver: data.approver_role,
        status: data.status,
        reason: data.reason,
        createdAt: data.created_at,
        expiresInHours: data.expires_in_hours,
        category: data.category,
        type: data.type,
        targetId: data.target_id,
        notes: data.notes,
      },
    }, { status: 201 });
  } catch (error) {
    console.error("[household/approvals/create] Unexpected error:", error);
    return NextResponse.json({ success: false, message: "An unexpected error occurred." }, { status: 500 });
  }
}
