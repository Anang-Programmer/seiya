import type { SupabaseClient } from "@supabase/supabase-js";

export interface RecordActivityInput {
  title: string;
  category?: string;
  actor?: "partner_a" | "partner_b" | "seiya";
  status?: "ALLOW" | "NEED_APPROVAL" | "HOLD" | "DENY" | "INFO";
  amount?: number;
  currency?: string;
  reason?: string;
}

export async function listHouseholdActivities(
  supabase: SupabaseClient,
  householdId: string,
  limit: number = 50
) {
  const boundedLimit = Math.min(Math.max(limit, 1), 100);
  return supabase
    .from("activities")
    .select("*")
    .eq("household_id", householdId)
    .order("created_at", { ascending: false })
    .limit(boundedLimit);
}

export async function recordHouseholdActivity(
  supabase: SupabaseClient,
  householdId: string,
  input: RecordActivityInput
) {
  return supabase
    .from("activities")
    .insert({
      household_id: householdId,
      title: input.title,
      category: input.category || "Activity",
      actor: input.actor || "seiya",
      status: input.status || "INFO",
      amount: input.amount ?? null,
      currency: input.currency ?? null,
      reason: input.reason || "",
    })
    .select()
    .single();
}
