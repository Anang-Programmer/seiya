
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { signInWithEmail } from "@/backend/services/auth.service";
import { validateSignIn } from "@/backend/validators/auth";

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, message: "Invalid JSON body." },
      { status: 400 }
    );
  }

  const validation = validateSignIn(body);

  if (!validation.ok) {
    return NextResponse.json(
      { success: false, message: validation.message },
      { status: 400 }
    );
  }

  try {
    const supabase = await createClient();
    const { data, error } = await signInWithEmail(
      supabase,
      validation.data
    );

    if (error || !data.user) {
      return NextResponse.json(
        {
          success: false,
          message: "Email or password is incorrect, or sign-in is unavailable.",
        },
        { status: 401 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Signed in successfully.",
      user: {
        id: data.user.id,
        email: data.user.email,
      },
    });
  } catch (error) {
    console.error("[auth/signin] Unexpected server error:", error);

    return NextResponse.json(
      { success: false, message: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}
