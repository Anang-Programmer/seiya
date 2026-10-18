import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, message: "Login required." }, { status: 401 });
    }

    const { data: membership } = await supabase
      .from("household_members")
      .select("household_id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();

    if (!membership?.household_id) {
      return NextResponse.json({ success: false, message: "No active household found." }, { status: 404 });
    }

    const householdUrl = new URL(
      `/api/households/${membership.household_id}/statement-import`,
      request.url
    );

    return fetch(householdUrl.toString(), {
      method: "POST",
      headers: request.headers,
      body: request.body,
      // @ts-expect-error duplex required for streaming body in fetch
      duplex: "half",
    });
  } catch (error) {
    console.error("[statement-import/top] Unexpected error:", error);
    return NextResponse.json({ success: false, message: "An unexpected error occurred." }, { status: 500 });
  }
}
