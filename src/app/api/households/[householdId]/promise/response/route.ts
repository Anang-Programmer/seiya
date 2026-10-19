import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { validatePromiseSelection } from "@/backend/validators/promise";

type RouteContext = {
  params: Promise<{ householdId: string }>;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Saves the caller's selected/edited clauses. When both partners submitted the
 * same version the promise activates and becomes the active finance rules.
 */
export async function POST(request: Request, context: RouteContext) {
  const { householdId } = await context.params;

  if (!UUID_PATTERN.test(householdId)) {
    return NextResponse.json({ success: false, message: "Invalid household ID." }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON body." }, { status: 400 });
  }

  const validation = validatePromiseSelection(body);
  if (!validation.ok) {
    return NextResponse.json({ success: false, message: validation.message }, { status: 400 });
  }

  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, message: "Login required." }, { status: 401 });
    }

    const { data, error } = await supabase.rpc("submit_household_promise_response", {
      p_household_id: householdId,
      p_selected: validation.data,
    });

    if (error) {
      console.error("[promise/response]", error);
      const known: Record<string, { status: number; message: string }> = {
        "42501": { status: 403, message: "Active household membership required." },
        P0002: { status: 409, message: "Recommendations are not ready yet." },
        "22023": { status: 409, message: error.message || "This promise can no longer be changed." },
      };
      const mapped = known[error.code ?? ""];
      return NextResponse.json(
        { success: false, message: mapped?.message ?? "Unable to save your clauses." },
        { status: mapped?.status ?? 500 }
      );
    }

    const result = data as { outcome: string; status: unknown };
    return NextResponse.json({ success: true, myUserId: user.id, outcome: result.outcome, status: result.status });
  } catch (error) {
    console.error("[promise/response] Unexpected error:", error);
    return NextResponse.json({ success: false, message: "An unexpected error occurred." }, { status: 500 });
  }
}
