import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { validateFinanceRules } from "@/backend/validators/finance-rules";
import { proposeFinanceRules } from "@/backend/services/finance-rules.service";

type RouteContext = {
  params: Promise<{ householdId: string }>;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function databaseErrorResponse(code?: string) {
  const errors: Record<string, { status: number; message: string }> = {
    "42501": {
      status: 403,
      message: "Active household membership is required.",
    },
    "23505": {
      status: 409,
      message: "A finance agreement is already pending.",
    },
    "22023": {
      status: 400,
      message: "The household or rules are not valid for this action.",
    },
    P0002: {
      status: 404,
      message: "Household or finance agreement not found.",
    },
  };

  const mapped = errors[code ?? ""];

  return mapped
    ? NextResponse.json(
        { success: false, message: mapped.message },
        { status: mapped.status },
      )
    : NextResponse.json(
        {
          success: false,
          message: "Unable to process finance rules.",
        },
        { status: 500 },
      );
}

/**
 * Explicitly verify that the current authenticated user is
 * an active member of the requested household.
 *
 * Returns null when access is allowed; otherwise returns
 * an HTTP response that the caller should return immediately.
 */
async function verifyHouseholdMembership(
  supabase: Awaited<ReturnType<typeof createClient>>,
  householdId: string,
): Promise<NextResponse | null> {
  const { data: isMember, error: membershipError } = await supabase.rpc(
    "is_household_member",
    {
      target_household_id: householdId,
    },
  );

  if (membershipError) {
    console.error("[finance-rules/membership]", membershipError);

    return NextResponse.json(
      {
        success: false,
        message: "Unable to verify household access.",
      },
      { status: 500 },
    );
  }

  if (isMember !== true) {
    return NextResponse.json(
      {
        success: false,
        message: "Household access denied.",
      },
      { status: 403 },
    );
  }

  return null;
}

export async function POST(request: Request, context: RouteContext) {
  const { householdId } = await context.params;

  if (!UUID_PATTERN.test(householdId)) {
    return NextResponse.json(
      { success: false, message: "Invalid household ID." },
      { status: 400 },
    );
  }

  try {
    const supabase = await createClient();

    // 1. Verify the user's authentication session.
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, message: "Login required." },
        { status: 401 },
      );
    }

    // 2. Explicitly verify active household membership
    // before processing or proposing financial rules.
    const membershipResponse = await verifyHouseholdMembership(
      supabase,
      householdId,
    );

    if (membershipResponse) {
      return membershipResponse;
    }

    // 3. Parse and validate the request body.
    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, message: "Invalid JSON body." },
        { status: 400 },
      );
    }

    const rawRules =
      typeof body === "object" && body !== null && "rules" in body
        ? (body as { rules: unknown }).rules
        : body;

    const validation = validateFinanceRules(rawRules);

    if (!validation.ok) {
      return NextResponse.json(
        { success: false, message: validation.message },
        { status: 400 },
      );
    }

    // 4. Propose rules through the existing business service.
    const { data, error } = await proposeFinanceRules(
      supabase,
      householdId,
      validation.data,
    );

    if (error) {
      console.error("[finance-rules/propose]", error);
      return databaseErrorResponse(error.code);
    }

    return NextResponse.json(
      {
        success: true,
        message: "Finance rules submitted for partner approval.",
        rule: data,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("[finance-rules/propose] Unexpected error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "An unexpected error occurred.",
      },
      { status: 500 },
    );
  }
}

export async function GET(_request: Request, context: RouteContext) {
  const { householdId } = await context.params;

  if (!UUID_PATTERN.test(householdId)) {
    return NextResponse.json(
      { success: false, message: "Invalid household ID." },
      { status: 400 },
    );
  }

  try {
    const supabase = await createClient();

    // 1. Verify the user's authentication session.
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, message: "Login required." },
        { status: 401 },
      );
    }

    // 2. Reject non-members before querying any household rules.
    const membershipResponse = await verifyHouseholdMembership(
      supabase,
      householdId,
    );

    if (membershipResponse) {
      return membershipResponse;
    }

    // 3. Fetch financial rules.
    const { data: rules, error: rulesError } = await supabase
      .from("household_finance_rules")
      .select(
        "id, household_id, version, created_by, rules, status, created_at, activated_at",
      )
      .eq("household_id", householdId)
      .order("version", { ascending: false })
      .limit(20);

    if (rulesError) {
      console.error("[finance-rules/list]", rulesError);

      return NextResponse.json(
        {
          success: false,
          message: "Unable to load finance rules.",
        },
        { status: 500 },
      );
    }

    // 4. Fetch approval records for the returned rules only.
    const ruleIds = (rules ?? []).map((rule) => rule.id);

    let approvals: Array<{
      id: string;
      rule_id: string;
      user_id: string;
      decision: string;
      decided_at: string | null;
      note: string | null;
    }> = [];

    if (ruleIds.length > 0) {
      const { data: approvalRows, error: approvalsError } = await supabase
        .from("household_rule_approvals")
        .select("id, rule_id, user_id, decision, decided_at, note")
        .in("rule_id", ruleIds);

      if (approvalsError) {
        console.error("[finance-rules/approvals]", approvalsError);

        return NextResponse.json(
          {
            success: false,
            message: "Unable to load approval status.",
          },
          { status: 500 },
        );
      }

      approvals = approvalRows ?? [];
    }

    return NextResponse.json({
      success: true,
      rules: rules ?? [],
      approvals,
    });
  } catch (error) {
    console.error("[finance-rules/list] Unexpected error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "An unexpected error occurred.",
      },
      { status: 500 },
    );
  }
}