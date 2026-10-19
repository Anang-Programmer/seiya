import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generatePromiseClauses, type PartnerContext } from "@/backend/services/promise.service";

type RouteContext = {
  params: Promise<{ householdId: string }>;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type MemberProgress = {
  user_id: string;
  role: "owner" | "partner";
  full_name: string | null;
  onboarding_done: boolean;
  history_done: boolean;
};

type PromiseStatus = {
  members: MemberProgress[];
  promise: { id: string; clauses: unknown[]; status: string; generated_by: string | null } | null;
  responses: Array<{ user_id: string; selected: unknown[]; submitted_at: string }>;
};

// One generation per household at a time within this server instance.
const inFlight = new Map<string, Promise<void>>();

async function generateForHousehold(
  supabase: Awaited<ReturnType<typeof createClient>>,
  householdId: string,
  members: MemberProgress[]
) {
  // Partners' onboarding answers are private to each of them, so they are read
  // with the service role here and never returned to the client.
  const admin = createAdminClient();

  const { data: household } = await admin
    .from("households")
    .select("base_currency")
    .eq("id", householdId)
    .maybeSingle();

  const partners: PartnerContext[] = [];
  for (const member of members) {
    const { data: onboarding } = await admin
      .from("onboarding_responses")
      .select("answers")
      .eq("user_id", member.user_id)
      .not("completed_at", "is", null)
      .order("response_version", { ascending: false })
      .limit(1)
      .maybeSingle();

    partners.push({
      role: member.role === "owner" ? "partner_a" : "partner_b",
      name: member.full_name || (member.role === "owner" ? "Partner A" : "Partner B"),
      answers: (onboarding?.answers as Record<string, unknown> | null) ?? null,
    });
  }

  const { clauses, generatedBy } = await generatePromiseClauses(partners, household?.base_currency || "IDR");

  const { error } = await supabase.rpc("save_household_promise_clauses", {
    p_household_id: householdId,
    p_clauses: clauses,
    p_generated_by: generatedBy,
  });

  if (error) {
    console.error("[promise/generate] save failed:", error);
  }
}

export async function GET(_request: Request, context: RouteContext) {
  const { householdId } = await context.params;

  if (!UUID_PATTERN.test(householdId)) {
    return NextResponse.json({ success: false, message: "Invalid household ID." }, { status: 400 });
  }

  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, message: "Login required." }, { status: 401 });
    }

    const load = async () => {
      const { data, error } = await supabase.rpc("get_household_promise_status", {
        p_household_id: householdId,
      });
      if (error) throw error;
      return data as PromiseStatus;
    };

    let status = await load();

    const bothDone =
      status.members.length === 2 &&
      status.members.every((m) => m.onboarding_done && m.history_done);

    // Recommendations open once both partners finished onboarding and history.
    if (!status.promise && bothDone) {
      let job = inFlight.get(householdId);
      if (!job) {
        job = generateForHousehold(supabase, householdId, status.members).finally(() => {
          inFlight.delete(householdId);
        });
        inFlight.set(householdId, job);
      }
      try {
        await job;
      } catch (error) {
        console.error("[promise/generate] failed:", error);
      }
      status = await load();
    }

    return NextResponse.json({ success: true, myUserId: user.id, status });
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === "42501") {
      return NextResponse.json({ success: false, message: "Active household membership required." }, { status: 403 });
    }
    console.error("[promise] Unexpected error:", error);
    return NextResponse.json({ success: false, message: "Unable to load Seiya's Promise." }, { status: 500 });
  }
}
