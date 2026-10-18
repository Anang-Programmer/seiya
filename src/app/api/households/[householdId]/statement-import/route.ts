import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { parseStatementFile } from "@/backend/services/statement-parser.service";
import {
  categorizeRuleBased,
  categorizeTransactionsWithAi,
} from "@/backend/services/statement-categorizer.service";
import {
  validateBatchCommitInput,
  type CategorizedTransaction,
} from "@/backend/validators/statement-import";

type RouteContext = { params: Promise<{ householdId: string }> };
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function commitTransactions(
  supabase: SupabaseClient,
  householdId: string,
  userId: string,
  walletType: "shared" | "personal",
  paidBy: "partner_a" | "partner_b",
  transactions: Array<{
    date: string;
    title: string;
    amount: number;
    currency?: string;
    category: string;
    type: "expense" | "income";
    rawDescription?: string;
  }>
) {
  let query = supabase
    .from("wallets")
    .select("id")
    .eq("household_id", householdId)
    .eq("wallet_type", walletType)
    .eq("status", "active");

  if (walletType === "personal") {
    query = query.eq("owner_user_id", userId);
  }

  const { data: targetWallet } = await query.maybeSingle();

  if (!targetWallet?.id) {
    return { success: false, error: `No active ${walletType} wallet found in household.` };
  }

  const { data: rpcResult, error: rpcError } = await supabase.rpc("import_statement_batch", {
    p_household_id: householdId,
    p_wallet_id: targetWallet.id,
    p_transactions: transactions,
    p_paid_by: paidBy,
  });

  if (rpcError) {
    return { success: false, error: rpcError.message };
  }

  return { success: true, count: (rpcResult as { importedCount?: number })?.importedCount ?? transactions.length };
}

export async function POST(request: Request, context: RouteContext) {
  const { householdId } = await context.params;
  if (!UUID_PATTERN.test(householdId)) {
    return NextResponse.json({ success: false, message: "Invalid household ID." }, { status: 400 });
  }

  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ success: false, message: "Login required." }, { status: 401 });
    }

    const { data: member } = await supabase
      .from("household_members")
      .select("id")
      .eq("household_id", householdId)
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();

    if (!member) {
      return NextResponse.json({ success: false, message: "Active household membership required." }, { status: 403 });
    }

    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file") as File | null;
      if (!file) {
        return NextResponse.json({ success: false, message: "No statement file provided." }, { status: 400 });
      }

      const dryRun = formData.get("dryRun") !== "false";
      const useAi = formData.get("useAi") === "true";
      const walletType = formData.get("walletType") === "personal" ? "personal" : "shared";
      const paidBy = formData.get("paidBy") === "partner_b" ? "partner_b" : "partner_a";

      const arrayBuffer = await file.arrayBuffer();
      const parsed = await parseStatementFile(arrayBuffer, file.name, file.type);

      if (!parsed.success || parsed.transactions.length === 0) {
        return NextResponse.json({
          success: false,
          message: parsed.error || "No readable transactions could be extracted from this statement.",
        }, { status: 422 });
      }

      let categorized: CategorizedTransaction[];
      if (useAi) {
        categorized = await categorizeTransactionsWithAi(parsed.transactions);
      } else {
        categorized = parsed.transactions.map(categorizeRuleBased);
      }

      if (dryRun) {
        return NextResponse.json({
          success: true,
          dryRun: true,
          fileName: file.name,
          extractedCount: categorized.length,
          transactions: categorized,
          message: `Successfully extracted ${categorized.length} transactions. Review and confirm to import.`,
        });
      }

      const commitResult = await commitTransactions(
        supabase,
        householdId,
        user.id,
        walletType,
        paidBy,
        categorized
      );

      if (!commitResult.success) {
        return NextResponse.json({ success: false, message: commitResult.error }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        dryRun: false,
        importedCount: categorized.length,
        message: `Successfully imported ${categorized.length} transactions to your ${walletType} wallet.`,
      }, { status: 201 });
    }

    let jsonBody: unknown;
    try {
      jsonBody = await request.json();
    } catch {
      return NextResponse.json({ success: false, message: "Invalid JSON body." }, { status: 400 });
    }

    const validation = validateBatchCommitInput(jsonBody);
    if (!validation.ok) {
      return NextResponse.json({ success: false, message: validation.message }, { status: 400 });
    }

    const walletType = validation.data.walletType || "shared";
    const paidBy = validation.data.paidBy || "partner_a";
    const commitResult = await commitTransactions(
      supabase,
      householdId,
      user.id,
      walletType,
      paidBy,
      validation.data.transactions
    );

    if (!commitResult.success) {
      return NextResponse.json({ success: false, message: commitResult.error }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      importedCount: validation.data.transactions.length,
      message: `Successfully imported ${validation.data.transactions.length} transactions.`,
    }, { status: 201 });
  } catch (error) {
    console.error("[statement-import] Unexpected error:", error);
    return NextResponse.json({ success: false, message: "An unexpected error occurred." }, { status: 500 });
  }
}
