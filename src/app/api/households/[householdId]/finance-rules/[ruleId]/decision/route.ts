
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { validateFinanceRuleDecision } from "@/backend/validators/finance-rules";
import { decideFinanceRules } from "@/backend/services/finance-rules.service";

type RouteContext = {
  params: Promise<{ householdId: string; ruleId: string }>;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request, context: RouteContext) {
  const { householdId, ruleId } = await context.params;

  if (!UUID_PATTERN.test(householdId) || !UUID_PATTERN.test(ruleId)) {
    return NextResponse.json(
      { success: false, message: "Invalid household or rule ID." },
      { status: 400 }
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, message: "Invalid JSON body." },
      { status: 400 }
    );
  }

  const validation = validateFinanceRuleDecision(body);

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

    // Verify that this rule belongs to the household in the URL.
    // RLS also ensures the caller can read this household's rules.
    const { data: existingRule, error: lookupError } = await supabase
      .from("household_finance_rules")
      .select("id, household_id, status")
      .eq("id", ruleId)
      .eq("household_id", householdId)
      .maybeSingle();

    if (lookupError) {
      console.error("[finance-rules/decision] Lookup failed:", lookupError);

      return NextResponse.json(
        { success: false, message: "Unable to verify finance rule." },
        { status: 500 }
      );
    }

    if (!existingRule) {
      return NextResponse.json(
        { success: false, message: "Finance rule not found." },
        { status: 404 }
      );
    }

    if (existingRule.status !== "pending_approval") {
      return NextResponse.json(
        { success: false, message: "This finance rule is no longer pending." },
        { status: 409 }
      );
    }

    const { data, error } = await decideFinanceRules(
      supabase,
      ruleId,
      validation.data
    );

    if (error) {
      console.error("[finance-rules/decision] RPC failed:", error);

      if (error.code === "42501") {
        return NextResponse.json(
          { success: false, message: "You are not allowed to decide this rule." },
          { status: 403 }
        );
      }

      if (error.code === "23505" || error.code === "22023") {
        return NextResponse.json(
          { success: false, message: "This approval has already been decided or is no longer pending." },
          { status: 409 }
        );
      }

      if (error.code === "P0002") {
        return NextResponse.json(
          { success: false, message: "Finance rule not found." },
          { status: 404 }
        );
      }

      return NextResponse.json(
        { success: false, message: "Unable to process this decision." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message:
        validation.data.decision === "approved"
          ? "Finance rule approval recorded."
          : "Finance rule rejected.",
      rule: data,
    });
  } catch (error) {
    console.error("[finance-rules/decision] Unexpected error:", error);

    return NextResponse.json(
      { success: false, message: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}
