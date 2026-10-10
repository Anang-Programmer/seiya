
import type { SupabaseClient } from "@supabase/supabase-js";

export async function initializeHouseholdWallets(
  supabase: SupabaseClient,
  householdId: string
) {
  return supabase.rpc("initialize_household_wallets", {
    p_household_id: householdId,
  });
}

export async function getHouseholdWallets(
  supabase: SupabaseClient,
  householdId: string
) {
  return supabase
    .from("wallets")
    .select(
      "id, household_id, wallet_type, owner_user_id, name, currency, simulated_balance, status, created_at"
    )
    .eq("household_id", householdId)
    .eq("status", "active")
    .order("wallet_type");
}
