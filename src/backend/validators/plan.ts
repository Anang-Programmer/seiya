export type PlanStatus =
  | "Draft"
  | "Proposed"
  | "Active"
  | "Needs review"
  | "Paused"
  | "Completed"
  | "Archived";

export interface CreatePlanInput {
  title: string;
  category: string;
  targetAmount: number;
  currentAmount: number;
  currency: string;
  targetDate: string;
  recommendedMonthly: number;
  splitPartnerB: number;
  splitPartnerA: number;
  walletFunding: string;
  status: PlanStatus;
  assumptions: string | null;
}

export interface UpdatePlanInput {
  title?: string;
  category?: string;
  targetAmount?: number;
  currentAmount?: number;
  currency?: string;
  targetDate?: string;
  recommendedMonthly?: number;
  splitPartnerB?: number;
  splitPartnerA?: number;
  walletFunding?: string;
  status?: PlanStatus;
  assumptions?: string | null;
}

export interface DeletePlanInput {
  partnerAPin?: string;
  partnerBPin?: string;
}

type ValidationResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string };

const VALID_STATUSES: readonly PlanStatus[] = [
  "Draft",
  "Proposed",
  "Active",
  "Needs review",
  "Paused",
  "Completed",
  "Archived",
] as const;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAmount(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value > 0 &&
    value <= 999_999_999_999.99 &&
    Math.round(value * 100) === value * 100
  );
}

function isNonNegativeAmount(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 999_999_999_999.99 &&
    Math.round(value * 100) === value * 100
  );
}

function normalizeCurrency(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return "IDR";
  if (typeof value !== "string") return null;
  const currency = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(currency) ? currency : null;
}

function optionalText(value: unknown, maxLength: number): string | null | undefined {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length <= maxLength ? trimmed : undefined;
}

// The goal dialogs send splitRecommendation as per-partner monthly amounts;
// plans store the agreed ratio as percentages (split_partner_a/b, 0-100).
function splitPercentFromAmounts(value: unknown): { a: number; b: number } | null | undefined {
  if (!isObject(value)) return undefined;
  const a = value.partnerA;
  const b = value.partnerB;
  if (typeof a !== "number" || typeof b !== "number" || !Number.isFinite(a) || !Number.isFinite(b) || a < 0 || b < 0) {
    return null;
  }
  if (a + b === 0) return undefined;
  const pctA = Math.round((a / (a + b)) * 10_000) / 100;
  return { a: pctA, b: Math.round((100 - pctA) * 100) / 100 };
}

export function validateCreatePlan(value: unknown): ValidationResult<CreatePlanInput> {
  if (!isObject(value)) return { ok: false, message: "Invalid request body." };

  const title = typeof value.title === "string" ? value.title.trim() : "";
  if (!title || title.length > 160) {
    return { ok: false, message: "Title is required and must be at most 160 characters." };
  }

  const category = typeof value.category === "string" ? value.category.trim() : "General";
  if (!category || category.length > 80) {
    return { ok: false, message: "Category must be at most 80 characters." };
  }

  if (!isAmount(value.targetAmount)) {
    return { ok: false, message: "targetAmount must be positive with at most two decimal places." };
  }

  const currentAmount = value.currentAmount === undefined ? 0 : value.currentAmount;
  if (!isNonNegativeAmount(currentAmount)) {
    return { ok: false, message: "currentAmount must be non-negative with at most two decimal places." };
  }

  const currency = normalizeCurrency(value.currency);
  if (!currency) {
    return { ok: false, message: "Currency must be a 3-letter code." };
  }

  const targetDate = typeof value.targetDate === "string" ? value.targetDate.trim() : "";
  if (!targetDate || targetDate.length > 100) {
    return { ok: false, message: "targetDate is required and must be at most 100 characters." };
  }

  const recommendedMonthly = value.recommendedMonthly === undefined ? 0 : value.recommendedMonthly;
  if (!isNonNegativeAmount(recommendedMonthly)) {
    return { ok: false, message: "recommendedMonthly must be non-negative with at most two decimal places." };
  }

  let splitPartnerB = 50;
  let splitPartnerA = 50;
  if (value.splitRecommendation !== undefined) {
    const split = splitPercentFromAmounts(value.splitRecommendation);
    if (split === null) {
      return { ok: false, message: "splitRecommendation amounts must be non-negative numbers." };
    }
    if (split) {
      splitPartnerA = split.a;
      splitPartnerB = split.b;
    }
  } else {
    if (typeof value.splitPartnerB === "number" && value.splitPartnerB >= 0 && value.splitPartnerB <= 100) {
      splitPartnerB = value.splitPartnerB;
    }
    if (typeof value.splitPartnerA === "number" && value.splitPartnerA >= 0 && value.splitPartnerA <= 100) {
      splitPartnerA = value.splitPartnerA;
    }
  }

  const walletFunding = typeof value.walletFunding === "string" && value.walletFunding.trim()
    ? value.walletFunding.trim().slice(0, 160)
    : "Planned shared contributions";

  const rawStatus = typeof value.status === "string" ? value.status.trim() : "Draft";
  const status = VALID_STATUSES.includes(rawStatus as PlanStatus) ? (rawStatus as PlanStatus) : "Draft";

  const assumptions = optionalText(value.assumptions, 1000);
  if (assumptions === undefined) {
    return { ok: false, message: "Assumptions must be at most 1000 characters." };
  }

  return {
    ok: true,
    data: {
      title,
      category,
      targetAmount: value.targetAmount,
      currentAmount,
      currency,
      targetDate,
      recommendedMonthly,
      splitPartnerB,
      splitPartnerA,
      walletFunding,
      status,
      assumptions,
    },
  };
}

