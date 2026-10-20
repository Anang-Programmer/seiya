import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

/**
 * 403 response when the caller is not an active member of the household, else
 * null. RLS already hides other households' rows; this makes the API answer
 * "forbidden" instead of an empty success.
 */
export async function forbidUnlessMember(
  supabase: SupabaseClient,
  householdId: string,
  userId: string
): Promise<NextResponse | null> {
  const { data, error } = await supabase
    .from("household_members")
    .select("id")
    .eq("household_id", householdId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ success: false, message: "Unable to verify household membership." }, { status: 500 });
  }
  return data
    ? null
    : NextResponse.json({ success: false, message: "Active household membership required." }, { status: 403 });
}
