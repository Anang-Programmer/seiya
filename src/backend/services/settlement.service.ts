import type { SupabaseClient } from "@supabase/supabase-js";
import type { RpcError } from "./activity.service";

type SettlementRow = { partner_b_owes_a: number | string; partner_a_owes_b: number | string; currency: string };

function toSettlement(row: SettlementRow) {
  return {
    partnerBOwesA: Number(row.partner_b_owes_a) || 0,
    partnerAOwesB: Number(row.partner_a_owes_b) || 0,
    currency: row.currency || "IDR",
  };
}

// get_household_settlement creates the zero row on first read; members have
// no direct write access to household_settlements.
export async function getHouseholdSettlement(supabase: SupabaseClient, householdId: string) {
  const { data, error } = await supabase.rpc("get_household_settlement", { p_household_id: householdId });
  if (error || !data) {
    return { data: null, error: error ?? { message: "Settlement not found." } };
  }
  return { data: toSettlement(data as SettlementRow), error: null };
}

// Only the partner who is owed can clear the balance (42501 otherwise).
// The RPC records the "Settlement Completed" activity.
export async function settleUpHousehold(supabase: SupabaseClient, householdId: string) {
  const { data, error } = await supabase.rpc("settle_up_household", { p_household_id: householdId });
  return { data: (data as SettlementRow | null) ?? null, error: error as RpcError };
}

export const SETTLE_UP_FORBIDDEN_MESSAGE = "Only the partner who is owed can confirm the settlement.";