export function validateUpdatePlan(value: unknown): ValidationResult<UpdatePlanInput> {
  if (!isObject(value)) return { ok: false, message: "Invalid request body." };

  const data: UpdatePlanInput = {};

  if (value.title !== undefined) {
    if (typeof value.title !== "string" || !value.title.trim() || value.title.trim().length > 160) {
      return { ok: false, message: "Title must be 1 to 160 characters." };
    }
    data.title = value.title.trim();
  }

  if (value.category !== undefined) {
    if (typeof value.category !== "string" || !value.category.trim() || value.category.trim().length > 80) {
      return { ok: false, message: "Category must be 1 to 80 characters." };
    }
    data.category = value.category.trim();
  }

  if (value.targetAmount !== undefined) {
    if (!isAmount(value.targetAmount)) {
      return { ok: false, message: "targetAmount must be positive with at most two decimal places." };
    }
    data.targetAmount = value.targetAmount;
  }

  if (value.currentAmount !== undefined) {
    if (!isNonNegativeAmount(value.currentAmount)) {
      return { ok: false, message: "currentAmount must be non-negative with at most two decimal places." };
    }
    data.currentAmount = value.currentAmount;
  }

  if (value.currency !== undefined) {
    const currency = normalizeCurrency(value.currency);
    if (!currency) return { ok: false, message: "Currency must be a 3-letter code." };
    data.currency = currency;
  }

  if (value.targetDate !== undefined) {
    if (typeof value.targetDate !== "string" || !value.targetDate.trim() || value.targetDate.trim().length > 100) {
      return { ok: false, message: "targetDate must be at most 100 characters." };
    }
    data.targetDate = value.targetDate.trim();
  }

  if (value.recommendedMonthly !== undefined) {
    if (!isNonNegativeAmount(value.recommendedMonthly)) {
      return { ok: false, message: "recommendedMonthly must be non-negative with at most two decimal places." };
    }
    data.recommendedMonthly = value.recommendedMonthly;
  }

  if (value.splitRecommendation !== undefined) {
    // 0/0 (nothing left to save) keeps the current split.
    const split = splitPercentFromAmounts(value.splitRecommendation);
    if (split === null) {
      return { ok: false, message: "splitRecommendation amounts must be non-negative numbers." };
    }
    if (split) {
      data.splitPartnerA = split.a;
      data.splitPartnerB = split.b;
    }
  } else {
    if (value.splitPartnerB !== undefined) {
      if (typeof value.splitPartnerB !== "number" || value.splitPartnerB < 0 || value.splitPartnerB > 100) {
        return { ok: false, message: "splitPartnerB must be between 0 and 100." };
      }
      data.splitPartnerB = value.splitPartnerB;
    }
    if (value.splitPartnerA !== undefined) {
      if (typeof value.splitPartnerA !== "number" || value.splitPartnerA < 0 || value.splitPartnerA > 100) {
        return { ok: false, message: "splitPartnerA must be between 0 and 100." };
      }
      data.splitPartnerA = value.splitPartnerA;
    }
  }

  if (value.walletFunding !== undefined) {
    if (typeof value.walletFunding !== "string" || value.walletFunding.length > 160) {
      return { ok: false, message: "walletFunding must be at most 160 characters." };
    }
    data.walletFunding = value.walletFunding.trim();
  }

  if (value.status !== undefined) {
    if (typeof value.status !== "string" || !VALID_STATUSES.includes(value.status as PlanStatus)) {
      return { ok: false, message: "Invalid plan status." };
    }
    data.status = value.status as PlanStatus;
  }

  if (value.assumptions !== undefined) {
    const assumptions = optionalText(value.assumptions, 1000);
    if (assumptions === undefined) {
      return { ok: false, message: "Assumptions must be at most 1000 characters." };
    }
    data.assumptions = assumptions;
  }

  return { ok: true, data };
}

export function validateDeletePlanRequest(value: unknown): ValidationResult<DeletePlanInput> {
  if (value === undefined || value === null) return { ok: true, data: {} };
  if (!isObject(value)) return { ok: false, message: "Invalid request body." };

  const data: DeletePlanInput = {};

  if (value.partnerAPin !== undefined && value.partnerAPin !== null) {
    if (typeof value.partnerAPin !== "string" || !/^\d{6}$/.test(value.partnerAPin)) {
      return { ok: false, message: "partnerAPin must be a 6-digit numeric PIN." };
    }
    data.partnerAPin = value.partnerAPin;
  }

  if (value.partnerBPin !== undefined && value.partnerBPin !== null) {
    if (typeof value.partnerBPin !== "string" || !/^\d{6}$/.test(value.partnerBPin)) {
      return { ok: false, message: "partnerBPin must be a 6-digit numeric PIN." };
    }
    data.partnerBPin = value.partnerBPin;
  }

  return { ok: true, data };
}
