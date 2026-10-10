
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createClient();

    // Validate the current user with Supabase Auth.
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        {
          success: false,
          message: "Login required.",
        },
        { status: 401 }
      );
    }

    // Load the user's own Seiya profile.
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select(
        "id, full_name, city, country, preferred_language, children_count"
      )
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      console.error("[auth/me] Profile query failed:", profileError);

      return NextResponse.json(
        {
          success: false,
          message: "Unable to load your profile.",
        },
        { status: 500 }
      );
    }

    if (!profile) {
      return NextResponse.json(
        {
          success: false,
          code: "PROFILE_NOT_FOUND",
          message: "Account exists, but its Seiya profile is missing.",
        },
        { status: 409 }
      );
    }

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
      },
      profile,
    });
  } catch (error) {
    console.error("[auth/me] Unexpected error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "An unexpected error occurred.",
      },
      { status: 500 }
    );
  }
}
