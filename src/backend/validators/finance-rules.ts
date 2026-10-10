
export type FinanceRules = {
  walletMode: "shared_only" | "shared_and_personal" | "separate_only";
  expenseSplit: {
    mode: "equal" | "custom";
    ownerPercent: number;
    partnerPercent: number;
  };
  approval: {
    requirePartnerApprovalAboveThreshold: boolean;
    sharedWalletThreshold: number;
  };
  coolingOff: {
    enabled: boolean;
    threshold: number;
    durationHours: number;
  };
};

type ValidationResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" &&
    value !== null &&
    !Array.isArray(value);
}

function isAmount(value: unknown): value is number {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 1_000_000_000_000;
}

export function validateFinanceRules(
  value: unknown
): ValidationResult<FinanceRules> {
  if (!isObject(value)) {
    return { ok: false, message: "Rules must be an object." };
  }

  const { walletMode, expenseSplit, approval, coolingOff } = value;

  if (
    !["shared_only", "shared_and_personal", "separate_only"].includes(
      String(walletMode)
    )
  ) {
    return { ok: false, message: "Invalid wallet mode." };
  }

  if (
    !isObject(expenseSplit) ||
    !["equal", "custom"].includes(String(expenseSplit.mode)) ||
    typeof expenseSplit.ownerPercent !== "number" ||
    typeof expenseSplit.partnerPercent !== "number" ||
    !Number.isInteger(expenseSplit.ownerPercent) ||
    !Number.isInteger(expenseSplit.partnerPercent) ||
    expenseSplit.ownerPercent < 0 ||
    expenseSplit.partnerPercent < 0 ||
    expenseSplit.ownerPercent > 100 ||
    expenseSplit.partnerPercent > 100 ||
    expenseSplit.ownerPercent + expenseSplit.partnerPercent !== 100
  ) {
    return { ok: false, message: "Invalid expense split." };
  }

  if (
    expenseSplit.mode === "equal" &&
    (expenseSplit.ownerPercent !== 50 ||
      expenseSplit.partnerPercent !== 50)
  ) {
    return {
      ok: false,
      message: "Equal expense split must be 50:50.",
    };
  }

  if (
    !isObject(approval) ||
    typeof approval.requirePartnerApprovalAboveThreshold !== "boolean" ||
    !isAmount(approval.sharedWalletThreshold)
  ) {
    return { ok: false, message: "Invalid approval settings." };
  }

  if (
    !isObject(coolingOff) ||
    typeof coolingOff.enabled !== "boolean" ||
    !isAmount(coolingOff.threshold) ||
    typeof coolingOff.durationHours !== "number" ||
    !Number.isInteger(coolingOff.durationHours) ||
    coolingOff.durationHours < 1 ||
    coolingOff.durationHours > 72
  ) {
    return { ok: false, message: "Invalid cooling-off settings." };
  }

  return {
    ok: true,
    data: {
      walletMode: walletMode as FinanceRules["walletMode"],
      expenseSplit: {
        mode: expenseSplit.mode as "equal" | "custom",
        ownerPercent: expenseSplit.ownerPercent,
        partnerPercent: expenseSplit.partnerPercent,
      },
      approval: {
        requirePartnerApprovalAboveThreshold:
          approval.requirePartnerApprovalAboveThreshold,
        sharedWalletThreshold: approval.sharedWalletThreshold,
      },
      coolingOff: {
        enabled: coolingOff.enabled,
        threshold: coolingOff.threshold,
        durationHours: coolingOff.durationHours,
      },
    },
  };
}

export type FinanceRuleDecision = {
  decision: "approved" | "rejected";
  note: string | null;
};

export function validateFinanceRuleDecision(
  value: unknown
): ValidationResult<FinanceRuleDecision> {
  if (!isObject(value)) {
    return { ok: false, message: "Invalid request body." };
  }

  if (value.decision !== "approved" && value.decision !== "rejected") {
    return {
      ok: false,
      message: 'Decision must be "approved" or "rejected".',
    };
  }

  if (
    value.note !== undefined &&
    value.note !== null &&
    typeof value.note !== "string"
  ) {
    return { ok: false, message: "Invalid decision note." };
  }

  const note =
    typeof value.note === "string" ? value.note.trim() || null : null;

  if (note && note.length > 500) {
    return { ok: false, message: "Decision note is too long." };
  }

  return {
    ok: true,
    data: { decision: value.decision, note },
  };
}
