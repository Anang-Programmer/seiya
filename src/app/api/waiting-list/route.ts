import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { validateCreateHeldPurchase } from "@/backend/validators/held-purchase";
import { listHouseholdHeldPurchases, createHouseholdHeldPurchase } from "@/backend/services/held-purchase.service";

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

    const { data, error } = await listHouseholdHeldPurchases(supabase, householdId);
    if (error) {
      return NextResponse.json({ success: false, message: "Unable to load held purchases." }, { status: 500 });
    }

    const mapped = (data ?? []).map((h) => ({
      id: h.id,
      title: h.title,
      amount: Number(h.amount),
      currency: h.currency,
      wallet: h.wallet,
      requester: h.requester_role,
      status: h.status,
      holdUntil: h.hold_until,
      holdUntilDisplay: h.hold_until_display || "Tomorrow at 08:00 (Local Time)",
      reason: h.reason,
      createdAt: h.created_at,
    }));

    return NextResponse.json({ success: true, heldPurchases: mapped });
  } catch (error) {
    console.error("[waiting-list/list] Unexpected error:", error);
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

  const validation = validateCreateHeldPurchase(body);
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

    const { data, error } = await createHouseholdHeldPurchase(supabase, householdId, user.id, validation.data);
    if (error) {
      return NextResponse.json({ success: false, message: "Unable to create held purchase." }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: "Purchase placed on cooling-off hold.",
      heldPurchase: {
        id: data.id,
        title: data.title,
        amount: Number(data.amount),
        currency: data.currency,
        wallet: data.wallet,
        requester: data.requester_role,
        status: data.status,
        holdUntil: data.hold_until,
        reason: data.reason,
        createdAt: data.created_at,
      },
    }, { status: 201 });
  } catch (error) {
    console.error("[waiting-list/create] Unexpected error:", error);
    return NextResponse.json({ success: false, message: "An unexpected error occurred." }, { status: 500 });
  }
}
