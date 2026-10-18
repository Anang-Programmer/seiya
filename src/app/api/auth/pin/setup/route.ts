import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { validateSetPin } from "@/backend/validators/pin";
import { setUserPin } from "@/backend/services/pin.service";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON body." }, { status: 400 });
  }

  const validation = validateSetPin(body);
  if (!validation.ok) {
    return NextResponse.json({ success: false, message: validation.message }, { status: 400 });
  }

  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, message: "Login required." }, { status: 401 });
    }

    const { success } = await setUserPin(supabase, user.id, validation.data.pin);
    if (!success) {
      return NextResponse.json({ success: false, message: "Failed to configure PIN." }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: "Dual-Key security PIN successfully configured.",
    });
  } catch (error) {
    console.error("[auth/pin/setup] Unexpected error:", error);
    return NextResponse.json({ success: false, message: "An unexpected error occurred." }, { status: 500 });
  }
}
