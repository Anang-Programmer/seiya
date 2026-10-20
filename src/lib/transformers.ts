import type {
  ActivityItem,
  ApprovalRequest,
  BillItem,
  CoupleContract,
  HeldPurchase,
  PlanItem,
  Transaction,
  UserRole,
} from "./store";
import type {
  ApiActivity,
  ApiApproval,
  ApiBill,
  ApiFinanceRule,
  ApiFinanceRuleApproval,
  ApiFinanceRuleSet,
  ApiHeldPurchase,
  ApiPlan,
  ApiTransaction,
  ApiWallet,
} from "./api";

// Household membership roles map onto the two partner slots the UI uses:
// the household owner is always partner A, the invited partner is partner B.
export function roleFromMembership(role: string | null | undefined): UserRole {
  return role === "partner" ? "partner_b" : "partner_a";
}

export function otherRole(role: UserRole): UserRole {
  return role === "partner_a" ? "partner_b" : "partner_a";
}

export interface TransformContext {
  myUserId: string | null;
  myRole: UserRole;
  locale: string;
  sharedWalletId: string | null;
  myPersonalWalletId: string | null;
}

const toNumber = (value: number | string | null | undefined) => {
  const n = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
};

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

// "Today, 08:34" / "Yesterday, 14:20" / "12 Oct 2026, 17:30"
export function formatRelativeDate(iso: string | null | undefined, locale: string) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;

  const time = date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  const dayDiff = Math.round((startOfDay(new Date()).getTime() - startOfDay(date).getTime()) / 86_400_000);

  if (dayDiff === 0) return `Today, ${time}`;
  if (dayDiff === 1) return `Yesterday, ${time}`;
  const day = date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  return `${day}, ${time}`;
}

export function formatTimeAgo(iso: string | null | undefined) {
  if (!iso) return "Recently";
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return "Recently";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

// ---------------------------------------------------------------------------
// Wallets
// ---------------------------------------------------------------------------

export type WalletState = {
  personalA: { balance: number; currency: string; label: string };
  personalB: { balance: number; currency: string; label: string };
  shared: { balance: number; currency: string; label: string };
};

export function transformWallets(
  rows: ApiWallet[],
  ctx: Pick<TransformContext, "myUserId" | "myRole">,
  fallbackCurrency: string
): { wallets: WalletState; sharedWalletId: string | null; myPersonalWalletId: string | null } {
  const shared = rows.find((w) => w.wallet_type === "shared");
  // RLS only exposes the caller's own personal wallet; the partner's stays private.
  const mine = rows.find((w) => w.wallet_type === "personal" && w.owner_user_id === ctx.myUserId);
  const partner = rows.find((w) => w.wallet_type === "personal" && w.owner_user_id !== ctx.myUserId);

  const mineSlot = { balance: toNumber(mine?.simulated_balance), currency: mine?.currency ?? fallbackCurrency };
  const partnerSlot = { balance: toNumber(partner?.simulated_balance), currency: partner?.currency ?? fallbackCurrency };

  const personalA = ctx.myRole === "partner_a" ? mineSlot : partnerSlot;
  const personalB = ctx.myRole === "partner_a" ? partnerSlot : mineSlot;

  return {
    wallets: {
      personalA: { ...personalA, label: ctx.myRole === "partner_a" ? "Your balance" : "Partner balance" },
      personalB: { ...personalB, label: ctx.myRole === "partner_b" ? "Your balance" : "Partner balance" },
      shared: {
        balance: toNumber(shared?.simulated_balance),
        currency: shared?.currency ?? fallbackCurrency,
        label: "Shared balance",
      },
    },
    sharedWalletId: shared?.id ?? null,
    myPersonalWalletId: mine?.id ?? null,
  };
}

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

const CATEGORY_MAP: Array<[RegExp, Transaction["category"]]> = [
  [/income|salary|payout|gaji/i, "Income"],
  [/food|drink|dining|restaurant|lunch|dinner|coffee|makan/i, "Food & Drinks"],
  [/grocer|shop|belanja|clothes|fashion/i, "Shopping"],
  [/bill|utilit|internet|electric|subscription|tagihan|insurance/i, "Bills"],
  [/transport|fuel|taxi|ride|commute|travel/i, "Transportation"],
  [/health|medical|pharma|doctor/i, "Health"],
  [/social|gift|entertain|event/i, "Social"],
];

export function toFrontendCategory(raw: string | null | undefined, isIncome = false): Transaction["category"] {
  if (isIncome) return "Income";
  const value = (raw ?? "").trim();
  if (!value) return "Others";
  const exact = ["Food & Drinks", "Shopping", "Bills", "Transportation", "Health", "Social", "Others", "Income"];
  if (exact.includes(value)) return value as Transaction["category"];
  for (const [pattern, category] of CATEGORY_MAP) {
    if (pattern.test(value)) return category;
  }
  return "Others";
}

export function transformTransaction(row: ApiTransaction, ctx: TransformContext): Transaction {
  const isIncome = row.transaction_type === "income";
  const absAmount = Math.abs(toNumber(row.amount));
  const paidBy: UserRole =
    row.created_by && ctx.myUserId && row.created_by !== ctx.myUserId ? otherRole(ctx.myRole) : ctx.myRole;

  let wallet: Transaction["wallet"] = "shared";
  if (row.wallet_id && row.wallet_id !== ctx.sharedWalletId) {
    const ownerRole = row.wallet_id === ctx.myPersonalWalletId ? ctx.myRole : paidBy;
    wallet = ownerRole === "partner_a" ? "personal_a" : "personal_b";
  }

  const when = row.occurred_at ?? row.created_at;

  return {
    id: row.id,
    title: row.description || "Transaction",
    amount: isIncome ? absAmount : -absAmount,
    currency: row.currency,
    category: toFrontendCategory(row.category, isIncome),
    wallet,
    paidBy,
    date: formatRelativeDate(when, ctx.locale),
    timestamp: when,
    isPrivateToA: wallet === "personal_a" || undefined,
    isPrivateToB: wallet === "personal_b" || undefined,
  };
}

// ---------------------------------------------------------------------------
// Bills
// ---------------------------------------------------------------------------

export function daysUntil(isoDate: string) {
  const due = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(due.getTime())) return 0;
  return Math.round((due.getTime() - startOfDay(new Date()).getTime()) / 86_400_000);
}

