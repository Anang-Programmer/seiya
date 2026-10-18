import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasUserPin } from "@/backend/services/pin.service";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, message: "Login required." }, { status: 401 });
    }

    const isConfigured = await hasUserPin(supabase, user.id);
    return NextResponse.json({
      success: true,
      hasPin: isConfigured,
    });
  } catch (error) {
    console.error("[auth/pin/status] Unexpected error:", error);
    return NextResponse.json({ success: false, message: "An unexpected error occurred." }, { status: 500 });
  }
}
