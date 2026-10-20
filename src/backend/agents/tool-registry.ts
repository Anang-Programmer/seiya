import "server-only";
import { createHash } from "node:crypto";
import type { createClient } from "@/lib/supabase/server";
import { getHouseholdBudgetProgress } from "@/backend/services/bill-budget.service";
import { requestSimulatedTransaction } from "@/backend/services/transaction.service";
import { validateRecordExpenseInput } from "@/backend/agents/validators";
import type { AIToolDefinition } from "@/backend/agents";

type UserScopedSupabaseClient = Awaited<ReturnType<typeof createClient>>;
type ToolName =
  | "get_budget_summary"
  | "list_upcoming_bills"
  | "get_household_rules"
  | "get_wallet_summary"
  | "record_expense"
  | "record_income"
  | "draft_bill";

export interface SeiyaToolContext {
  supabase: UserScopedSupabaseClient;
  householdId: string;
  /** Authenticated member who sent this chat message; personal wallets are scoped to this user. */
  userId: string;
  today: string;
  /** Server-derived seed (user + household + message) for idempotency keys; never client-supplied. */
  expenseSeed: string;
}

const EMPTY_OBJECT_SCHEMA = {
  type: "object" as const,
  properties: {},
  required: [],
  additionalProperties: false,
};

export const SEIYA_READ_TOOLS: AIToolDefinition[] = [
  {
    name: "get_budget_summary",
    description: "Read the household's budget progress, including budget amount, period, executed shared-wallet spending, remaining amount, and usage percentage. Use when the user asks about budgets or spending against a budget.",
    parameters: EMPTY_OBJECT_SCHEMA,
  },
  {
    name: "list_upcoming_bills",
    description: "Read unpaid household bills that are overdue or due within the next 30 days. Use when the user asks about upcoming bills, due dates, or overdue bills.",
    parameters: EMPTY_OBJECT_SCHEMA,
  },
  {
    name: "get_household_rules",
    description: "Read the currently active bilateral household financial agreement rules. Use when the user asks about shared-wallet approvals, cooling-off, wallet mode, or their agreed money rules.",
    parameters: EMPTY_OBJECT_SCHEMA,
  },
  {
    name: "get_wallet_summary",
    description: "Read active simulated wallet balances visible to the authenticated household member: the shared wallet and only that member's personal wallet. Use when the user asks about available wallet balances. Never infer another partner's personal-wallet balance.",
    parameters: EMPTY_OBJECT_SCHEMA,
  },
];

/**
 * The only writing tool. It never approves or executes anything itself: the expense goes through the
 * same simulated transaction engine as the app, so the active agreement still decides approval and
 * cooling-off. Approval and hold execution stay in their own endpoints.
 */
export const RECORD_EXPENSE_TOOL: AIToolDefinition = {
  name: "record_expense",
  description:
    "Record ONE expense that actually occurred and was stated by the user in this message (e.g. \"today I spent 20 million on a trip to Japan\"). " +
    "The backend records it via the simulated transaction engine; the resulting status (executed, pending partner approval, or on cooling-off hold) is governed by the active financial agreement, not by you. " +
    "Do not use for plans, desires, questions, hypotheticals, stories of other people, or amounts not explicitly stated. " +
    "Convert units to full numbers in the wallet currency: 20 million = 20000000, 50 thousand = 50000. " +
    "wallet: 'shared' is the DEFAULT for all household expenses; use 'personal' only if the user explicitly specifies their personal wallet (e.g. 'from my personal money'). " +
    "Balances are not visible in this turn, so do not guess the wallet from message contents. " +
    `category must be a lowercase slug without spaces; best choices: travel, food, groceries, transport, shopping, entertainment, health, utilities, education, subscriptions, gifts, bills, other. ` +
    "Call only once per expense.",
  parameters: {
    type: "object",
    properties: {
      amount: {
        type: "number",
        description: "Full amount in the wallet currency, e.g. 20000000 for 20 million.",
      },
      description: {
        type: "string",
        description: "Summary of the expense in user language, max 250 characters, e.g. 'Trip to Japan'.",
      },
      category: {
        type: "string",
        description: "Lowercase category slug, e.g. travel.",
      },
      wallet: {
        type: "string",
        enum: ["shared", "personal"],
        description:
          "shared for all household expenses (DEFAULT); personal only if user specifies personal money.",
      },
      currency: {
        type: "string",
        description: "Currency code mentioned by user, e.g. IDR, USD. Must match wallet currency; do not convert.",
      },
    },
    required: ["amount", "description", "category", "wallet"],
    additionalProperties: false,
  },
};

