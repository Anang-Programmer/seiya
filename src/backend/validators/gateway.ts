export type GatewayActionType =
  | "EXPENSE"
  | "BILL_PAY"
  | "PURCHASE"
  | "EXTERNAL_TRANSFER"
  | "PRIVACY_REQUEST";

export interface GatewayDecisionInput {
  actionType: GatewayActionType;
  title: string;
  amount: number;
  currency: string;
  wallet: "shared" | "personal_a" | "personal_b";
  timeOfDay?: string;
  category?: string;
}

type ValidationResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string };

const VALID_ACTIONS: readonly GatewayActionType[] = [
  "EXPENSE",
  "BILL_PAY",
  "PURCHASE",
  "EXTERNAL_TRANSFER",
  "PRIVACY_REQUEST",
] as const;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeCurrency(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return "IDR";
  if (typeof value !== "string") return null;
  const currency = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(currency) ? currency : null;
}

export function validateGatewayDecision(value: unknown): ValidationResult<GatewayDecisionInput> {
  if (!isObject(value)) return { ok: false, message: "Invalid request body." };

  if (typeof value.actionType !== "string" || !VALID_ACTIONS.includes(value.actionType as GatewayActionType)) {
    return { ok: false, message: "Invalid actionType." };
  }

  const title = typeof value.title === "string" ? value.title.trim() : "";
  if (!title) return { ok: false, message: "Title is required." };

  const amount = typeof value.amount === "number" && Number.isFinite(value.amount) && value.amount >= 0
    ? Math.round(value.amount * 100) / 100
    : 0;

  const currency = normalizeCurrency(value.currency);
  if (!currency) return { ok: false, message: "Currency must be a 3-letter code." };

  const wallet = value.wallet === "personal_a" || value.wallet === "personal_b" ? value.wallet : "shared";
  const timeOfDay = typeof value.timeOfDay === "string" ? value.timeOfDay.trim() : undefined;
  const category = typeof value.category === "string" ? value.category.trim() : undefined;

  return {
    ok: true,
    data: {
      actionType: value.actionType as GatewayActionType,
      title,
      amount,
      currency,
      wallet,
      timeOfDay,
      category,
    },
  };
}
