import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getHouseholdRole, recordHouseholdActivity } from "@/backend/services/activity.service";

async function getActiveHouseholdId(supabase: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await supabase
    .from("household_members")
    .select("household_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  return data?.household_id || null;
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, message: "Login required." }, { status: 401 });
    }

    const householdId = await getActiveHouseholdId(supabase, user.id);
    if (!householdId) {
      return NextResponse.json({ success: false, message: "No active household found." }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(Math.max(Number(searchParams.get("limit")) || 50, 1), 100);

    const { data: rows, error } = await supabase
      .from("transactions")
      .select("*")
      .eq("household_id", householdId)
      .neq("status", "cancelled")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      return NextResponse.json({ success: false, message: "Unable to load transactions." }, { status: 500 });
    }

    const [{ data: members }, { data: wallets }] = await Promise.all([
      supabase.from("household_members").select("user_id, role").eq("household_id", householdId),
      supabase.from("wallets").select("id, wallet_type, owner_user_id").eq("household_id", householdId),
    ]);
    const roleOf = new Map((members ?? []).map((m) => [m.user_id, m.role === "owner" ? "partner_a" : "partner_b"]));
    const walletOf = new Map(
      (wallets ?? []).map((w) => [
        w.id,
        w.wallet_type === "shared" ? "shared" : roleOf.get(w.owner_user_id) === "partner_b" ? "personal_b" : "personal_a",
      ])
    );

    const transactions = (rows ?? []).map((t) => {
      const isExpense = t.transaction_type === "expense";
      const rawAmount = Number(t.amount);
      const amount = isExpense ? -Math.abs(rawAmount) : Math.abs(rawAmount);

      return {
        id: t.id,
        title: t.description || "Transaction",
        amount,
        currency: t.currency || "IDR",
        category: t.category || "Others",
        wallet: walletOf.get(t.wallet_id) ?? "shared",
        paidBy: roleOf.get(t.created_by) ?? "partner_a",
        date: new Date(t.created_at).toLocaleDateString("en-US", {
          day: "numeric",
          month: "short",
          year: "numeric",
        }),
        timestamp: t.created_at,
        status: t.status,
      };
    });

    return NextResponse.json({ success: true, transactions });
  } catch (error) {
    console.error("[transactions/list] Unexpected error:", error);
    return NextResponse.json({ success: false, message: "An unexpected error occurred." }, { status: 500 });
  }
}

const ENGINE_ERRORS: Record<string, { status: number; message: string }> = {
  "42501": { status: 403, message: "You are not allowed to perform this transaction." },
  P0002: { status: 404, message: "Household or wallet not found." },
  "22023": { status: 409, message: "Household, wallet, or active finance agreement is not ready for this transaction." },
  P1001: { status: 409, message: "Not enough money in this wallet. Add money first, or choose another wallet." },
  P1002: { status: 409, message: "The active finance agreement has invalid transaction settings." },
  P1003: { status: 409, message: "Idempotency key was already used for a different request." },
};

const ACTIVITY_STATUS: Record<string, "ALLOW" | "NEED_APPROVAL" | "HOLD"> = {
  executed: "ALLOW",
  pending_approval: "NEED_APPROVAL",
  on_hold: "HOLD",
};

// Records through request_simulated_transaction so the couple rules, the
// balance reservation and the settlement trigger all apply. The payer is the
// signed-in member; the split comes from the active finance agreement.
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    body = typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON body." }, { status: 400 });
  }

  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, message: "Login required." }, { status: 401 });
    }

    const householdId = await getActiveHouseholdId(supabase, user.id);
    if (!householdId) {
      return NextResponse.json({ success: false, message: "No active household found." }, { status: 404 });
    }

    const title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : "Transaction";
    const amount = typeof body.amount === "number" && Number.isFinite(body.amount) ? body.amount : 0;
    const category = typeof body.category === "string" && body.category.trim() ? body.category.trim() : "Others";
    const wallet = body.wallet === "personal_a" || body.wallet === "personal_b" ? body.wallet : "shared";

    if (amount === 0) {
      return NextResponse.json({ success: false, message: "Amount must not be zero." }, { status: 400 });
    }

    const paidBy = await getHouseholdRole(supabase, householdId, user.id);
    if (wallet !== "shared" && wallet !== (paidBy === "partner_a" ? "personal_a" : "personal_b")) {
      return NextResponse.json(
        { success: false, message: "You cannot use another member's personal wallet." },
        { status: 403 }
      );
    }

    const walletQuery = supabase
      .from("wallets")
      .select("id")
      .eq("household_id", householdId)
      .eq("status", "active")
      .eq("wallet_type", wallet === "shared" ? "shared" : "personal");
    const { data: targetWallet } = await (wallet === "shared" ? walletQuery : walletQuery.eq("owner_user_id", user.id))
      .limit(1)
      .maybeSingle();

    if (!targetWallet) {
      return NextResponse.json({ success: false, message: "Wallet not found." }, { status: 404 });
    }

    const isExpense = amount < 0;
    const absAmount = Math.round(Math.abs(amount) * 100) / 100;

    const { data, error } = await supabase.rpc("request_simulated_transaction", {
      p_household_id: householdId,
      p_wallet_id: targetWallet.id,
      p_transaction_type: isExpense ? "expense" : "income",
      p_category: category.slice(0, 80),
      p_description: title.slice(0, 250),
      p_amount: absAmount,
      p_idempotency_key: `tx-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    });

    if (error) {
      const mapped = ENGINE_ERRORS[error.code ?? ""];
      return NextResponse.json(
        { success: false, message: mapped?.message ?? "Failed to record transaction." },
        { status: mapped?.status ?? 500 }
      );
    }

    const tx = (data as { transaction?: { id: string; status: string; currency: string; created_at: string } } | null)
      ?.transaction;
    if (!tx) {
      return NextResponse.json({ success: false, message: "Failed to record transaction." }, { status: 500 });
    }

    await recordHouseholdActivity(supabase, householdId, {
      title,
      category,
      status: ACTIVITY_STATUS[tx.status] ?? "INFO",
      amount: absAmount,
      currency: tx.currency,
      reason: `Transaction recorded to ${wallet}.`,
    });

    return NextResponse.json({
      success: true,
      message: tx.status === "executed"
        ? "Transaction recorded successfully."
        : tx.status === "pending_approval"
          ? "Transaction is waiting for partner approval."
          : "Transaction is on hold according to the household rules.",
      transaction: {
        id: tx.id,
        title,
        amount: isExpense ? -absAmount : absAmount,
        currency: tx.currency,
        category,
        wallet,
        paidBy,
        date: "Just now",
        timestamp: tx.created_at,
        status: tx.status,
      },
    }, { status: 201 });
  } catch (error) {
    console.error("[transactions/create] Unexpected error:", error);
    return NextResponse.json({ success: false, message: "An unexpected error occurred." }, { status: 500 });
  }
}