/**
 * Records money coming in (salary, bonus, top-up, starting balance). Like
 * record_expense it goes through the simulated transaction engine; income never
 * needs partner approval.
 */
export const RECORD_INCOME_TOOL: AIToolDefinition = {
  name: "record_income",
  description:
    "Record ONE amount of money that came in, stated by the user in this message (salary, bonus, refund, transfer received, top-up, starting balance). " +
    "Do not use for expenses, plans, expected or future income, or questions. Convert units to full numbers: 8 juta = 8000000. " +
    "wallet: 'personal' is the DEFAULT (salary usually goes to the earner); use 'shared' only if the user says it goes to the shared/joint wallet. Call once per amount.",
  parameters: {
    type: "object",
    properties: {
      amount: { type: "number", description: "Full amount in the wallet currency, e.g. 8000000." },
      description: { type: "string", description: "Short label in user language, max 120 characters, e.g. 'Gaji Oktober'." },
      wallet: {
        type: "string",
        enum: ["personal", "shared"],
        description: "personal (DEFAULT) or shared if the user says so.",
      },
      currency: { type: "string", description: "Currency code mentioned by the user, if any. Must match the wallet currency." },
    },
    required: ["amount", "description", "wallet"],
    additionalProperties: false,
  },
};

/**
 * Prepares a bill for the user to review. Nothing is saved: the chat shows an
 * editable card and the bill is created only when the user presses "Add bill".
 */
export const DRAFT_BILL_TOOL: AIToolDefinition = {
  name: "draft_bill",
  description:
    "Prepare household bills (electricity, water, internet, rent, subscriptions, installments) as draft cards the user reviews and saves. " +
    "Call it ONCE with every bill the user named in the `bills` list (up to three), as soon as you know what each bill is and its amount. " +
    "Nothing is saved by this tool; afterwards, tell the user to check each card and press Add bill. Describe only the drafts the tool returned. " +
    "Convert units to full numbers: 450 ribu = 450000. payee is the company being paid (e.g. PLN), not the person paying.",
  parameters: {
    type: "object",
    properties: {
      bills: {
        type: "array",
        description: "One entry per bill the user mentioned (1 to 3).",
        items: {
          type: "object",
          properties: {
            title: { type: "string", description: "Short bill name in the user's language, e.g. 'Listrik PLN'." },
            amount: { type: "number", description: "Full amount per period in the household currency, e.g. 450000." },
            dueDay: { type: "number", description: "Day of the month it is due (1-31), if the user said one." },
            recurrence: {
              type: "string",
              enum: ["monthly", "none"],
              description: "monthly for repeating bills (DEFAULT); none for a one-time bill.",
            },
            payee: { type: "string", description: "Company being paid, if mentioned, e.g. PLN." },
          },
          required: ["title", "amount"],
          additionalProperties: false,
        },
      },
    },
    required: ["bills"],
    additionalProperties: false,
  },
};

export const SEIYA_TOOL_DEFINITIONS: AIToolDefinition[] = [
  ...SEIYA_READ_TOOLS,
  RECORD_EXPENSE_TOOL,
  RECORD_INCOME_TOOL,
  DRAFT_BILL_TOOL,
];

