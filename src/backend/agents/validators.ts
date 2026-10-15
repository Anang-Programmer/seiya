import "server-only";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface AgentChatInput {
  householdId: string;
  conversationId?: string;
  message: string;
}

export type AgentChatValidation =
  | { ok: true; data: AgentChatInput }
  | { ok: false; message: string };

export interface RecordExpenseInput {
  wallet: "shared" | "personal";
  amount: number;
  currency: string | null;
  description: string;
  category: string;
}

export type RecordExpenseValidation =
  | { ok: true; data: RecordExpenseInput }
  | { ok: false; message: string };

const MAX_AMOUNT = 999_999_999_999.99;
const CATEGORY_SLUG_PATTERN = /^[a-z0-9][a-z0-9_-]{0,39}$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const CATEGORY_SUGGESTIONS =
  "travel, food, groceries, transport, shopping, entertainment, health, utilities, education, subscriptions, gifts, bills, other";

/** Categories are lowercase slugs so they can match household budget categories. */
export function normalizeCategorySlug(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return CATEGORY_SLUG_PATTERN.test(slug) ? slug : null;
}

export function validateRecordExpenseInput(value: unknown): RecordExpenseValidation {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, message: "Argumen record_expense tidak valid." };
  }

  const args = value as Record<string, unknown>;

  if (args.wallet !== "shared" && args.wallet !== "personal") {
    return { ok: false, message: 'wallet harus "shared" atau "personal".' };
  }

  const amount = args.amount;
  if (
    typeof amount !== "number" ||
    !Number.isFinite(amount) ||
    amount <= 0 ||
    amount > MAX_AMOUNT ||
    Math.round(amount * 100) / 100 !== amount
  ) {
    return {
      ok: false,
      message: "amount harus berupa angka positif dengan paling banyak dua angka desimal, dalam satuan penuh (20 juta = 20000000).",
    };
  }

  const description = typeof args.description === "string"
    ? args.description.trim().replace(/\s+/g, " ")
    : "";
  if (!description || description.length > 250) {
    return { ok: false, message: "description wajib diisi dan maksimal 250 karakter." };
  }

  const category = normalizeCategorySlug(args.category);
  if (!category) {
    return {
      ok: false,
      message: `category harus slug huruf kecil tanpa spasi. Pilihan yang paling tepat: ${CATEGORY_SUGGESTIONS}.`,
    };
  }

  let currency: string | null = null;
  if (args.currency !== undefined && args.currency !== null) {
    if (typeof args.currency !== "string" || !CURRENCY_PATTERN.test(args.currency.trim().toUpperCase())) {
      return { ok: false, message: "currency harus berupa kode mata uang tiga huruf, mis. IDR." };
    }
    currency = args.currency.trim().toUpperCase();
  }

  return {
    ok: true,
    data: { wallet: args.wallet, amount, currency, description, category },
  };
}

export function validateAgentChatInput(value: unknown): AgentChatValidation {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, message: "Request body must be a JSON object." };
  }

  const body = value as Record<string, unknown>;
  const allowedKeys = new Set(["householdId", "conversationId", "message"]);
  if (Object.keys(body).some((key) => !allowedKeys.has(key))) {
    return { ok: false, message: "Request contains an unsupported field." };
  }

  if (typeof body.householdId !== "string" || !UUID_PATTERN.test(body.householdId)) {
    return { ok: false, message: "A valid householdId is required." };
  }

  if (body.conversationId !== undefined &&
      (typeof body.conversationId !== "string" || !UUID_PATTERN.test(body.conversationId))) {
    return { ok: false, message: "conversationId must be a valid UUID when provided." };
  }

  if (typeof body.message !== "string") {
    return { ok: false, message: "message must be a string." };
  }

  const message = body.message.trim();
  if (!message) return { ok: false, message: "Please enter a message." };
  if (message.length > 2_000) {
    return { ok: false, message: "Message is too long. Keep it under 2,000 characters." };
  }

  return {
    ok: true,
    data: {
      householdId: body.householdId,
      ...(typeof body.conversationId === "string" ? { conversationId: body.conversationId } : {}),
      message,
    },
  };
}
