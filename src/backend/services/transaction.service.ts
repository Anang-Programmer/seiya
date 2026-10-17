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

export async function undoSimulatedTransaction(
  supabase: SupabaseClient,
  householdId: string,
  transactionId: string
) {
  const { data: tx, error: findError } = await supabase
    .from("transactions")
    .select("*")
    .eq("household_id", householdId)
    .eq("id", transactionId)
    .maybeSingle();

  if (findError || !tx) {
    return { success: false, code: "NOT_FOUND", message: "Transaction not found." };
  }

  const createdAt = new Date(tx.created_at).getTime();
  const now = Date.now();
  if (now - createdAt > 10 * 60 * 1000) {
    return { success: false, code: "UNDO_WINDOW_EXPIRED", message: "Undo window (10 minutes) has elapsed." };
  }

  if (tx.status === "executed" && tx.wallet_id) {
    const { data: wallet } = await supabase
      .from("wallets")
      .select("id, simulated_balance")
      .eq("id", tx.wallet_id)
      .maybeSingle();

    if (wallet) {
      const delta = tx.transaction_type === "expense" ? Number(tx.amount) : -Number(tx.amount);
      await supabase
        .from("wallets")
        .update({
          simulated_balance: Number(wallet.simulated_balance) + delta,
        })
        .eq("id", wallet.id);
    }
  }

  const { error: updateError } = await supabase
    .from("transactions")
    .update({ status: "cancelled" })
    .eq("id", transactionId);

  if (!updateError) {
    await supabase.from("activities").insert({
      household_id: householdId,
      title: `Undo: ${tx.description || "Transaction"}`,
      category: "Undo",
      actor: "partner_a",
      status: "INFO",
      amount: tx.amount,
      currency: tx.currency,
      reason: "Eligible transaction entry reverted within 10-minute undo window.",
    });
  }

  return { success: !updateError, message: "Transaction undone successfully." };
}

