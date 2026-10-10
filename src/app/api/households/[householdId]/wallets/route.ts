
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getHouseholdWallets,
  initializeHouseholdWallets,
} from "@/backend/services/wallet.service";

type RouteContext = {
  params: Promise<{ householdId: string }>;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(_request: Request, context: RouteContext) {
  const { householdId } = await context.params;

  if (!UUID_PATTERN.test(householdId)) {
    return NextResponse.json(
      { success: false, message: "Invalid household ID." },
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

    const { data, error } = await initializeHouseholdWallets(
      supabase,
      householdId
    );

    if (error) {
      console.error("[wallets/initialize]", error);

      if (error.code === "42501") {
        return NextResponse.json(
          { success: false, message: "Active household membership is required." },
          { status: 403 }
        );
      }

      if (error.code === "P0002") {
        return NextResponse.json(
          { success: false, message: "Household not found." },
          { status: 404 }
        );
      }

      if (error.code === "22023") {
        return NextResponse.json(
          {
            success: false,
            message: "Household must be active with two members and an active finance agreement.",
          },
          { status: 409 }
        );
      }

      return NextResponse.json(
        { success: false, message: "Unable to initialize wallets." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Household wallets initialized.",
      result: data,
    });
  } catch (error) {
    console.error("[wallets/initialize] Unexpected error:", error);

    return NextResponse.json(
      { success: false, message: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}

export async function GET(_request: Request, context: RouteContext) {
  const { householdId } = await context.params;

  if (!UUID_PATTERN.test(householdId)) {
    return NextResponse.json(
      { success: false, message: "Invalid household ID." },
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

    const { data: membership, error: membershipError } = await supabase
      .from("household_members")
      .select("id")
      .eq("household_id", householdId)
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();

    if (membershipError) {
      console.error("[wallets/list] Membership lookup failed:", membershipError);
      return NextResponse.json(
        { success: false, message: "Unable to verify household membership." },
        { status: 500 }
      );
    }

    if (!membership) {
      return NextResponse.json(
        { success: false, message: "Active household membership required." },
        { status: 403 }
      );
    }

    const { data: wallets, error } = await getHouseholdWallets(
      supabase,
      householdId
    );

    if (error) {
      console.error("[wallets/list] Query failed:", error);
      return NextResponse.json(
        { success: false, message: "Unable to load wallets." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      wallets: wallets ?? [],
    });
  } catch (error) {
    console.error("[wallets/list] Unexpected error:", error);

    return NextResponse.json(
      { success: false, message: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}
