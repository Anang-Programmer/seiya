export type ApprovalCategory = "Bills" | "Plans" | "Expenses" | "Contracts" | "Other";
export type ApprovalType = "BILL" | "PLAN_DELETE" | "EXPENSE" | "CONTRACT" | "GOAL" | "OTHER";
export type ApprovalStatus = "pending" | "approved" | "declined" | "cancelled" | "expired";
export type UserRole = "partner_a" | "partner_b";

export interface CreateApprovalInput {
  title: string;
  amount: number;
  currency: string;
  wallet: "shared" | "personal_a" | "personal_b";
  requesterRole: UserRole;
  approverRole: UserRole;
  category: ApprovalCategory;
  type: ApprovalType;
  targetId?: string | null;
  notes?: string | null;
  reason: string;
  expiresInHours?: number;
}

export interface ApprovalDecisionInput {
  decision: "approved" | "declined";
  pin?: string;
  reason?: string;
}

type ValidationResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeCurrency(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return "IDR";
  if (typeof value !== "string") return null;
  const currency = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(currency) ? currency : null;
}

const CATEGORIES: readonly ApprovalCategory[] = ["Bills", "Plans", "Expenses", "Contracts", "Other"] as const;
const TYPES: readonly ApprovalType[] = ["BILL", "PLAN_DELETE", "EXPENSE", "CONTRACT", "GOAL", "OTHER"] as const;

export function validateCreateApproval(value: unknown): ValidationResult<CreateApprovalInput> {
  if (!isObject(value)) return { ok: false, message: "Invalid request body." };

  const title = typeof value.title === "string" ? value.title.trim() : "";
  if (!title || title.length > 200) {
    return { ok: false, message: "Title is required and must be at most 200 characters." };
  }

  const amount = typeof value.amount === "number" && Number.isFinite(value.amount) && value.amount >= 0
    ? Math.round(value.amount * 100) / 100
    : 0;

  const currency = normalizeCurrency(value.currency);
  if (!currency) return { ok: false, message: "Currency must be a 3-letter code." };

  const wallet = value.wallet === "personal_a" || value.wallet === "personal_b" ? value.wallet : "shared";
  const requesterRole: UserRole = value.requesterRole === "partner_b" ? "partner_b" : "partner_a";
  const approverRole: UserRole = value.approverRole === "partner_a" ? "partner_a" : "partner_b";

  const rawCat = typeof value.category === "string" ? value.category.trim() : "Other";
  const category: ApprovalCategory = CATEGORIES.includes(rawCat as ApprovalCategory) ? (rawCat as ApprovalCategory) : "Other";

  const rawType = typeof value.type === "string" ? value.type.trim() : "OTHER";
  const type: ApprovalType = TYPES.includes(rawType as ApprovalType) ? (rawType as ApprovalType) : "OTHER";

  const targetId = typeof value.targetId === "string" && value.targetId.trim() ? value.targetId.trim() : null;
  const notes = typeof value.notes === "string" && value.notes.trim() ? value.notes.trim().slice(0, 1000) : null;
  const reason = typeof value.reason === "string" ? value.reason.trim().slice(0, 500) : "";

  const expiresInHours = typeof value.expiresInHours === "number" && value.expiresInHours > 0 && value.expiresInHours <= 168
    ? Math.round(value.expiresInHours)
    : 24;

  return {
    ok: true,
    data: {
      title,
      amount,
      currency,
      wallet,
      requesterRole,
      approverRole,
      category,
      type,
      targetId,
      notes,
      reason,
      expiresInHours,
    },
  };
}

export function validateApprovalDecision(value: unknown): ValidationResult<ApprovalDecisionInput> {
  if (!isObject(value)) return { ok: false, message: "Invalid request body." };

  if (value.decision !== "approved" && value.decision !== "declined") {
    return { ok: false, message: 'decision must be "approved" or "declined".' };
  }

  let pin: string | undefined;
  if (value.pin !== undefined && value.pin !== null && value.pin !== "") {
    if (typeof value.pin !== "string" || !/^\d{6}$/.test(value.pin.trim())) {
      return { ok: false, message: "pin must be a 6-digit numeric string." };
    }
    pin = value.pin.trim();
  }

  const reason = typeof value.reason === "string" ? value.reason.trim().slice(0, 500) : undefined;

  return {
    ok: true,
    data: {
      decision: value.decision,
      pin,
      reason,
    },
  };
}
