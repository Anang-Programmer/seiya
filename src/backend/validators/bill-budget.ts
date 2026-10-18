export type CreateBillInput = {
  title: string;
  payee: string | null;
  amount: number;
  currency: string;
  dueDate: string;
  recurrence: "none" | "weekly" | "monthly" | "yearly";
  notes: string | null;
};

export type UpsertBudgetInput = {
  category: string;
  amount: number;
  currency: string;
  periodStart: string;
  periodEnd: string;
};

type ValidationResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDateOnly(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function optionalText(value: unknown, maxLength: number): string | null | undefined {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length <= maxLength ? trimmed : undefined;
}

function isAmount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 999_999_999_999.99 && Math.round(value * 100) === value * 100;
}

function normalizeCurrency(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return "IDR";
  if (typeof value !== "string") return null;
  const currency = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(currency) ? currency : null;
}

export function validateCreateBill(value: unknown): ValidationResult<CreateBillInput> {
  if (!isObject(value)) return { ok: false, message: "Invalid request body." };

  const title = typeof value.title === "string" ? value.title.trim() : "";
  const payee = optionalText(value.payee, 160);
  const notes = optionalText(value.notes, 1000);
  const currency = normalizeCurrency(value.currency);
  const recurrence = value.recurrence === undefined ? "none" : value.recurrence;

  if (!title || title.length > 160) return { ok: false, message: "Title is required and must be at most 160 characters." };
  if (payee === undefined || notes === undefined) return { ok: false, message: "Payee or notes are invalid." };
  if (!isAmount(value.amount)) return { ok: false, message: "Amount must be positive with at most two decimal places." };
  if (!currency) return { ok: false, message: "Currency must be a three-letter code." };
  if (!isDateOnly(value.dueDate)) return { ok: false, message: "Due date must use YYYY-MM-DD format." };
  if (!( ["none", "weekly", "monthly", "yearly"] as const).includes(recurrence as "none" | "weekly" | "monthly" | "yearly")) return { ok: false, message: "Invalid recurrence value." };

  return {
    ok: true,
    data: {
      title,
      payee,
      amount: value.amount,
      currency,
      dueDate: value.dueDate,
      recurrence: recurrence as CreateBillInput["recurrence"],
      notes,
    },
  };
}

export function validateUpsertBudget(value: unknown): ValidationResult<UpsertBudgetInput> {
  if (!isObject(value)) return { ok: false, message: "Invalid request body." };

  const category = typeof value.category === "string" ? value.category.trim().toLowerCase() : "";
  const currency = normalizeCurrency(value.currency);

  if (!/^[a-z0-9][a-z0-9_-]{1,79}$/.test(category)) return { ok: false, message: "Category must be a 2-80 character slug." };
  if (!isAmount(value.amount)) return { ok: false, message: "Amount must be positive with at most two decimal places." };
  if (!currency) return { ok: false, message: "Currency must be a three-letter code." };
  if (!isDateOnly(value.periodStart) || !isDateOnly(value.periodEnd)) return { ok: false, message: "Period dates must use YYYY-MM-DD format." };
  if (value.periodEnd < value.periodStart) return { ok: false, message: "Period end must not be earlier than period start." };

  return {
    ok: true,
    data: {
      category,
      amount: value.amount,
      currency,
      periodStart: value.periodStart,
      periodEnd: value.periodEnd,
    },
  };
}

export type PayBillInput = { walletId: string; idempotencyKey: string };

export type UpdateBillInput = {
  title?: string;
  payee?: string | null;
  amount?: number;
  currency?: string;
  dueDate?: string;
  recurrence?: "none" | "weekly" | "monthly" | "yearly";
  status?: "upcoming" | "paid" | "pending_approval" | "overdue";
  notes?: string | null;
};

export function validateUpdateBill(value: unknown): ValidationResult<UpdateBillInput> {
  if (!isObject(value)) return { ok: false, message: "Invalid request body." };

  const data: UpdateBillInput = {};

  if (value.title !== undefined) {
    if (typeof value.title !== "string" || !value.title.trim() || value.title.trim().length > 160) {
      return { ok: false, message: "Title must be 1 to 160 characters." };
    }
    data.title = value.title.trim();
  }

  if (value.payee !== undefined) {
    const payee = optionalText(value.payee, 160);
    if (payee === undefined) return { ok: false, message: "Payee is invalid." };
    data.payee = payee;
  }

  if (value.amount !== undefined) {
    if (!isAmount(value.amount)) return { ok: false, message: "Amount must be positive with at most two decimal places." };
    data.amount = value.amount;
  }

  if (value.currency !== undefined) {
    const currency = normalizeCurrency(value.currency);
    if (!currency) return { ok: false, message: "Currency must be a three-letter code." };
    data.currency = currency;
  }

  if (value.dueDate !== undefined) {
    if (!isDateOnly(value.dueDate)) return { ok: false, message: "Due date must use YYYY-MM-DD format." };
    data.dueDate = value.dueDate;
  }

  if (value.recurrence !== undefined) {
    if (!(["none", "weekly", "monthly", "yearly"] as const).includes(value.recurrence as "none" | "weekly" | "monthly" | "yearly")) {
      return { ok: false, message: "Invalid recurrence value." };
    }
    data.recurrence = value.recurrence as UpdateBillInput["recurrence"];
  }

  if (value.status !== undefined) {
    if (!(["upcoming", "paid", "pending_approval", "overdue"] as const).includes(value.status as "upcoming" | "paid" | "pending_approval" | "overdue")) {
      return { ok: false, message: "Invalid bill status." };
    }
    data.status = value.status as UpdateBillInput["status"];
  }

  if (value.notes !== undefined) {
    const notes = optionalText(value.notes, 1000);
    if (notes === undefined) return { ok: false, message: "Notes are invalid." };
    data.notes = notes;
  }

  return { ok: true, data };
}

export function validatePayBill(value: unknown): ValidationResult<PayBillInput> {
  if (!isObject(value)) return { ok: false, message: "Invalid request body." };
  const walletId = typeof value.walletId === "string" ? value.walletId.trim() : "";
  const idempotencyKey = typeof value.idempotencyKey === "string" ? value.idempotencyKey.trim() : "";
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  if (!uuid.test(walletId)) return { ok: false, message: "Invalid wallet ID." };
  if (!/^[A-Za-z0-9._:-]{8,80}$/.test(idempotencyKey)) return { ok: false, message: "Invalid idempotency key." };

  return { ok: true, data: { walletId, idempotencyKey } };
}
