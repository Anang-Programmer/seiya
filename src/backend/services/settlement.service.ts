import type { SupabaseClient } from "@supabase/supabase-js";
import { recordHouseholdActivity } from "./activity.service";

export async function getHouseholdSettlement(supabase: SupabaseClient, householdId: string) {
  const { data, error } = await supabase
    .from("household_settlements")
    .select("partner_b_owes_a, partner_a_owes_b, currency")
    .eq("household_id", householdId)
    .maybeSingle();

  if (error) {
    return { data: null, error };
  }

  if (!data) {
    const { data: household } = await supabase
      .from("households")
      .select("base_currency")
      .eq("id", householdId)
      .maybeSingle();

    const currency = household?.base_currency || "IDR";
    const initial = {
      household_id: householdId,
      partner_b_owes_a: 0,
      partner_a_owes_b: 0,
      currency,
    };

    await supabase.from("household_settlements").insert(initial);
    return { data: { partnerBOwesA: 0, partnerAOwesB: 0, currency }, error: null };
  }

  return {
    data: {
      partnerBOwesA: Number(data.partner_b_owes_a) || 0,
      partnerAOwesB: Number(data.partner_a_owes_b) || 0,
      currency: data.currency || "IDR",
    },
    error: null,
  };
}

export async function settleUpHousehold(supabase: SupabaseClient, householdId: string) {
  const { data, error } = await supabase
    .from("household_settlements")
    .update({
      partner_b_owes_a: 0,
      partner_a_owes_b: 0,
      updated_at: new Date().toISOString(),
    })
    .eq("household_id", householdId)
    .select("partner_b_owes_a, partner_a_owes_b, currency")
    .single();

  if (!error) {
    await recordHouseholdActivity(supabase, householdId, {
      title: "Settlement Completed",
      category: "Settlement",
      actor: "partner_a",
      status: "ALLOW",
      reason: "Shared expense ledger balance settled between partners.",
    });
  }

  return { data, error };
}
