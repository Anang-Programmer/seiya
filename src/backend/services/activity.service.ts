import type { SupabaseClient } from "@supabase/supabase-js";

// The actor is the signed-in member (set by log_household_activity); DENY and
// partner decisions are recorded only by the server-side RPCs.
export interface RecordActivityInput {
  title: string;
  category?: string;
  status?: "ALLOW" | "NEED_APPROVAL" | "HOLD" | "INFO";
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
  const result = await supabase.rpc("log_household_activity", {
    p_household_id: householdId,
    p_title: input.title.slice(0, 200),
    p_category: (input.category || "Activity").slice(0, 80),
    p_status: input.status || "INFO",
    p_amount: input.amount ?? null,
    p_currency: input.currency ?? null,
    p_reason: (input.reason || "").slice(0, 1000),
  });
  if (result.error) {
    console.warn("[activity] Not recorded:", result.error.code, result.error.message);
  }
  return result;
}

export type PartnerRole = "partner_a" | "partner_b";

// The household owner is partner_a; the invited partner is partner_b.
export async function getHouseholdRole(
  supabase: SupabaseClient,
  householdId: string,
  userId: string
): Promise<PartnerRole> {
  const { data } = await supabase
    .from("household_members")
    .select("role")
    .eq("household_id", householdId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  return data?.role === "owner" ? "partner_a" : "partner_b";
}

export function otherPartnerRole(role: PartnerRole): PartnerRole {
  return role === "partner_a" ? "partner_b" : "partner_a";
}

// Supabase RPC errors carry the SQLSTATE in `code` and the RAISE text in `message`.
export type RpcError = { code?: string; message?: string } | null;
