
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { validateCreateHousehold } from "@/backend/validators/household";

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

    const { data: memberships, error: memberError } = await supabase
      .from("household_members")
      .select("id, household_id, role, status, created_at")
      .eq("user_id", user.id)
      .eq("status", "active");

    if (memberError) {
      return NextResponse.json(
        { success: false, message: "Unable to load memberships." },
        { status: 500 }
      );
    }

    if (!memberships || memberships.length === 0) {
      return NextResponse.json({ success: true, households: [] });
    }

    const householdIds = memberships.map((m) => m.household_id);

    const { data: households, error: hError } = await supabase
      .from("households")
      .select("*")
      .in("id", householdIds)
      .eq("status", "active");

    if (hError) {
      return NextResponse.json(
        { success: false, message: "Unable to load households." },
        { status: 500 }
      );
    }

    const { data: allMembers } = await supabase
      .from("household_members")
      .select("household_id, user_id, role, status")
      .in("household_id", householdIds)
      .eq("status", "active");

    const result = (households ?? []).map((h) => {
      const myMembership = memberships.find((m) => m.household_id === h.id);
      const members = (allMembers ?? []).filter((m) => m.household_id === h.id);
      const partner = members.find((m) => m.user_id !== user.id);

      return {
        ...h,
        myRole: myMembership?.role || "member",
        hasPartner: Boolean(partner),
        partnerUserId: partner?.user_id || null,
        membersCount: members.length,
      };
    });

    return NextResponse.json({ success: true, households: result });
  } catch (error) {
    console.error("[households/list] Unexpected error:", error);
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

  const validation = validateCreateHousehold(body);

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

    const { data: household, error } = await supabase.rpc(
      "create_household",
      {
        p_name: validation.data.name,
        p_country: validation.data.country,
        p_base_currency: validation.data.baseCurrency,
      }
    );

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          {
            success: false,
            code: "HOUSEHOLD_ALREADY_EXISTS",
            message: "You already belong to an active household.",
          },
          { status: 409 }
        );
      }

      if (error.code === "42501") {
        return NextResponse.json(
          { success: false, message: "Authentication required." },
          { status: 401 }
        );
      }

      if (error.code === "22023") {
        return NextResponse.json(
          { success: false, message: "Invalid household details." },
          { status: 400 }
        );
      }

      console.error("[households] Creation failed:", error);

      return NextResponse.json(
        { success: false, message: "Unable to create household." },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: "Household created successfully.",
        household,
        membership: {
          userId: user.id,
          role: "owner",
          status: "active",
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[households] Unexpected error:", error);

    return NextResponse.json(
      { success: false, message: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}
