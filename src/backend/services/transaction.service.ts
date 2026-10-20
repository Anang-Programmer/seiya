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

// Approving needs the approver's PIN, checked (with the wrong-PIN lockout) by
// the RPC. Returns { ok: false, reason } for a missing, wrong or locked PIN and
// { ok: true, transaction } otherwise.
export async function decideSimulatedTransaction(
  supabase: SupabaseClient,
  transactionId: string,
  input: TransactionDecisionInput
) {
  return supabase.rpc("decide_simulated_transaction_with_pin", {
    p_transaction_id: transactionId,
    p_decision: input.decision,
    p_note: input.note,
    p_pin: input.decision === "approved" ? input.pin ?? null : null,
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

const UNDO_ERRORS: Record<string, { code: string; message: string }> = {
  P0002: { code: "NOT_FOUND", message: "Transaction not found." },
  P1007: { code: "UNDO_WINDOW_EXPIRED", message: "Undo window (10 minutes) has elapsed." },
  "42501": { code: "FORBIDDEN", message: "Only the member who created a transaction can undo it." },
  P1001: { code: "INSUFFICIENT_BALANCE", message: "This income has already been spent and cannot be undone." },
  "22023": { code: "NOT_UNDOABLE", message: "This transaction can no longer be undone." },
};

// Refunds the wallet (if executed), cancels the transaction and its pending
// approvals, and reverses the settlement share atomically.
export async function undoSimulatedTransaction(
  supabase: SupabaseClient,
  transactionId: string
) {
  const { error } = await supabase.rpc("undo_simulated_transaction", {
    p_transaction_id: transactionId,
  });

  if (error) {
    const mapped = UNDO_ERRORS[error.code ?? ""];
    return mapped
      ? { success: false, ...mapped }
      : { success: false, code: "DB_ERROR", message: "Unable to undo transaction." };
  }

  return { success: true, message: "Transaction undone successfully." };
}
