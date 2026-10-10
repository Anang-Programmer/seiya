import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { getHouseholdBudgetProgress } from "@/backend/services/bill-budget.service";
import type { AIToolDefinition } from "@/backend/agents";

type UserScopedSupabaseClient = Awaited<ReturnType<typeof createClient>>;
type ToolName = "get_budget_summary" | "list_upcoming_bills" | "get_household_rules" | "get_wallet_summary";

export interface ReadToolContext {
  supabase: UserScopedSupabaseClient;
  householdId: string;
  today: string;
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

const ALLOWED_TOOL_NAMES = new Set<ToolName>([
  "get_budget_summary",
  "list_upcoming_bills",
  "get_household_rules",
  "get_wallet_summary",
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

async function getBudgetSummary(context: ReadToolContext): Promise<unknown> {
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

async function listUpcomingBills(context: ReadToolContext): Promise<unknown> {
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

async function getHouseholdRules(context: ReadToolContext): Promise<unknown> {
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

async function getWalletSummary(context: ReadToolContext): Promise<unknown> {
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

export async function executeSeiyaReadTool(
  name: string,
  args: Record<string, unknown>,
  context: ReadToolContext,
): Promise<unknown> {
  if (!ALLOWED_TOOL_NAMES.has(name as ToolName)) {
    return { ok: false, message: "This tool is not available." };
  }
  if (!isPlainRecord(args) || Object.keys(args).length !== 0) {
    return { ok: false, message: "This read tool accepts no arguments." };
  }

  try {
    switch (name as ToolName) {
      case "get_budget_summary": return await getBudgetSummary(context);
      case "list_upcoming_bills": return await listUpcomingBills(context);
      case "get_household_rules": return await getHouseholdRules(context);
      case "get_wallet_summary": return await getWalletSummary(context);
    }
  } catch {
    // Do not send raw exceptions or SQL/provider details to the model.
    console.warn("[Seiya Agent] read tool threw unexpectedly", { tool: name });
    return { ok: false, message: "This information is temporarily unavailable. Do not invent details." };
  }
}

export function serializeToolResult(value: unknown): string {
  return toJson(value);
}

export function isAllowedSeiyaReadTool(name: string): boolean {
  return ALLOWED_TOOL_NAMES.has(name as ToolName);
}

