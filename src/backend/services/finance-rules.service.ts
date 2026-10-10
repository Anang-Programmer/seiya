
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  FinanceRuleDecision,
  FinanceRules,
} from "@/backend/validators/finance-rules";

export async function proposeFinanceRules(
  supabase: SupabaseClient,
  householdId: string,
  rules: FinanceRules
) {
  return supabase.rpc("propose_household_finance_rules", {
    p_household_id: householdId,
    p_rules: rules,
  });
}

export async function decideFinanceRules(
  supabase: SupabaseClient,
  ruleId: string,
  input: FinanceRuleDecision
) {
  return supabase.rpc("decide_household_finance_rule", {
    p_rule_id: ruleId,
    p_decision: input.decision,
    p_note: input.note,
  });
}
