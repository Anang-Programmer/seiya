import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CreateTransactionInput,
  TransactionDecisionInput,
} from "@/backend/validators/transaction";

export async function requestSimulatedTransaction(
  supabase: SupabaseClient,
  householdId: string,
  input: CreateTransactionInput
) {
  return supabase.rpc("request_simulated_transaction", {
    p_household_id: householdId,
    p_wallet_id: input.walletId,
    p_transaction_type: input.transactionType,
    p_category: input.category,
    p_description: input.description,
    p_amount: input.amount,
    p_idempotency_key: input.idempotencyKey,
  });
}

export async function decideSimulatedTransaction(
  supabase: SupabaseClient,
  transactionId: string,
  input: TransactionDecisionInput
) {
  return supabase.rpc("decide_simulated_transaction", {
    p_transaction_id: transactionId,
    p_decision: input.decision,
    p_note: input.note,
  });
}

export async function executeHeldSimulatedTransaction(
  supabase: SupabaseClient,
  transactionId: string
) {
  return supabase.rpc("execute_held_simulated_transaction", {
    p_transaction_id: transactionId,
  });
}
