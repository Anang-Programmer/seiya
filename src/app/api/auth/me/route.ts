
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  // The app's session check passes ?optional=1: a visitor who is not signed in
  // is a normal state there, so it gets 200 instead of a 401 console error.
  const optional = new URL(request.url).searchParams.get("optional") === "1";

  try {
    const supabase = await createClient();

    // Validate the current user with Supabase Auth.
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return optional
        ? NextResponse.json({ success: true, authenticated: false })
        : NextResponse.json({ success: false, message: "Login required." }, { status: 401 });
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

    const { data: member } = await supabase
      .from("household_members")
      .select("household_id, role")
      .eq("user_id", user.id)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();

    let householdData = null;
    if (member?.household_id) {
      const { data: household } = await supabase
        .from("households")
        .select("*")
        .eq("id", member.household_id)
        .maybeSingle();

      // Profiles are private per user; get_household_partner returns only the
      // partner's id, role and name to active members of the same household.
      const { data: partnerRow } = await supabase.rpc("get_household_partner", {
        p_household_id: member.household_id,
      });
      const partner = partnerRow as { user_id: string; role: string; full_name: string | null } | null;

      householdData = household ? {
        ...household,
        myRole: member.role,
        partner: partner?.user_id ? {
          userId: partner.user_id,
          fullName: partner.full_name,
          role: partner.role,
        } : null,
      } : null;
    }

    const { data: pinRecord } = await supabase
      .from("user_pins")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
      },
      profile,
      household: householdData,
      hasPin: Boolean(pinRecord),
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
