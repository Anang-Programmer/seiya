
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { saveOnboarding } from "@/backend/services/onboarding.service";
import { validateOnboarding } from "@/backend/validators/onboarding";

export async function GET() {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, message: "Login required." },
        { status: 401 }
      );
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select(
        "id, full_name, city, country, preferred_language, children_count"
      )
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      console.error("[onboarding] Profile lookup failed:", profileError);
      return NextResponse.json(
        { success: false, message: "Unable to load profile." },
        { status: 500 }
      );
    }

    const { data: onboarding, error: onboardingError } = await supabase
      .from("onboarding_responses")
      .select("id, response_version, answers, completed_at, created_at")
      .eq("user_id", user.id)
      .order("response_version", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (onboardingError) {
      console.error("[onboarding] Response lookup failed:", onboardingError);
      return NextResponse.json(
        { success: false, message: "Unable to load onboarding." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      profile,
      onboarding: onboarding ?? null,
    });
  } catch (error) {
    console.error("[onboarding GET] Unexpected error:", error);
    return NextResponse.json(
      { success: false, message: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}

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

  const validation = validateOnboarding(body);

  if (!validation.ok) {
    return NextResponse.json(
      { success: false, message: validation.message },
      { status: 400 }
    );
  }

  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, message: "Login required." },
        { status: 401 }
      );
    }

    const result = await saveOnboarding(
      supabase,
      user.id,
      validation.data
    );

    return NextResponse.json({
      success: true,
      message: "Onboarding saved successfully.",
      profile: result.profile,
      onboarding: result.onboarding,
    });
  } catch (error) {
    console.error("[onboarding POST] Save failed:", error);

    if (
      error instanceof Error &&
      error.message === "PROFILE_NOT_FOUND"
    ) {
      return NextResponse.json(
        {
          success: false,
          code: "PROFILE_NOT_FOUND",
          message: "Your profile was not found. Please contact support.",
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { success: false, message: "Unable to save onboarding." },
      { status: 500 }
    );
  }
}
