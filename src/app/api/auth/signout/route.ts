
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        {
          success: false,
          message: "You are not signed in.",
        },
        { status: 401 }
      );
    }

    // Sign out this session only.
    const { error } = await supabase.auth.signOut({
      scope: "local",
    });

    if (error) {
      console.error("[auth/signout] Signout failed:", error);

      return NextResponse.json(
        {
          success: false,
          message: "Unable to sign out.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Signed out successfully.",
    });
  } catch (error) {
    console.error("[auth/signout] Unexpected error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "An unexpected error occurred.",
      },
      { status: 500 }
    );
  }
}
