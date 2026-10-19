
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { signUpWithUsername } from "@/backend/services/auth.service";
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
    let admin;
    try {
      admin = createAdminClient();
    } catch {
      console.error("[auth/signup] SUPABASE_SERVICE_ROLE_KEY is not configured.");
      return NextResponse.json(
        { success: false, message: "Sign-up is temporarily unavailable." },
        { status: 503 }
      );
    }

    const supabase = await createClient();
    const { data, error, usernameTaken } = await signUpWithUsername(
      admin,
      supabase,
      validation.data
    );

    if (usernameTaken) {
      return NextResponse.json(
        {
          success: false,
          code: "USERNAME_TAKEN",
          message: "This name is already used by another account. Please add something to make it unique.",
        },
        { status: 409 }
      );
    }

    if (error || !data?.user) {
      console.warn("[auth/signup] Account creation failed:", error?.code ?? error?.status);
      return NextResponse.json(
        { success: false, message: "Unable to create the account. Please try again." },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: "Account created successfully.",
        needsEmailConfirmation: false,
        user: {
          id: data.user.id,
          fullName: validation.data.fullName,
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
