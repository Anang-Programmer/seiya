
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

      const { data: partnerMember } = await supabase
        .from("household_members")
        .select("user_id, role")
        .eq("household_id", member.household_id)
        .neq("user_id", user.id)
        .eq("status", "active")
        .maybeSingle();

      let partnerProfile = null;
      if (partnerMember?.user_id) {
        const { data: pProfile } = await supabase
          .from("profiles")
          .select("id, full_name")
          .eq("id", partnerMember.user_id)
          .maybeSingle();
        partnerProfile = pProfile;
      }

      householdData = household ? {
        ...household,
        myRole: member.role,
        partner: partnerProfile ? {
          userId: partnerProfile.id,
          fullName: partnerProfile.full_name,
          role: partnerMember?.role,
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
