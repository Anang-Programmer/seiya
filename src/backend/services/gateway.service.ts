import type { SupabaseClient } from "@supabase/supabase-js";
import type { GatewayDecisionInput } from "@/backend/validators/gateway";

export interface GatewayDecisionResult {
  outcome: "ALLOW" | "NEED_APPROVAL" | "HOLD" | "DENY";
  reason_code: string;
  reason: string;
  details?: Record<string, unknown>;
}

export async function evaluateGatewayDecision(
  supabase: SupabaseClient,
  householdId: string,
  input: GatewayDecisionInput
): Promise<GatewayDecisionResult> {
  if (input.actionType === "EXTERNAL_TRANSFER") {
    return {
      outcome: "DENY",
      reason_code: "DEST_NOT_ALLOWED",
      reason: "External transfers to outside bank accounts are blocked. Seiya operates on couple-managed accounts only.",
    };
  }

  if (input.actionType === "PRIVACY_REQUEST") {
    return {
      outcome: "DENY",
      reason_code: "PRIVACY_BLOCK",
      reason: "Couple Privacy Contract: Partner's aggregate balance is shared, but itemized transaction history is private.",
    };
  }

  const { data: ruleRow } = await supabase
    .from("household_finance_rules")
    .select("rules")
    .eq("household_id", householdId)
    .eq("status", "active")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const rules = (ruleRow?.rules && typeof ruleRow.rules === "object"
    ? (ruleRow.rules as Record<string, unknown>)
    : {}) as {
    approval?: { sharedWalletThreshold?: unknown; requirePartnerApprovalAboveThreshold?: unknown; approveEverySharedPurchase?: unknown };
    coolingOff?: { enabled?: unknown; threshold?: unknown };
  };

  const approvalThreshold = Number(rules?.approval?.sharedWalletThreshold) || 500000;
  const requireApproval = Boolean(rules?.approval?.requirePartnerApprovalAboveThreshold ?? true);
  const approveEveryShared = Boolean(rules?.approval?.approveEverySharedPurchase ?? false);

  const coolingOffEnabled = Boolean(rules?.coolingOff?.enabled ?? true);
  const cooldownThreshold = Number(rules?.coolingOff?.threshold) || 1000000;

  const titleLower = input.title.toLowerCase();
  const isLateNight = input.timeOfDay
    ? input.timeOfDay >= "22:00" || input.timeOfDay < "08:00"
    : false;
  const isImpulseTrigger =
    titleLower.includes("flash-sale") ||
    titleLower.includes("flash sale") ||
    titleLower.includes("promo") ||
    titleLower.includes("diskon") ||
    titleLower.includes("shoes") ||
    titleLower.includes("sepatu") ||
    titleLower.includes("jacket") ||
    titleLower.includes("jaket");

  if (
    coolingOffEnabled &&
    input.amount >= cooldownThreshold &&
    (isLateNight || isImpulseTrigger)
  ) {
    return {
      outcome: "HOLD",
      reason_code: "EMOTION_HOLD",
      reason: `Late-night checkout above couple safeguard (${cooldownThreshold} ${input.currency}). Held until 08:00 to ensure thoughtful decisions.`,
      details: {
        holdUntil: "Tomorrow at 08:00 (Local Time)",
        originalAmount: input.amount,
        currency: input.currency,
      },
    };
  }

  const exceedsThreshold = approveEveryShared || (requireApproval && input.amount >= approvalThreshold);

  if (input.wallet === "shared" && exceedsThreshold) {
    return {
      outcome: "NEED_APPROVAL",
      reason_code: "SHARED_OVER_THRESHOLD",
      reason: approveEveryShared
        ? "Couple policy: Every shared purchase requires partner confirmation."
        : `Shared expense exceeds agreed approval threshold (${approvalThreshold} ${input.currency}). Partner signature required.`,
      details: {
        amount: input.amount,
        currency: input.currency,
        threshold: approvalThreshold,
      },
    };
  }

  return {
    outcome: "ALLOW",
    reason_code: "WITHIN_RULES",
    reason: "Action complies with agreed Couple Contract rules and limits.",
  };
}
