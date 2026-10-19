export interface CreateHeldPurchaseInput {
  title: string;
  amount: number;
  currency: string;
  wallet: "shared" | "personal_a" | "personal_b";
  requesterRole: "partner_a" | "partner_b";
  reason: string;
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

export function validateCreateHeldPurchase(value: unknown): ValidationResult<CreateHeldPurchaseInput> {
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
  const requesterRole = value.requesterRole === "partner_b" ? "partner_b" : "partner_a";
  const reason = typeof value.reason === "string" ? value.reason.trim().slice(0, 500) : "";

  return {
    ok: true,
    data: {
      title,
      amount,
      currency,
      wallet,
      requesterRole,
      reason,
    },
  };
}
