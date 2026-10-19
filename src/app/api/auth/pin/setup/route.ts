import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { validateSetPin } from "@/backend/validators/pin";
import { checkUserPin, hasUserPin, PIN_LOCKED_MESSAGE, setUserPin } from "@/backend/services/pin.service";

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

    // Changing an existing PIN needs the current one; otherwise anyone holding an
    // unlocked, signed-in phone could replace the PIN and approve requests.
    if (await hasUserPin(supabase, user.id)) {
      const currentPin = typeof (body as { currentPin?: unknown }).currentPin === "string"
        ? (body as { currentPin: string }).currentPin.trim()
        : "";
      const check = /^\d{6}$/.test(currentPin) ? await checkUserPin(supabase, user.id, currentPin) : "invalid";
      if (check !== "valid") {
        return NextResponse.json(
          {
            success: false,
            message: check === "locked" ? PIN_LOCKED_MESSAGE : "A security PIN is already set. Enter your current PIN to change it.",
          },
          { status: check === "locked" ? 429 : 409 }
        );
      }
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
