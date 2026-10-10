export type TransactionType = "income" | "expense";

export type CreateTransactionInput = {
  walletId: string;
  transactionType: TransactionType;
  amount: number;
  description: string;
  category: string | null;
  idempotencyKey: string;
};

export type TransactionDecisionInput = {
  decision: "approved" | "rejected";
  note: string | null;
};

type ValidationResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;
const MAX_AMOUNT = 999999999999.99;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateCreateTransaction(
  value: unknown
): ValidationResult<CreateTransactionInput> {
  if (!isObject(value)) {
    return { ok: false, message: "Invalid request body." };
  }

  const walletId = typeof value.walletId === "string" ? value.walletId.trim() : "";
  const transactionType = value.transactionType;
  const amount = value.amount;
  const description = typeof value.description === "string"
    ? value.description.trim()
    : "";
  const category = value.category === undefined || value.category === null || value.category === ""
    ? null
    : typeof value.category === "string"
      ? value.category.trim()
      : undefined;
  const idempotencyKey = typeof value.idempotencyKey === "string"
    ? value.idempotencyKey.trim()
    : "";

  if (!UUID_PATTERN.test(walletId)) {
    return { ok: false, message: "Invalid wallet ID." };
  }

  if (transactionType !== "income" && transactionType !== "expense") {
    return {
      ok: false,
      message: "Transaction type must be income or expense in this MVP.",
    };
  }

  if (
    typeof amount !== "number" ||
    !Number.isFinite(amount) ||
    amount <= 0 ||
    amount > MAX_AMOUNT ||
    Math.round(amount * 100) / 100 !== amount
  ) {
    return {
      ok: false,
      message: "Amount must be positive and have at most two decimal places.",
    };
  }

  if (!description || description.length > 250) {
    return {
      ok: false,
      message: "Description is required and must be at most 250 characters.",
    };
  }

  if (category === undefined || (category !== null && category.length > 80)) {
    return { ok: false, message: "Category must be at most 80 characters." };
  }

  if (!IDEMPOTENCY_PATTERN.test(idempotencyKey)) {
    return {
      ok: false,
      message: "A valid idempotency key is required.",
    };
  }

  return {
    ok: true,
    data: {
      walletId,
      transactionType,
      amount,
      description,
      category: category || null,
      idempotencyKey,
    },
  };
}

export function validateTransactionDecision(
  value: unknown
): ValidationResult<TransactionDecisionInput> {
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

  const note = typeof value.note === "string" ? value.note.trim() || null : null;
  if (note && note.length > 500) {
    return { ok: false, message: "Decision note must be at most 500 characters." };
  }

  return { ok: true, data: { decision: value.decision, note } };
}
