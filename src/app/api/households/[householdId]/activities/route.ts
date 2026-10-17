import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listHouseholdActivities } from "@/backend/services/activity.service";

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

    const { data, error } = await listHouseholdActivities(supabase, householdId, 50);
    if (error) {
      return NextResponse.json({ success: false, message: "Unable to load activities." }, { status: 500 });
    }

    const mapped = (data ?? []).map((a) => ({
      id: a.id,
      title: a.title,
      category: a.category,
      actor: a.actor,
      status: a.status,
      amount: a.amount !== null ? Number(a.amount) : undefined,
      currency: a.currency || undefined,
      reason: a.reason,
      timestamp: a.created_at,
      timeAgo: "Recently",
    }));

    return NextResponse.json({ success: true, activities: mapped });
  } catch (error) {
    console.error("[household/activities/list] Unexpected error:", error);
    return NextResponse.json({ success: false, message: "An unexpected error occurred." }, { status: 500 });
  }
}