export function formatDueDate(isoDate: string) {
  const date = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return isoDate;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// Accepts "2026-10-17", "17 Oct 2026", "Oct 17, 2026" … and returns YYYY-MM-DD.
// Free text such as "Monthly" falls back to `fallbackDays` from today.
export function toIsoDate(input: string | null | undefined, fallbackDays = 14) {
  const value = (input ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

  // "Every 15th" -> the next calendar date falling on day 15.
  const dayOfMonth = value.match(/^every\s+(\d{1,2})(?:st|nd|rd|th)?$/i);
  if (dayOfMonth) {
    const day = Math.min(28, Math.max(1, Number(dayOfMonth[1])));
    const today = new Date();
    const next = new Date(today.getFullYear(), today.getMonth(), day);
    if (next < startOfDay(today)) next.setMonth(next.getMonth() + 1);
    return toIsoDate(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
  }

  const parsed = value ? new Date(value) : new Date(NaN);
  const date = Number.isNaN(parsed.getTime())
    ? new Date(Date.now() + fallbackDays * 86_400_000)
    : parsed;

  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function transformBill(row: ApiBill, ctx: Pick<TransformContext, "myUserId" | "myRole">): BillItem {
  const status: BillItem["status"] =
    row.status === "paid" ? "paid" : row.status === "pending_approval" ? "pending_approval" : "upcoming";

  return {
    id: row.id,
    title: row.title,
    amount: toNumber(row.amount),
    currency: row.currency,
    dueDate: formatDueDate(row.due_date),
    daysRemaining: daysUntil(row.due_date),
    wallet: "shared",
    // The bills table has no category column; the UI category is stored as the payee.
    category: row.payee || "Bills",
    status,
    isRecurring: row.recurrence !== "none",
    notes: row.notes ?? undefined,
    paidBy:
      row.created_by && ctx.myUserId && row.created_by !== ctx.myUserId ? otherRole(ctx.myRole) : ctx.myRole,
  };
}

/**
 * Flags an unpaid bill that costs noticeably more (over 10%) than the last paid
 * bill with the same name and currency. Nothing is guessed: no history, no flag.
 */
export function withBillIncreaseAnomalies(rows: ApiBill[], bills: BillItem[]): BillItem[] {
  const key = (title: string) => title.trim().toLowerCase();
  const lastPaid = new Map<string, ApiBill>();
  for (const row of rows) {
    if (row.status !== "paid") continue;
    const k = `${key(row.title)}|${row.currency}`;
    const prev = lastPaid.get(k);
    if (!prev || row.due_date > prev.due_date) lastPaid.set(k, row);
  }
  return bills.map((bill, i) => {
    const row = rows[i];
    if (bill.status === "paid" || bill.anomaly) return bill;
    const prev = lastPaid.get(`${key(row.title)}|${row.currency}`);
    const prevAmount = prev ? toNumber(prev.amount) : 0;
    if (!prev || prevAmount <= 0 || bill.amount <= prevAmount * 1.1) return bill;
    const pct = Math.round(((bill.amount - prevAmount) / prevAmount) * 100);
    return {
      ...bill,
      anomaly: { type: "increase" as const, message: `Up ${pct}% from the last payment of this bill. Check it before paying.` },
    };
  });
}

// ---------------------------------------------------------------------------
// Approvals, plans, activities, held purchases
// ---------------------------------------------------------------------------

export function transformApproval(row: ApiApproval): ApprovalRequest {
  return {
    id: row.id,
    title: row.title,
    amount: toNumber(row.amount),
    currency: row.currency,
    wallet: row.wallet,
    requester: row.requester,
    approver: row.approver,
    status: row.status,
    reason: row.reason ?? "",
    createdAt: row.createdAt,
    expiresInHours: row.expiresInHours ?? 24,
    category: row.category as ApprovalRequest["category"],
    type: row.type as ApprovalRequest["type"],
    targetId: row.targetId ?? undefined,
    notes: row.notes ?? undefined,
  };
}

const PLAN_STATUSES: PlanItem["status"][] = [
  "Draft",
  "Proposed",
  "Active",
  "Needs review",
  "Paused",
  "Completed",
  "Archived",
];

export function transformPlan(row: ApiPlan): PlanItem {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    targetAmount: toNumber(row.targetAmount),
    currentAmount: toNumber(row.currentAmount),
    currency: row.currency,
    targetDate: row.targetDate,
    recommendedMonthly: toNumber(row.recommendedMonthly),
    splitRecommendation: {
      partnerB: toNumber(row.splitRecommendation?.partnerB),
      partnerA: toNumber(row.splitRecommendation?.partnerA),
    },
    walletFunding: row.walletFunding,
    status: PLAN_STATUSES.includes(row.status as PlanItem["status"]) ? (row.status as PlanItem["status"]) : "Draft",
    assumptions: row.assumptions ?? "",
  };
}

export function transformActivity(row: ApiActivity, locale: string): ActivityItem {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    actor: row.actor,
    status: row.status,
    amount: row.amount,
    currency: row.currency,
    reason: row.reason ?? "",
    timestamp: formatRelativeDate(row.timestamp, locale),
    timeAgo: formatTimeAgo(row.timestamp),
  };
}

export function transformHeldPurchase(row: ApiHeldPurchase, locale: string): HeldPurchase {
  const until = new Date(row.holdUntil);
  return {
    id: row.id,
    title: row.title,
    amount: toNumber(row.amount),
    currency: row.currency,
    wallet: row.wallet,
    requester: row.requester,
    status: row.status,
    holdUntil: Number.isNaN(until.getTime())
      ? row.holdUntilDisplay || row.holdUntil
      : formatRelativeDate(row.holdUntil, locale),
    holdUntilAt: Number.isNaN(until.getTime()) ? undefined : until.toISOString(),
    reason: row.reason ?? "",
    createdAt: row.createdAt,
  };
}

// ---------------------------------------------------------------------------
// Finance rules <-> couple contract
// ---------------------------------------------------------------------------

export const DEFAULT_CONTRACT: CoupleContract = {
  status: "active",
  splitPartnerB: 50,
  splitPartnerA: 50,
  approvalThreshold: 500_000,
  thresholdCurrency: "IDR",
  approveEverySharedPurchase: false,
  cooldownThreshold: 1_000_000,
  cooldownCurrency: "IDR",
  cooldownSchedule: "22:00 - 08:00 (Local Time)",
  coolingOffEnabled: true,
  proposedChange: null,
};

export function contractFromRules(
  rules: ApiFinanceRule[],
  approvals: ApiFinanceRuleApproval[],
  ctx: { myUserId: string | null; myRole: UserRole; currency: string }
): { contract: CoupleContract; pendingRuleId: string | null; pendingNeedsMyApproval: boolean; hasActiveRule: boolean } {
  const active = rules.find((r) => r.status === "active");
  const pending = rules.find((r) => r.status === "pending_approval");

  const base: CoupleContract = active
    ? {
        ...DEFAULT_CONTRACT,
        status: "active",
        // expenseSplit.ownerPercent belongs to the household owner (partner A).
        splitPartnerA: active.rules.expenseSplit?.ownerPercent ?? 50,
        splitPartnerB: active.rules.expenseSplit?.partnerPercent ?? 50,
        approvalThreshold: active.rules.approval?.sharedWalletThreshold ?? DEFAULT_CONTRACT.approvalThreshold,
        thresholdCurrency: ctx.currency,
        approveEverySharedPurchase: Boolean(active.rules.approval?.approveEverySharedPurchase),
        cooldownThreshold: active.rules.coolingOff?.threshold ?? DEFAULT_CONTRACT.cooldownThreshold,
        cooldownCurrency: ctx.currency,
        coolingOffEnabled: active.rules.coolingOff?.enabled ?? true,
      }
    : { ...DEFAULT_CONTRACT, thresholdCurrency: ctx.currency, cooldownCurrency: ctx.currency };

  let pendingNeedsMyApproval = false;
  if (pending) {
    const proposedBy: UserRole =
      pending.created_by === ctx.myUserId ? ctx.myRole : otherRole(ctx.myRole);
    const myApproval = approvals.find((a) => a.rule_id === pending.id && a.user_id === ctx.myUserId);
    pendingNeedsMyApproval = !myApproval || myApproval.decision === "pending";

    base.status = "pending_partner_approval";
    base.proposedChange = {
      splitPartnerA: pending.rules.expenseSplit?.ownerPercent ?? 50,
      splitPartnerB: pending.rules.expenseSplit?.partnerPercent ?? 50,
      approvalThreshold: pending.rules.approval?.sharedWalletThreshold ?? base.approvalThreshold,
      thresholdCurrency: ctx.currency,
      approveEverySharedPurchase: Boolean(pending.rules.approval?.approveEverySharedPurchase),
      proposedBy,
      timestamp: pending.created_at,
    };
  }

  return {
    contract: base,
    pendingRuleId: pending?.id ?? null,
    pendingNeedsMyApproval,
    hasActiveRule: Boolean(active),
  };
}

export function rulesFromContract(params: {
  splitPartnerA: number;
  splitPartnerB: number;
  approvalThreshold: number;
  approveEverySharedPurchase?: boolean;
  coolingOffEnabled?: boolean;
  cooldownThreshold?: number;
  walletMode?: ApiFinanceRuleSet["walletMode"];
}): ApiFinanceRuleSet {
  const ownerPercent = Math.round(params.splitPartnerA);
  return {
    walletMode: params.walletMode ?? "shared_and_personal",
    expenseSplit: {
      mode: ownerPercent === 50 ? "equal" : "custom",
      ownerPercent,
      partnerPercent: 100 - ownerPercent,
    },
    approval: {
      requirePartnerApprovalAboveThreshold: true,
      sharedWalletThreshold: Math.max(0, Math.round(params.approvalThreshold)),
      ...(params.approveEverySharedPurchase ? { approveEverySharedPurchase: true } : {}),
    },
    coolingOff: {
      enabled: params.coolingOffEnabled ?? true,
      threshold: Math.max(0, Math.round(params.cooldownThreshold ?? params.approvalThreshold * 2)),
      durationHours: 8,
    },
  };
}
