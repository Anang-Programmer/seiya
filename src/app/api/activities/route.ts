import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { listHouseholdActivities } from "@/backend/services/activity.service";

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
    console.error("[activities/list] Unexpected error:", error);
    return NextResponse.json({ success: false, message: "An unexpected error occurred." }, { status: 500 });
  }
}
