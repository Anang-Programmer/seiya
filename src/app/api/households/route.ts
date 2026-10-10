
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { validateCreateHousehold } from "@/backend/validators/household";

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
