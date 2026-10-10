
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { signUpWithEmail } from "@/backend/services/auth.service";
import { validateSignUp } from "@/backend/validators/auth";

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

  const validation = validateSignUp(body);

  if (!validation.ok) {
    return NextResponse.json(
      { success: false, message: validation.message },
      { status: 400 }
    );
  }

  try {
    const supabase = await createClient();
    const { data, error } = await signUpWithEmail(
      supabase,
      validation.data
    );

    if (error) {
      console.warn("[auth/signup] Supabase Auth rejected signup:", error.code);

      return NextResponse.json(
        {
          success: false,
          message:
            "Unable to create the account. Check the details or try another email.",
        },
        { status: 400 }
      );
    }

    if (!data.user) {
      return NextResponse.json(
        { success: false, message: "Account creation was not confirmed." },
        { status: 500 }
      );
    }

    const needsEmailConfirmation = !data.session;

    return NextResponse.json(
      {
        success: true,
        message: needsEmailConfirmation
          ? "Account created. Please check your email to confirm it."
          : "Account created successfully.",
        needsEmailConfirmation,
        user: {
          id: data.user.id,
          email: data.user.email,
          fullName:
            data.user.user_metadata?.full_name ??
            validation.data.fullName,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[auth/signup] Unexpected server error:", error);

    return NextResponse.json(
      { success: false, message: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}
