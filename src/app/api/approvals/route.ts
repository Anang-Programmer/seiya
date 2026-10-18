import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { validateCreateApproval } from "@/backend/validators/approval";
import { listHouseholdApprovals, createHouseholdApproval } from "@/backend/services/approval.service";

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

export async function GET() {
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
    console.error("[approvals/list] Unexpected error:", error);
    return NextResponse.json({ success: false, message: "An unexpected error occurred." }, { status: 500 });
  }
}

export async function POST(request: Request) {
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

    const householdId = await getActiveHouseholdId(supabase, user.id);
    if (!householdId) {
      return NextResponse.json({ success: false, message: "No active household found." }, { status: 404 });
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
    console.error("[approvals/create] Unexpected error:", error);
    return NextResponse.json({ success: false, message: "An unexpected error occurred." }, { status: 500 });
  }
}