const ALLOWED_TOOL_NAMES = new Set<ToolName>([
  "get_budget_summary",
  "list_upcoming_bills",
  "get_household_rules",
  "get_wallet_summary",
  "record_expense",
  "record_income",
  "draft_bill",
]);

type PlainRecord = Record<string, unknown>;
function isPlainRecord(value: unknown): value is PlainRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function numeric(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function safeText(value: unknown, maxLength = 160): string | null {
  if (typeof value !== "string") return null;
  return value.slice(0, maxLength);
}

function sanitizeStructuredValue(value: unknown, depth = 0): unknown {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") return value.slice(0, 180);
  if (depth >= 4) return "[depth limited]";
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeStructuredValue(item, depth + 1));
  if (!isPlainRecord(value)) return null;

  const output: PlainRecord = {};
  for (const [key, item] of Object.entries(value).slice(0, 30)) {
    if (/^[a-zA-Z0-9_.-]{1,64}$/.test(key)) output[key] = sanitizeStructuredValue(item, depth + 1);
  }
  return output;
}

function toJson(value: unknown): string {
  const json = JSON.stringify(value);
  if (!json) return "null";
  if (json.length > 5_500) return JSON.stringify({ ok: false, message: "Tool output was too large and has been omitted." });
  return json;
}

async function getBudgetSummary(context: SeiyaToolContext): Promise<unknown> {
  const { data, error } = await getHouseholdBudgetProgress(context.supabase, context.householdId);
  if (error) {
    console.warn("[Seiya Agent] budget tool failed", { code: error.code ?? "unknown" });
    return { ok: false, message: "Budget information is temporarily unavailable. Do not infer or invent budget numbers." };
  }

  const root = isPlainRecord(data) ? data : {};
  const rawBudgets = Array.isArray(root.budgets) ? root.budgets : [];
  const budgets = rawBudgets.slice(0, 12).map((item) => {
    const row = isPlainRecord(item) ? item : {};
    return {
      category: safeText(row.category, 64),
      amount: numeric(row.amount),
      currency: safeText(row.currency, 3),
      period_start: safeText(row.period_start, 10),
      period_end: safeText(row.period_end, 10),
      spent: numeric(row.spent),
      remaining: numeric(row.remaining),
      usage_percent: numeric(row.usage_percent),
      over_budget: typeof row.over_budget === "boolean" ? row.over_budget : null,
    };
  });

  return {
    ok: true,
    as_of_utc_date: context.today,
    budget_count_returned: budgets.length,
    scope_note: "Spending reflects executed expenses from active shared wallets only. Personal-wallet spending is excluded. Amounts remain in each budget's currency; no FX conversion is performed.",
    budgets,
  };
}

async function listUpcomingBills(context: SeiyaToolContext): Promise<unknown> {
  const horizonDate = new Date(`${context.today}T00:00:00.000Z`);
  horizonDate.setUTCDate(horizonDate.getUTCDate() + 30);
  const horizon = horizonDate.toISOString().slice(0, 10);

  const [overdueResult, upcomingResult] = await Promise.all([
    context.supabase
      .from("bills")
      .select("title, payee, amount, currency, due_date, recurrence, status")
      .eq("household_id", context.householdId)
      .in("status", ["upcoming", "overdue", "pending_approval"])
      .lt("due_date", context.today)
      .order("due_date", { ascending: true })
      .limit(10),
    context.supabase
      .from("bills")
      .select("title, payee, amount, currency, due_date, recurrence, status")
      .eq("household_id", context.householdId)
      .in("status", ["upcoming", "pending_approval"])
      .gte("due_date", context.today)
      .lte("due_date", horizon)
      .order("due_date", { ascending: true })
      .limit(10),
  ]);

  if (overdueResult.error || upcomingResult.error) {
    const code = overdueResult.error?.code ?? upcomingResult.error?.code ?? "unknown";
    console.warn("[Seiya Agent] bills tool failed", { code });
    return { ok: false, message: "Bill information is temporarily unavailable. Do not infer or invent due dates or amounts." };
  }

  const rows = [...(overdueResult.data ?? []), ...(upcomingResult.data ?? [])]
    .sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)))
    .slice(0, 12)
    .map((bill) => ({
      title: safeText(bill.title, 120),
      payee: safeText(bill.payee, 120),
      amount: numeric(bill.amount),
      currency: safeText(bill.currency, 3),
      due_date: safeText(bill.due_date, 10),
      recurrence: safeText(bill.recurrence, 16),
      status: bill.status === "upcoming" && bill.due_date < context.today ? "overdue" : bill.status,
    }));

  return {
    ok: true,
    as_of_utc_date: context.today,
    horizon_end_utc_date: horizon,
    bill_count_returned: rows.length,
    bills: rows,
  };
}

