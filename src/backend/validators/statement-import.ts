export type TransactionCategory =
  | "Food & Drinks"
  | "Shopping"
  | "Bills"
  | "Transportation"
  | "Health"
  | "Social"
  | "Others"
  | "Income";

export const STANDARD_CATEGORIES: readonly TransactionCategory[] = [
  "Food & Drinks",
  "Shopping",
  "Bills",
  "Transportation",
  "Health",
  "Social",
  "Others",
  "Income",
] as const;

export interface ParsedRawTransaction {
  date: string;
  rawDescription: string;
  amount: number;
  type: "expense" | "income";
  currency?: string;
  referenceNumber?: string;
}

export interface CategorizedTransaction {
  date: string;
  title: string;
  rawDescription: string;
  amount: number;
  type: "expense" | "income";
  category: TransactionCategory;
  currency: string;
  confidence?: number;
}

export interface StatementImportOptions {
  walletId?: string;
  walletType?: "shared" | "personal";
  paidBy?: "partner_a" | "partner_b";
  dryRun?: boolean;
  useAiCategorization?: boolean;
}

export interface BatchCommitTransactionItem {
  date: string;
  title: string;
  amount: number;
  currency?: string;
  category: TransactionCategory;
  type: "expense" | "income";
  rawDescription?: string;
}

export interface BatchCommitTransactionsInput {
  walletId?: string;
  walletType?: "shared" | "personal";
  paidBy?: "partner_a" | "partner_b";
  transactions: BatchCommitTransactionItem[];
}

type ValidationResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDateString(value: unknown): boolean {
  if (typeof value !== "string" || !value.trim()) return false;
  const d = new Date(value);
  return !isNaN(d.getTime());
}

export function validateBatchCommitInput(value: unknown): ValidationResult<BatchCommitTransactionsInput> {
  if (!isObject(value)) {
    return { ok: false, message: "Request body must be an object." };
  }

  const rawTxList = value.transactions;
  if (!Array.isArray(rawTxList) || rawTxList.length === 0) {
    return { ok: false, message: "transactions must be a non-empty array." };
  }

  if (rawTxList.length > 500) {
    return { ok: false, message: "A maximum of 500 transactions can be committed per batch." };
  }

  const transactions: BatchCommitTransactionItem[] = [];

  for (let idx = 0; idx < rawTxList.length; idx++) {
    const item = rawTxList[idx];
    if (!isObject(item)) {
      return { ok: false, message: `Transaction at index ${idx} is invalid.` };
    }

    const title = typeof item.title === "string" ? item.title.trim().slice(0, 200) : "";
    if (!title) {
      return { ok: false, message: `Transaction at index ${idx} requires a valid title.` };
    }

    const amount = typeof item.amount === "number" && Number.isFinite(item.amount) && item.amount > 0
      ? Math.round(item.amount * 100) / 100
      : null;

    if (amount === null) {
      return { ok: false, message: `Transaction at index ${idx} requires a positive numeric amount.` };
    }

    const dateStr = typeof item.date === "string" ? item.date.trim() : "";
    const date = isDateString(dateStr) ? new Date(dateStr).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);

    const type = item.type === "income" ? "income" : "expense";
    const rawCategory = typeof item.category === "string" ? item.category.trim() : "Others";
    const category: TransactionCategory = STANDARD_CATEGORIES.includes(rawCategory as TransactionCategory)
      ? (rawCategory as TransactionCategory)
      : "Others";

    const currency = typeof item.currency === "string" && /^[A-Z]{3}$/.test(item.currency.trim().toUpperCase())
      ? item.currency.trim().toUpperCase()
      : "IDR";

    const rawDescription = typeof item.rawDescription === "string" ? item.rawDescription.trim().slice(0, 500) : undefined;

    transactions.push({
      date,
      title,
      amount,
      currency,
      category,
      type,
      rawDescription,
    });
  }

  const walletType = value.walletType === "personal" ? "personal" : "shared";
  const paidBy = value.paidBy === "partner_b" ? "partner_b" : "partner_a";
  const walletId = typeof value.walletId === "string" && value.walletId.trim() ? value.walletId.trim() : undefined;

  return {
    ok: true,
    data: {
      walletId,
      walletType,
      paidBy,
      transactions,
    },
  };
}
