import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { recordHouseholdActivity } from "@/backend/services/activity.service";

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
        wallet: "shared",
        paidBy: "partner_a",
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

    const title = typeof body.title === "string" ? body.title.trim() : "Transaction";
    const amount = typeof body.amount === "number" ? body.amount : 0;
    const currency = typeof body.currency === "string" ? body.currency.trim().toUpperCase() : "IDR";
    const category = typeof body.category === "string" ? body.category.trim() : "Others";
    const wallet = body.wallet === "personal_a" || body.wallet === "personal_b" ? body.wallet : "shared";
    const paidBy = body.paidBy === "partner_b" ? "partner_b" : "partner_a";

    const { data: sharedWallet } = await supabase
      .from("wallets")
      .select("id, simulated_balance")
      .eq("household_id", householdId)
      .eq("wallet_type", "shared")
      .maybeSingle();

    const targetWalletId = sharedWallet?.id || null;
    const isExpense = amount < 0;
    const absAmount = Math.abs(amount);

    const idempotencyKey = `tx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const { data: newTx, error: txError } = await supabase
      .from("transactions")
      .insert({
        household_id: householdId,
        wallet_id: targetWalletId,
        created_by: user.id,
        transaction_type: isExpense ? "expense" : "income",
        category,
        description: title,
        amount: absAmount,
        currency,
        status: "executed",
        idempotency_key: idempotencyKey,
      })
      .select()
      .single();

    if (txError) {
      return NextResponse.json({ success: false, message: "Failed to record transaction." }, { status: 500 });
    }

    if (targetWalletId && sharedWallet) {
      const balanceDelta = isExpense ? -absAmount : absAmount;
      await supabase
        .from("wallets")
        .update({
          simulated_balance: Number(sharedWallet.simulated_balance) + balanceDelta,
        })
        .eq("id", targetWalletId);
    }

    const splitRatio = typeof body.splitRatio === "object" && body.splitRatio !== null
      ? (body.splitRatio as Record<string, unknown>)
      : null;

    if (splitRatio && isExpense) {
      const splitB = Number(splitRatio.partnerB) || 50;
      const splitA = Number(splitRatio.partnerA) || 50;
      const bOwes = paidBy === "partner_a" ? (absAmount * splitB) / 100 : 0;
      const aOwes = paidBy === "partner_b" ? (absAmount * splitA) / 100 : 0;

      const { data: curSettlement } = await supabase
        .from("household_settlements")
        .select("*")
        .eq("household_id", householdId)
        .maybeSingle();

      if (curSettlement) {
        await supabase
          .from("household_settlements")
          .update({
            partner_b_owes_a: Number(curSettlement.partner_b_owes_a) + bOwes,
            partner_a_owes_b: Number(curSettlement.partner_a_owes_b) + aOwes,
            updated_at: new Date().toISOString(),
          })
          .eq("household_id", householdId);
      }
    }

    await recordHouseholdActivity(supabase, householdId, {
      title,
      category,
      actor: paidBy,
      status: "ALLOW",
      amount: absAmount,
      currency,
      reason: `Transaction recorded to ${wallet}.`,
    });

    return NextResponse.json({
      success: true,
      message: "Transaction recorded successfully.",
      transaction: {
        id: newTx.id,
        title,
        amount,
        currency,
        category,
        wallet,
        paidBy,
        date: "Just now",
        timestamp: newTx.created_at,
      },
    }, { status: 201 });
  } catch (error) {
    console.error("[transactions/create] Unexpected error:", error);
    return NextResponse.json({ success: false, message: "An unexpected error occurred." }, { status: 500 });
  }
}