async function getHouseholdRules(context: SeiyaToolContext): Promise<unknown> {
  const { data, error } = await context.supabase
    .from("household_finance_rules")
    .select("version, rules, activated_at")
    .eq("household_id", context.householdId)
    .eq("status", "active")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn("[Seiya Agent] rules tool failed", { code: error.code ?? "unknown" });
    return { ok: false, message: "The active household agreement could not be retrieved. Do not guess its settings." };
  }
  if (!data) return { ok: true, active_agreement: null, message: "There is no active household finance agreement." };

  return {
    ok: true,
    active_agreement: {
      version: numeric(data.version),
      activated_at: safeText(data.activated_at, 40),
      rules: sanitizeStructuredValue(data.rules),
    },
  };
}

async function getWalletSummary(context: SeiyaToolContext): Promise<unknown> {
  const { data, error } = await context.supabase
    .from("wallets")
    .select("wallet_type, name, currency, simulated_balance")
    .eq("household_id", context.householdId)
    .eq("status", "active")
    .order("wallet_type", { ascending: true })
    .limit(5);

  if (error) {
    console.warn("[Seiya Agent] wallets tool failed", { code: error.code ?? "unknown" });
    return { ok: false, message: "Wallet information is temporarily unavailable. Do not infer or invent balances." };
  }

  const wallets = (data ?? []).map((wallet: { wallet_type: unknown; name: unknown; currency: unknown; simulated_balance: unknown }) => ({
    wallet_type: safeText(wallet.wallet_type, 16),
    name: safeText(wallet.name, 100),
    currency: safeText(wallet.currency, 3),
    simulated_balance: numeric(wallet.simulated_balance),
  }));

  return {
    ok: true,
    balance_type: "simulated_only_not_real_money",
    visibility_note: "Includes active shared wallets and only the authenticated user's own personal wallet. Another partner's personal wallet is not exposed.",
    wallet_count: wallets.length,
    wallets,
  };
}

type WalletRow = {
  id: string;
  wallet_type: string;
  owner_user_id: string | null;
  name: string;
  currency: string;
  simulated_balance: number;
};

