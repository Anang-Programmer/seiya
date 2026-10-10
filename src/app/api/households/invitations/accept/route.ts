
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { validateAcceptInvitation } from "@/backend/validators/household-invitation";
import { acceptHouseholdInvitation } from "@/backend/services/household-invitation.service";

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

  const validation = validateAcceptInvitation(body);

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
        { success: false, message: "Please log in before accepting the invitation." },
        { status: 401 }
      );
    }

    const result = await acceptHouseholdInvitation(
      supabase,
      validation.data
    );

    if (!result.success) {
      const { code } = result.error;

      const mapped = {
        "42501": { status: 403, message: "Your account is not allowed to accept this invitation." },
        "23505": { status: 409, message: "You or this household already has an active membership limit." },
        "22023": { status: 400, message: "The invitation is invalid, expired, or already used." },
        "P0002": { status: 404, message: "Invitation not found." },
      }[code ?? ""];

      if (mapped) {
        return NextResponse.json(
          { success: false, message: mapped.message },
          { status: mapped.status }
        );
      }

      console.error("[invitation/accept] Database error:", result.error);

      return NextResponse.json(
        { success: false, message: "Unable to accept invitation." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "You have joined the household.",
      result: result.data,
    });
  } catch (error) {
    console.error("[invitation/accept] Unexpected error:", error);

    return NextResponse.json(
      { success: false, message: "Unable to accept invitation." },
      { status: 500 }
    );
  }
}
