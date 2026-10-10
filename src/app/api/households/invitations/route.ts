
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { validateCreateInvitation } from "@/backend/validators/household-invitation";
import { createHouseholdInvitation } from "@/backend/services/household-invitation.service";

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

  const validation = validateCreateInvitation(body);

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

    const result = await createHouseholdInvitation(
      supabase,
      validation.data
    );

    if (!result.success) {
      const { code } = result.error;

      const mapped = {
        "42501": { status: 403, message: "Only the active household owner can invite." },
        "23505": { status: 409, message: "Household cannot accept another invitation." },
        "22023": { status: 400, message: "Invalid invitation details." },
        "P0002": { status: 404, message: "Household not found." },
      }[code ?? ""];

      if (mapped) {
        return NextResponse.json(
          { success: false, message: mapped.message },
          { status: mapped.status }
        );
      }

      console.error("[invitation/create] Database error:", result.error);

      return NextResponse.json(
        { success: false, message: "Unable to create invitation." },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: "Invitation created. Share the link with your partner.",
        invitation: result.invitation,
        inviteUrl: result.inviteUrl,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[invitation/create] Unexpected error:", error);

    return NextResponse.json(
      { success: false, message: "Unable to create invitation." },
      { status: 500 }
    );
  }
}