function formatAmount(value: number | null, currency: string | null): string {
  if (value === null) return "unknown amount";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency ?? "IDR",
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currency ?? ""} ${value}`.trim();
  }
}

type TransactionSummary = {
  id: string | null;
  amount: number | null;
  currency: string | null;
  category: string | null;
  description: string | null;
  status: string | null;
  requires_approval: boolean | null;
  hold_until: string | null;
  wallet_name: string;
};

function toTransactionSummary(raw: unknown, walletName: string): TransactionSummary {
  const row = isPlainRecord(raw) ? raw : {};
  return {
    id: safeText(row.id, 40),
    amount: numeric(row.amount),
    currency: safeText(row.currency, 3),
    category: safeText(row.category, 40),
    description: safeText(row.description, 250),
    status: safeText(row.status, 20),
    requires_approval: typeof row.requires_approval === "boolean" ? row.requires_approval : null,
    hold_until: safeText(row.hold_until, 40),
    wallet_name: walletName,
  };
}

function expenseStatusNote(status: string | null, holdUntil: string | null): string {
  if (status === "executed") {
    return "Recorded and directly executed: active agreement does not require approval or cooling-off for this amount.";
  }
  if (status === "pending_approval") {
    return "Recorded and awaiting partner approval in accordance with your agreed threshold. Do not consider approved until your partner decides.";
  }
  if (status === "on_hold") {
    return `Recorded and held under cooling-off${holdUntil ? ` until ${holdUntil}` : ""} before execution in accordance with active agreement.`;
  }
  return `Recorded with status ${status ?? "unknown"}. Report status as returned; do not fabricate outcomes.`;
}

const RECORDED_STATUSES = new Set(["executed", "pending_approval", "on_hold", "approved", "rejected"]);

function recordExpenseErrorMessage(code?: string): string {
  switch (code) {
    case "42501":
      return "You do not have permission to record this transaction.";
    case "P0002":
      return "Wallet or household not found.";
    case "22023":
      return "This wallet is not permitted by the active financial agreement, or no agreement is active. Review the agreement page before retrying.";
    case "P1001":
      return "Insufficient simulated wallet balance for this amount. Do not record; report the shortfall as-is.";
    case "P1002":
      return "Active financial agreement settings are invalid, so the transaction cannot be recorded. Ask user to review agreement settings.";
    case "23505":
      return "A similar transaction request is already being processed.";
    default:
      return "Failed to record expense due to a system error. Please retry shortly; do not fabricate outcomes.";
  }
}

async function recordExpense(
  args: Record<string, unknown>,
  context: SeiyaToolContext,
): Promise<unknown> {
  const parsed = validateRecordExpenseInput(args);
  if (!parsed.ok) return { ok: false, recorded: false, message: parsed.message };
  const input = parsed.data;

  const { data: walletRows, error: walletError } = await context.supabase
    .from("wallets")
    .select("id, wallet_type, owner_user_id, name, currency, simulated_balance")
    .eq("household_id", context.householdId)
    .eq("status", "active")
    .order("wallet_type", { ascending: true })
    .limit(5);

  if (walletError) {
    console.warn("[Seiya Agent] record_expense wallet lookup failed", { code: walletError.code ?? "unknown" });
    return { ok: false, recorded: false, message: "Wallet list is temporarily unavailable. Please retry shortly; do not fabricate results." };
  }

  const wallets = (walletRows ?? []) as WalletRow[];
  const wallet = input.wallet === "shared"
    ? wallets.find((item) => item.wallet_type === "shared")
    : wallets.find((item) => item.wallet_type === "personal" && item.owner_user_id === context.userId);

  if (!wallet) {
    return {
      ok: false,
      recorded: false,
      message: input.wallet === "shared"
        ? "Shared wallet is not active for this household. Do not record to another wallet."
        : "You do not have an active personal wallet. If the user wants to record to the shared wallet, use wallet 'shared'.",
    };
  }

  if (input.currency && input.currency !== wallet.currency) {
    return {
      ok: false,
      recorded: false,
      message: `User mentioned ${input.currency} but this wallet uses ${wallet.currency}. Do not convert currencies yourself; request amount in ${wallet.currency} first.`,
    };
  }

  if (wallet.currency === "IDR" && input.amount < 1_000) {
    return {
      ok: false,
      recorded: false,
      message: `Amount ${input.amount} is too small for wallet ${wallet.currency}; units may be incorrect. Convert to full numbers (20 million = 20000000, 50 thousand = 50000) then call again.`,
    };
  }

  // Same user + household + day + message + wallet + amount => same key, so a retry, a resend, or a
  // re-run of the same test cannot double-book. Description and category stay out of the key: the
  // model worded them differently between runs, which used to create a second row for one message.
  const idempotencyKey = `ai-expense-${createHash("sha256")
    .update(`${context.expenseSeed}\n${input.wallet}\n${input.amount.toFixed(2)}`)
    .digest("hex")
    .slice(0, 56)}`;

  const { data, error } = await requestSimulatedTransaction(context.supabase, context.householdId, {
    walletId: wallet.id,
    transactionType: "expense",
    amount: input.amount,
    description: input.description,
    category: input.category,
    idempotencyKey,
  });

  if (error) {
    if (error.code === "P1001") {
      // The model cannot see balances in the same turn, so hand it the numbers and the default rule
      // instead of a generic failure. No silent fallback: shared vs personal changes approval rules.
      const sharedWallet = wallets.find((item) => item.wallet_type === "shared");
      const personalWallet = wallets.find(
        (item) => item.wallet_type === "personal" && item.owner_user_id === context.userId,
      );
      const alternatives = [
        sharedWallet ? `wallet 'shared' (${sharedWallet.name}) has ${formatAmount(sharedWallet.simulated_balance, sharedWallet.currency)}` : null,
        personalWallet ? `wallet 'personal' (${personalWallet.name}) has ${formatAmount(personalWallet.simulated_balance, personalWallet.currency)}` : null,
      ].filter(Boolean).join("; ");

      // Requests waiting for approval or on cooling-off hold reserve part of the
      // balance, so "balance 34M is not enough for 20M" needs that explained.
      const { data: reservedRows } = await context.supabase
        .from("transactions")
        .select("amount")
        .eq("wallet_id", wallet.id)
        .eq("transaction_type", "expense")
        .in("status", ["pending_approval", "on_hold"]);
      const reserved = (reservedRows ?? []).reduce((sum, row) => sum + (numeric(row.amount) ?? 0), 0);
      const balance = numeric(wallet.simulated_balance) ?? 0;
      const reservedNote = reserved > 0
        ? ` ${formatAmount(reserved, wallet.currency)} of it is reserved by expenses waiting for partner approval or on cooling-off hold, ` +
          `so only ${formatAmount(Math.max(0, balance - reserved), wallet.currency)} is available. Mention this reservation to the user.`
        : "";

      console.warn("[Seiya Agent] record_expense insufficient balance", { wallet: input.wallet, code: error.code });
      return {
        ok: false,
        recorded: false,
        message:
          `Not recorded: ${wallet.name} (${input.wallet}) balance ${formatAmount(wallet.simulated_balance, wallet.currency)} ` +
          `is not enough for ${formatAmount(input.amount, wallet.currency)}.${reservedNote} Currently ${alternatives}. ` +
          "Do not claim money has left or transaction has been recorded. " +
          "Household expenses are generally billed to the shared wallet; explain the condition to user and ask them to confirm the intended wallet.",
      };
    }
    if (error.code !== "P1003") {
      console.warn("[Seiya Agent] record_expense failed", { code: error.code ?? "unknown" });
      return { ok: false, recorded: false, message: recordExpenseErrorMessage(error.code) };
    }

    // Same chat message already recorded with a different detail: report the stored row instead of failing.
    const { data: duplicateRow } = await context.supabase
      .from("transactions")
      .select("id, amount, currency, category, description, status, requires_approval, hold_until")
      .eq("household_id", context.householdId)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();

    if (!duplicateRow) {
      return { ok: false, recorded: false, message: recordExpenseErrorMessage("P1003") };
    }
    return {
      ok: true,
      recorded: false,
      duplicate: true,
      transaction: toTransactionSummary(duplicateRow, wallet.name),
      status_note: "This expense was already recorded from the same message and will not be booked twice. Report the existing status.",
    };
  }

  const payload = isPlainRecord(data) ? data : {};
  const rawTransaction = payload.transaction;
  const status = safeText(isPlainRecord(rawTransaction) ? rawTransaction.status : null, 20);
  if (!status || !RECORDED_STATUSES.has(status)) {
    console.warn("[Seiya Agent] record_expense returned unexpected status", { status: status ?? "missing" });
    return { ok: false, recorded: false, message: "Recording outcome could not be determined. Do not claim transaction was recorded; ask user to inspect transactions list." };
  }

  return {
    ok: true,
    recorded: true,
    duplicate: payload.idempotent_replay === true,
    transaction: toTransactionSummary(rawTransaction, wallet.name),
    status_note: expenseStatusNote(status, safeText(isPlainRecord(rawTransaction) ? rawTransaction.hold_until : null, 40)),
  };
}

async function recordIncome(args: Record<string, unknown>, context: SeiyaToolContext): Promise<unknown> {
  if (!isPlainRecord(args)) return { ok: false, recorded: false, message: "Invalid record_income arguments." };
  const amount = numeric(args.amount);
  const description = typeof args.description === "string" ? args.description.trim().replace(/\s+/g, " ").slice(0, 120) : "";
  const walletKind = args.wallet === "shared" ? "shared" : "personal";
  const currency = typeof args.currency === "string" && args.currency.trim() ? args.currency.trim().toUpperCase() : null;
  if (amount === null || amount <= 0 || amount > 999_999_999_999 || Math.round(amount * 100) / 100 !== amount) {
    return { ok: false, recorded: false, message: "Ask the user for the exact amount that came in." };
  }

  const { data: walletRows, error: walletError } = await context.supabase
    .from("wallets")
    .select("id, wallet_type, owner_user_id, name, currency, simulated_balance")
    .eq("household_id", context.householdId)
    .eq("status", "active")
    .limit(5);
  if (walletError) {
    return { ok: false, recorded: false, message: "Wallet list is temporarily unavailable. Do not claim anything was recorded." };
  }
  const wallets = (walletRows ?? []) as WalletRow[];
  const wallet = walletKind === "shared"
    ? wallets.find((item) => item.wallet_type === "shared")
    : wallets.find((item) => item.wallet_type === "personal" && item.owner_user_id === context.userId);
  if (!wallet) {
    return {
      ok: false,
      recorded: false,
      message: "Wallets are not open yet (they open once both partners agree on Seiya's Promise). Nothing was recorded.",
    };
  }
  if (currency && currency !== wallet.currency) {
    return { ok: false, recorded: false, message: `The user said ${currency} but this wallet uses ${wallet.currency}. Ask for the amount in ${wallet.currency}.` };
  }
  if (wallet.currency === "IDR" && amount < 1_000) {
    return { ok: false, recorded: false, message: `Amount ${amount} looks too small for IDR; convert units (8 juta = 8000000) and call again.` };
  }

  const idempotencyKey = `ai-income-${createHash("sha256")
    .update(`${context.expenseSeed}\n${walletKind}\n${amount.toFixed(2)}`)
    .digest("hex")
    .slice(0, 56)}`;
  const { data, error } = await requestSimulatedTransaction(context.supabase, context.householdId, {
    walletId: wallet.id,
    transactionType: "income",
    amount,
    description: description || "Money added",
    category: "income",
    idempotencyKey,
  });
  if (error && error.code !== "P1003") {
    console.warn("[Seiya Agent] record_income failed", { code: error.code ?? "unknown" });
    return { ok: false, recorded: false, message: "Recording failed. Do not claim the money was added; suggest Add money on the Wallets page." };
  }
  const payload = isPlainRecord(data) ? data : {};
  return {
    ok: true,
    recorded: !error,
    duplicate: Boolean(error) || payload.idempotent_replay === true,
    transaction: toTransactionSummary(payload.transaction ?? { amount, currency: wallet.currency, description, status: "executed" }, wallet.name),
    status_note: error
      ? "This income was already recorded from the same message and was not added twice."
      : `Added to ${wallet.name}. New balance is about ${formatAmount((numeric(wallet.simulated_balance) ?? 0) + amount, wallet.currency)}.`,
  };
}

/** Next date (YYYY-MM-DD, from `today`) that falls on `dueDay`, clamped to short months. */
function nextDueDate(today: string, dueDay: number | null): string {
  const [y, m, d] = today.split("-").map(Number);
  if (!dueDay) {
    const fallback = new Date(Date.UTC(y, m - 1, d + 7));
    return fallback.toISOString().slice(0, 10);
  }
  const onDay = (year: number, month: number) => {
    const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    return new Date(Date.UTC(year, month, Math.min(dueDay, last)));
  };
  let due = onDay(y, m - 1);
  if (due.getUTCDate() < d) due = onDay(y, m);
  return due.toISOString().slice(0, 10);
}

function parseBillDraft(raw: unknown, today: string, currency: string) {
  if (!isPlainRecord(raw)) return null;
  const title = typeof raw.title === "string" ? raw.title.trim().replace(/\s+/g, " ").slice(0, 160) : "";
  const amount = numeric(raw.amount);
  if (!title || amount === null || amount <= 0 || amount > 999_999_999_999) return null;
  const rawDay = numeric(raw.dueDay);
  const dueDay = rawDay !== null && Number.isInteger(rawDay) && rawDay >= 1 && rawDay <= 31 ? rawDay : null;
  return {
    title,
    payee: typeof raw.payee === "string" && raw.payee.trim() ? raw.payee.trim().slice(0, 160) : null,
    amount: Math.round(amount * 100) / 100,
    currency,
    dueDate: nextDueDate(today, dueDay),
    dueDayGiven: dueDay !== null,
    recurrence: raw.recurrence === "none" ? "none" : "monthly",
  };
}

async function draftBill(args: unknown, context: SeiyaToolContext): Promise<unknown> {
  if (!isPlainRecord(args)) return { ok: false, message: "Invalid draft_bill arguments." };
  // Older single-bill shape ({ title, amount, ... }) is still accepted.
  const entries = Array.isArray(args.bills) ? args.bills.slice(0, 3) : [args];

  const { data: household } = await context.supabase
    .from("households")
    .select("base_currency")
    .eq("id", context.householdId)
    .maybeSingle();
  const currency = safeText(household?.base_currency, 3) ?? "IDR";

  const drafts = entries.map((entry) => parseBillDraft(entry, context.today, currency)).filter((d) => d !== null);
  if (!drafts.length) {
    return { ok: false, message: "Ask the user what the bill is for and how much it is." };
  }

  return {
    ok: true,
    saved: false,
    drafts,
    skipped: entries.length - drafts.length,
    note: "Not saved yet. The user reviews each card and presses Add bill to save it.",
  };
}

const READ_TOOL_NAMES = new Set<ToolName>([
  "get_budget_summary",
  "list_upcoming_bills",
  "get_household_rules",
  "get_wallet_summary",
]);

export async function executeSeiyaTool(
  name: string,
  args: Record<string, unknown>,
  context: SeiyaToolContext,
): Promise<unknown> {
  if (!ALLOWED_TOOL_NAMES.has(name as ToolName)) {
    return { ok: false, message: "This tool is not available." };
  }
  const expectsNoArguments = READ_TOOL_NAMES.has(name as ToolName);
  if (expectsNoArguments && (!isPlainRecord(args) || Object.keys(args).length !== 0)) {
    return { ok: false, message: "This read tool accepts no arguments." };
  }

  try {
    switch (name as ToolName) {
      case "get_budget_summary": return await getBudgetSummary(context);
      case "list_upcoming_bills": return await listUpcomingBills(context);
      case "get_household_rules": return await getHouseholdRules(context);
      case "get_wallet_summary": return await getWalletSummary(context);
      case "record_expense": return await recordExpense(args, context);
      case "record_income": return await recordIncome(args, context);
      case "draft_bill": return await draftBill(args, context);
    }
  } catch {
    // Do not send raw exceptions or SQL/provider details to the model.
    console.warn("[Seiya Agent] tool threw unexpectedly", { tool: name });
    return { ok: false, message: "This information is temporarily unavailable. Do not invent details." };
  }
}

export function serializeToolResult(value: unknown): string {
  return toJson(value);
}

export function isAllowedSeiyaTool(name: string): boolean {
  return ALLOWED_TOOL_NAMES.has(name as ToolName);
}

