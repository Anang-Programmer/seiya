
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

  const raw = value as Record<string, unknown>;

  const hasNested = isObject(raw.approval) || isObject(raw.expenseSplit);

  const walletMode = raw.walletMode || "shared_and_personal";
  if (!["shared_only", "shared_and_personal", "separate_only"].includes(String(walletMode))) {
    return { ok: false, message: "Invalid wallet mode." };
  }

  let ownerPercent = 50;
  let partnerPercent = 50;
  let splitMode: "equal" | "custom" = "equal";

  if (hasNested && isObject(raw.expenseSplit)) {
    const es = raw.expenseSplit as Record<string, unknown>;
    if (!["equal", "custom"].includes(String(es.mode))) return { ok: false, message: "Invalid expense split mode." };
    if (typeof es.ownerPercent !== "number" || typeof es.partnerPercent !== "number") return { ok: false, message: "Invalid expense split numbers." };
    if (es.ownerPercent + es.partnerPercent !== 100) return { ok: false, message: "Expense split must sum to 100." };
    ownerPercent = es.ownerPercent;
    partnerPercent = es.partnerPercent;
    splitMode = es.mode as "equal" | "custom";
  } else if (typeof raw.newSplitA === "number" || typeof raw.splitPartnerA === "number") {
    ownerPercent = typeof raw.newSplitA === "number" ? raw.newSplitA : Number(raw.splitPartnerA);
    partnerPercent = typeof raw.newSplitB === "number" ? raw.newSplitB : Number(raw.splitPartnerB);
    if (ownerPercent + partnerPercent !== 100) return { ok: false, message: "Expense split must sum to 100." };
    splitMode = ownerPercent === 50 && partnerPercent === 50 ? "equal" : "custom";
  }

  let requirePartnerApprovalAboveThreshold = true;
  let sharedWalletThreshold = 500000;

  if (hasNested && isObject(raw.approval)) {
    const app = raw.approval as Record<string, unknown>;
    if (typeof app.requirePartnerApprovalAboveThreshold !== "boolean") {
      return { ok: false, message: "Invalid requirePartnerApprovalAboveThreshold." };
    }
    if (!isAmount(app.sharedWalletThreshold)) {
      return { ok: false, message: "Invalid sharedWalletThreshold." };
    }
    requirePartnerApprovalAboveThreshold = app.requirePartnerApprovalAboveThreshold;
    sharedWalletThreshold = app.sharedWalletThreshold;
  } else if (raw.newThreshold !== undefined || raw.approvalThreshold !== undefined) {
    const t = raw.newThreshold !== undefined ? raw.newThreshold : raw.approvalThreshold;
    if (!isAmount(t)) return { ok: false, message: "Invalid approval threshold." };
    sharedWalletThreshold = t;
    if (typeof raw.approveEveryShared === "boolean") {
      requirePartnerApprovalAboveThreshold = true;
    }
  }

  let coolingOffEnabled = true;
  let cooldownThreshold = 1000000;
  let durationHours = 24;

  if (hasNested && isObject(raw.coolingOff)) {
    const co = raw.coolingOff as Record<string, unknown>;
    if (typeof co.enabled !== "boolean") return { ok: false, message: "Invalid coolingOff.enabled." };
    if (!isAmount(co.threshold)) return { ok: false, message: "Invalid coolingOff.threshold." };
    if (typeof co.durationHours !== "number" || co.durationHours < 1 || co.durationHours > 72) {
      return { ok: false, message: "Invalid coolingOff.durationHours." };
    }
    coolingOffEnabled = co.enabled;
    cooldownThreshold = co.threshold;
    durationHours = co.durationHours;
  } else if (raw.coolingOffEnabled !== undefined || raw.cooldownThreshold !== undefined) {
    if (typeof raw.coolingOffEnabled === "boolean") coolingOffEnabled = raw.coolingOffEnabled;
    if (raw.cooldownThreshold !== undefined) {
      if (!isAmount(raw.cooldownThreshold)) return { ok: false, message: "Invalid cooldownThreshold." };
      cooldownThreshold = raw.cooldownThreshold;
    }
  }

  return {
    ok: true,
    data: {
      walletMode: walletMode as FinanceRules["walletMode"],
      expenseSplit: {
        mode: splitMode,
        ownerPercent,
        partnerPercent,
      },
      approval: {
        requirePartnerApprovalAboveThreshold,
        sharedWalletThreshold,
      },
      coolingOff: {
        enabled: coolingOffEnabled,
        threshold: cooldownThreshold,
        durationHours,
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
