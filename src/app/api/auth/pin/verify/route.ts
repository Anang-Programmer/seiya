import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { validateVerifyPin } from "@/backend/validators/pin";
import { verifyUserPin } from "@/backend/services/pin.service";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON body." }, { status: 400 });
  }

  const validation = validateVerifyPin(body);
  if (!validation.ok) {
    return NextResponse.json({ success: false, message: validation.message }, { status: 400 });
  }

  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, message: "Login required." }, { status: 401 });
    }

    const targetUserId = validation.data.userId || user.id;
    const isValid = await verifyUserPin(supabase, targetUserId, validation.data.pin);

    return NextResponse.json({
      success: isValid,
      valid: isValid,
      message: isValid ? "PIN verified successfully." : "Invalid security PIN.",
    }, { status: isValid ? 200 : 401 });
  } catch (error) {
    console.error("[auth/pin/verify] Unexpected error:", error);
    return NextResponse.json({ success: false, message: "An unexpected error occurred." }, { status: 500 });
  }
}
