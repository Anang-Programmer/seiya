import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { validateCreateHeldPurchase } from "@/backend/validators/held-purchase";
import { listHouseholdHeldPurchases, createHouseholdHeldPurchase } from "@/backend/services/held-purchase.service";

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
    console.error("[household/waiting-list/list] Unexpected error:", error);
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
    console.error("[household/waiting-list/create] Unexpected error:", error);
    return NextResponse.json({ success: false, message: "An unexpected error occurred." }, { status: 500 });
  }
}
