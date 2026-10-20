"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { convertAmount, convertMoney, setAmountsHidden } from "./currency";
import * as api from "./api";
import { ApiError } from "./api";
import {
  contractFromRules,
  DEFAULT_CONTRACT,
  formatRelativeDate,
  otherRole,
  roleFromMembership,
  rulesFromContract,
  toIsoDate,
  transformActivity,
  transformApproval,
  transformBill,
  withBillIncreaseAnomalies,
  transformHeldPurchase,
  transformPlan,
  transformTransaction,
  transformWallets,
  type TransformContext,
  type WalletState,
} from "./transformers";

export type UserRole = "partner_a" | "partner_b";

export interface Transaction {
  id: string;
  title: string;
  amount: number; // positive = income, negative = expense
  currency: string;
  category: "Food & Drinks" | "Shopping" | "Bills" | "Transportation" | "Health" | "Social" | "Others" | "Income";
  wallet: "shared" | "personal_a" | "personal_b";
  paidBy: "partner_a" | "partner_b";
  splitRatio?: { partnerB: number; partnerA: number };
  partnerBOwesA?: number;
  partnerAOwesB?: number;
  date: string;
  timestamp: string;
  isPrivateToA?: boolean;
  isPrivateToB?: boolean;
}

export type ApprovalCategory = "Bills" | "Plans" | "Expenses" | "Contracts" | "Other";
export type ApprovalType = "BILL" | "PLAN_DELETE" | "EXPENSE" | "CONTRACT" | "GOAL" | "OTHER";

export interface ApprovalRequest {
  id: string;
  title: string;
  amount: number;
  currency: string;
  wallet: "shared" | "personal_a" | "personal_b";
  requester: "partner_a" | "partner_b";
  approver: "partner_a" | "partner_b";
  status: "pending" | "approved" | "declined" | "cancelled" | "expired";
  reason: string;
  createdAt: string;
  expiresInHours: number;
  category?: ApprovalCategory;
  type?: ApprovalType;
  targetId?: string;
  notes?: string;
}

export type AddMoneyWallet = "shared" | "mine";

export interface HeldPurchase {
  id: string;
  title: string;
  amount: number;
  currency: string;
  wallet: "shared" | "personal_a" | "personal_b";
  requester: "partner_a" | "partner_b";
  status: "held" | "released" | "cancelled";
  holdUntil: string;
  /** ISO time the cooling-off ends; drives the countdown and the Continue lock. */
  holdUntilAt?: string;
  reason: string;
  createdAt: string;
}

export interface BillItem {
  id: string;
  title: string;
  amount: number;
  currency: string;
  dueDate: string;
  daysRemaining: number;
  wallet: "shared" | "personal_a" | "personal_b";
  category: string;
  status: "upcoming" | "paid" | "pending_approval";
  isRecurring?: boolean;
  notes?: string;
  paidBy?: "partner_a" | "partner_b";
  anomaly?: {
    type: "duplicate" | "increase";
    message: string;
  };
}

export interface PlanItem {
  id: string;
  title: string;
  category: string;
  targetAmount: number;
  currentAmount: number;
  currency: string;
  targetDate: string;
  recommendedMonthly: number;
  splitRecommendation: { partnerB: number; partnerA: number };
  walletFunding: string;
  status: "Draft" | "Proposed" | "Active" | "Needs review" | "Paused" | "Completed" | "Archived";
  assumptions: string;
}

export interface ActivityItem {
  id: string;
  title: string;
  category: string;
  actor: "partner_a" | "partner_b" | "seiya";
  status: "ALLOW" | "NEED_APPROVAL" | "HOLD" | "DENY" | "INFO";
  amount?: number;
  currency?: string;
  reason: string;
  timestamp: string;
  timeAgo: string;
}

export interface CoupleContract {
  status: "active" | "pending_partner_approval";
  splitPartnerB: number; // e.g. 60
  splitPartnerA: number; // e.g. 40
  approvalThreshold: number; // in thresholdCurrency
  thresholdCurrency: string; // e.g. USD
  approveEverySharedPurchase: boolean; // Optional couple policy
  cooldownThreshold: number;
  cooldownCurrency: string;
  cooldownSchedule: string;
  coolingOffEnabled: boolean;
  proposedChange?: {
    splitPartnerB: number;
    splitPartnerA: number;
    approvalThreshold: number;
    thresholdCurrency: string;
    approveEverySharedPurchase: boolean;
    proposedBy: "partner_a" | "partner_b";
    timestamp: string;
  } | null;
}

export interface ChatMessage {
  id: string;
  sender: "user" | "seiya";
  userRole?: UserRole;
  text: string;
  timestamp: string;
  cardType?:
    | "TRANSACTION"
    | "ACTION_ALLOW"
    | "ACTION_NEED_APPROVAL"
    | "ACTION_HOLD"
    | "ACTION_DENY"
    | "PLAN"
    | "CLARIFICATION"
    | "STATEMENT_PREVIEW"
    | "RECEIPT_DRAFT"
    | "BILL_DRAFT";
  cardData?: any;
}

export interface PendingDirectChat {
  message: string;
  attachedFileName?: string;
  mode?: "personal" | "shared";
}

export interface AuthUser {
  id: string;
  email: string | null;
  fullName: string;
}

export interface PartnerProfile {
  userId: string;
  fullName: string;
}

export interface HouseholdInfo {
  id: string;
  name: string;
  baseCurrency: string;
  country: string | null;
}

export interface ContractMeta {
  pendingRuleId: string | null;
  pendingNeedsMyApproval: boolean;
  hasActiveRule: boolean;
}

export interface ChatHistorySession {
  conversationId: string;
  title: string;
  updatedAt: string;
  messages: ChatMessage[];
  isShared: boolean;
  /** Who started it; only they can rename, share, delete or continue it. */
  creatorRole: UserRole;
}

export interface BudgetSummary {
  amount: number;
  spent: number;
  currency: string;
  usagePercent: number;
  daysRemaining: number;
}

export interface AppNotice {
  id: number;
  kind: "error" | "success" | "info";
  message: string;
}

export type ContractSignatureResult = "active" | "pending_partner" | "awaiting_partner_join" | "error";

export type GatewayOutcome = "ALLOW" | "NEED_APPROVAL" | "HOLD" | "DENY";

interface AppContextType {
  // Auth & session
  isAuthenticated: boolean;
  isLoading: boolean;
  authUser: AuthUser | null;
  householdId: string | null;
  household: HouseholdInfo | null;
  myRole: UserRole;
  hasPin: boolean;
  partnerProfile: PartnerProfile | null;
  refreshSession: () => Promise<api.ApiMeResponse | null>;
  refreshData: () => Promise<void>;
  signOut: () => Promise<void>;
  // Verifies the caller's 6-digit PIN; the first use saves it as their PIN.
  // Resolves to an error message, or null when accepted.
  verifySecurityPin: (pin: string) => Promise<string | null>;
  dataStatus: { loading: boolean; loaded: boolean; error: string | null };
  notices: AppNotice[];
  notify: (kind: AppNotice["kind"], message: string) => void;
  dismissNotice: (id: number) => void;

  currentUser: UserRole;
  // Partner Names & Labels
  partnerAName: string;
  partnerBName: string;
  setPartnerNames: (a: string, b: string) => void;
  locale: string;
  setLocale: (locale: string) => void;
  timeZone: string;
  setTimeZone: (tz: string) => void;
  // Currency Management
  reportingCurrency: string;
  setReportingCurrency: (currency: string) => void;
  /** Privacy mode: money amounts render as "IDR ••••••" (remembered on this device). */
  hideAmounts: boolean;
  toggleHideAmounts: () => void;
  // Wallets Native Balances
  wallets: WalletState;
  walletsReady: boolean;
  // Reporting Estimates
  convertedBalances: {
    personalA: { amount: number; available: boolean; isEstimate: boolean };
    personalB: { amount: number; available: boolean; isEstimate: boolean };
    shared: { amount: number; available: boolean; isEstimate: boolean };
    totalCombined: { amount: number; available: boolean; isIncomplete: boolean };
  };
  monthlySummary: {
    income: number;
    expenses: number;
    currency: string;
  };
  contract: CoupleContract;
  contractMeta: ContractMeta;
  // Aggregate of the budgets whose period covers today (null when none are set).
  budgetSummary: BudgetSummary | null;
  transactions: Transaction[];
  approvals: ApprovalRequest[];
  heldPurchases: HeldPurchase[];
  bills: BillItem[];
  plans: PlanItem[];
  activities: ActivityItem[];
  chatMessages: ChatMessage[];
  settlement: {
    partnerBOwesA: number;
    partnerAOwesB: number;
    currency: string;
  };
  unreadNotificationsCount: number;
  // Gateway & Action Helpers
  processGatewayDecision: (request: {
    actionType: "EXPENSE" | "BILL_PAY" | "PURCHASE" | "EXTERNAL_TRANSFER" | "PRIVACY_REQUEST";
    title: string;
    amount: number;
    currency: string;
    wallet: "shared" | "personal_a" | "personal_b";
    timeOfDay?: string;
    category?: string;
  }) => Promise<{
    outcome: GatewayOutcome;
    reason: string;
    details?: any;
  }>;
  approveRequest: (approvalId: string) => Promise<void>;
  declineRequest: (approvalId: string) => Promise<void>;
  continueHeldPurchase: (heldId: string) => Promise<void>;
  cancelHeldPurchase: (heldId: string) => Promise<void>;
  recordTransaction: (tx: Omit<Transaction, "id" | "date" | "timestamp">) => Promise<Transaction | null>;
  /** Records money coming in (salary, top-up) on the shared wallet or the caller's own wallet. */
  addMoney: (wallet: AddMoneyWallet, amount: number, note: string) => Promise<boolean>;
  /** Set while the Add money dialog is open; any screen can open it. */
  addMoneyRequest: { wallet: AddMoneyWallet; id: number } | null;
  openAddMoney: (wallet?: AddMoneyWallet) => void;
  closeAddMoney: () => void;
  undoTransaction: (txId: string) => Promise<boolean>;
  proposeContractChange: (
    newThreshold: number,
    thresholdCurrency: string,
    newSplitB: number,
    newSplitA: number,
    approveEveryShared: boolean
  ) => Promise<boolean>;
  approveContractChange: () => Promise<boolean>;
  activateInitialContract: (params: {
    splitPartnerA: number;
    splitPartnerB: number;
    approvalThreshold: number;
    thresholdCurrency: string;
    coolingOffEnabled?: boolean;
    approveEverySharedPurchase?: boolean;
    walletMode?: "shared_only" | "shared_and_personal" | "separate_only";
  }) => Promise<ContractSignatureResult>;
  sendChatMessage: (text: string, options?: { sessionKey?: string; shared?: boolean }) => Promise<ChatMessage | null>;
  loadChatHistory: () => Promise<ChatHistorySession[]>;
  /** Saves a rename / share change for a chat; true when saved (or not on the server yet). */
  updateConversation: (sessionKey: string, changes: { title?: string; shared?: boolean }) => Promise<boolean>;
  deleteConversation: (sessionKey: string) => Promise<boolean>;
  payBill: (billId: string) => Promise<void>;
  settleUp: () => Promise<void>;
  // Bill Management
  addBill: (bill: Omit<BillItem, "id" | "daysRemaining">) => Promise<boolean>;
  editBill: (billId: string, updated: Partial<BillItem>) => Promise<boolean>;
  deleteBill: (billId: string) => Promise<boolean>;
  requestPayBill: (billId: string) => Promise<boolean>;
  // Plan Management & Dual-Key Deletion
  addPlan: (newPlan: Omit<PlanItem, "id">) => Promise<PlanItem | null>;
  updatePlan: (planId: string, updated: Partial<PlanItem>) => Promise<boolean>;
  requestDeletePlan: (
    planId: string,
    partnerAPin?: string,
    partnerBPin?: string
  ) => Promise<{ success: boolean; requiresApproval?: boolean; message?: string }>;
  // Approval Queue Management
  approveApprovalRequest: (approvalId: string, pin?: string) => Promise<{ ok: boolean; message?: string }>;
  declineApprovalRequest: (approvalId: string, reason?: string) => Promise<boolean>;
  cancelApprovalRequest: (approvalId: string) => Promise<boolean>;
  // Direct chat shortcut from dashboard
  pendingDirectChat: PendingDirectChat | null;
  setPendingDirectChat: (data: PendingDirectChat | null) => void;
  // Expense Proposal
  proposeExpense: (params: ProposeExpenseParams) => Promise<{
    outcome: "NEED_APPROVAL" | "ALLOW" | "HOLD";
    id: string;
    reason: string;
  }>;
}

export interface ProposeExpenseParams {
  title: string;
  amount: number;
  currency: string;
  category: "Food & Drinks" | "Shopping" | "Bills" | "Transportation" | "Health" | "Social" | "Others";
  wallet: "shared" | "personal_a" | "personal_b";
  splitRatio?: { partnerB: number; partnerA: number };
  notes?: string;
  urgency?: "routine" | "planned" | "urgent" | "emergency";
  receiptName?: string;
  targetDate?: string;
}

const AppContext = createContext<AppContextType | null>(null);

const HELD_TX_PREFIX = "tx:";
const HIDE_AMOUNTS_KEY = "seiya.hideAmounts";
const POLL_INTERVAL_MS = 20_000;

const EMPTY_WALLETS: WalletState = {
  personalA: { balance: 0, currency: "IDR", label: "Your balance" },
  personalB: { balance: 0, currency: "IDR", label: "Partner balance" },
  shared: { balance: 0, currency: "IDR", label: "Shared balance" },
};

const EMPTY_CONTRACT_META: ContractMeta = { pendingRuleId: null, pendingNeedsMyApproval: false, hasActiveRule: false };

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

function errorMessage(error: unknown, fallback = "Something went wrong. Please try again.") {
  if (error instanceof ApiError || error instanceof Error) return error.message || fallback;
  return fallback;
}


function nowTime(locale: string) {
  return new Date().toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  // ---------------------------------------------------------------------------
  // Auth & session state
  // ---------------------------------------------------------------------------
  const [isLoading, setIsLoading] = useState(true);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [household, setHousehold] = useState<HouseholdInfo | null>(null);
  const [currentUser, setCurrentUser] = useState<UserRole>("partner_a");
  const [hasPin, setHasPin] = useState(false);
  const [partnerProfile, setPartnerProfile] = useState<PartnerProfile | null>(null);

  const householdId = household?.id ?? null;
  const isAuthenticated = Boolean(authUser);

  const [partnerAName, setPartnerAName] = useState<string>("Partner A");
  const [partnerBName, setPartnerBName] = useState<string>("Partner B");
  const [locale, setLocale] = useState<string>("en-US");
  const [timeZone, setTimeZone] = useState<string>("Asia/Jakarta");

  const [reportingCurrency, setReportingCurrency] = useState<string>("IDR");
  // Read once on the client; the formatter flag is set before the first render.
  const [hideAmounts, setHideAmounts] = useState<boolean>(() => {
    let hidden = false;
    try {
      hidden = typeof window !== "undefined" && window.localStorage.getItem(HIDE_AMOUNTS_KEY) === "1";
    } catch {
      hidden = false;
    }
    setAmountsHidden(hidden);
    return hidden;
  });
  const toggleHideAmounts = useCallback(() => {
    setHideAmounts((prev) => {
      const next = !prev;
      setAmountsHidden(next);
      try {
        window.localStorage.setItem(HIDE_AMOUNTS_KEY, next ? "1" : "0");
      } catch {
        // Storage can be unavailable (private mode); the toggle still works for this visit.
      }
      return next;
    });
  }, []);
  const reportingCurrencyTouched = useRef(false);
  const [pendingDirectChat, setPendingDirectChat] = useState<PendingDirectChat | null>(null);

  // ---------------------------------------------------------------------------
  // Household data (all loaded from the API)
  // ---------------------------------------------------------------------------
  const [wallets, setWallets] = useState<WalletState>(EMPTY_WALLETS);
  const [walletIds, setWalletIds] = useState<{ shared: string | null; mine: string | null }>({ shared: null, mine: null });
  const [contract, setContract] = useState<CoupleContract>(DEFAULT_CONTRACT);
  const [contractMeta, setContractMeta] = useState<ContractMeta>(EMPTY_CONTRACT_META);
  const [settlement, setSettlement] = useState({ partnerBOwesA: 0, partnerAOwesB: 0, currency: "IDR" });
  const [budgetSummary, setBudgetSummary] = useState<BudgetSummary | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [heldLedgerTransactions, setHeldLedgerTransactions] = useState<HeldPurchase[]>([]);
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [heldPurchaseRows, setHeldPurchaseRows] = useState<HeldPurchase[]>([]);
  const [bills, setBills] = useState<BillItem[]>([]);
  const [plans, setPlans] = useState<PlanItem[]>([]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [dataStatus, setDataStatus] = useState<{ loading: boolean; loaded: boolean; error: string | null }>({
    loading: false,
    loaded: false,
    error: null,
  });

  const [notices, setNotices] = useState<AppNotice[]>([]);
  const noticeSeq = useRef(0);

  // Chat-view session key -> backend conversation id.
  const conversationIds = useRef(new Map<string, string>());
  const walletInitAttempted = useRef(false);
  const refreshInFlight = useRef<Promise<void> | null>(null);
  const refreshRerunRequested = useRef(false);

  const heldPurchases = useMemo(
    () => [...heldPurchaseRows, ...heldLedgerTransactions],
    [heldPurchaseRows, heldLedgerTransactions]
  );

  const notify = useCallback((kind: AppNotice["kind"], message: string) => {
    const id = ++noticeSeq.current;
    setNotices((prev) => [...prev.slice(-3), { id, kind, message }]);
    setTimeout(() => setNotices((prev) => prev.filter((n) => n.id !== id)), kind === "error" ? 6500 : 4000);
  }, []);

  const dismissNotice = useCallback((id: number) => {
    setNotices((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const resetData = useCallback(() => {
    setWallets(EMPTY_WALLETS);
    setWalletIds({ shared: null, mine: null });
    setContract(DEFAULT_CONTRACT);
    setContractMeta(EMPTY_CONTRACT_META);
    setSettlement({ partnerBOwesA: 0, partnerAOwesB: 0, currency: "IDR" });
    setBudgetSummary(null);
    setTransactions([]);
    setHeldLedgerTransactions([]);
    setApprovals([]);
    setHeldPurchaseRows([]);
    setBills([]);
    setPlans([]);
    setActivities([]);
    setChatMessages([]);
    setDataStatus({ loading: false, loaded: false, error: null });
    conversationIds.current.clear();
    walletInitAttempted.current = false;
  }, []);

  // ---------------------------------------------------------------------------
  // Session
  // ---------------------------------------------------------------------------
  const applyMe = useCallback((me: api.ApiMeResponse) => {
    // The auth email is an internal placeholder (username sign-in), so never show it.
    const fullName = me.profile.full_name?.trim() || "You";
    setAuthUser({ id: me.user.id, email: me.user.email, fullName });
    setHasPin(Boolean(me.hasPin));

    if (me.profile.preferred_language === "id") {
      setLocale((prev) => (prev === "en-US" ? "id-ID" : prev));
    }

    if (me.household) {
      const role = roleFromMembership(me.household.myRole);
      setCurrentUser(role);
      setHousehold({
        id: me.household.id,
        name: me.household.name,
        baseCurrency: me.household.base_currency || "IDR",
        country: me.household.country ?? null,
      });
      if (!reportingCurrencyTouched.current) {
        setReportingCurrency(me.household.base_currency || "IDR");
      }

      const partner = me.household.partner;
      setPartnerProfile(partner ? { userId: partner.userId, fullName: partner.fullName || "Partner" } : null);

      // Before the partner joins, show "your partner" instead of the "Partner A/B"
      // placeholder, but keep a name the user typed when inviting.
      const partnerLabel = (prev: string, placeholder: string) =>
        partner?.fullName || (prev === placeholder ? "your partner" : prev);
      if (role === "partner_a") {
        setPartnerAName(fullName);
        setPartnerBName((prev) => partnerLabel(prev, "Partner B"));
      } else {
        setPartnerBName(fullName);
        setPartnerAName((prev) => partnerLabel(prev, "Partner A"));
      }
    } else {
      setHousehold(null);
      setPartnerProfile(null);
      setCurrentUser("partner_a");
      setPartnerAName(fullName);
    }
  }, []);

  const clearSession = useCallback(() => {
    setAuthUser(null);
    setHousehold(null);
    setPartnerProfile(null);
    setHasPin(false);
    setCurrentUser("partner_a");
    setPartnerAName("Partner A");
    setPartnerBName("Partner B");
    reportingCurrencyTouched.current = false;
    resetData();
  }, [resetData]);

  const refreshSession = useCallback(async (): Promise<api.ApiMeResponse | null> => {
    try {
      const me = await api.apiGetMe();
      if (!me) {
        clearSession();
        return null;
      }
      applyMe(me);
      return me;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        clearSession();
      } else if (error instanceof ApiError && error.code === "PROFILE_NOT_FOUND") {
        clearSession();
        notify("error", error.message);
      } else {
        // Keep the previous session on transient failures.
        console.warn("[store] session refresh failed:", error);
      }
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [applyMe, clearSession, notify]);

  const signOut = useCallback(async () => {
    try {
      await api.apiSignOut();
    } catch (error) {
      // A 401 means the session is already gone, which is the goal anyway.
      if (!(error instanceof ApiError && error.status === 401)) {
        notify("error", errorMessage(error, "Unable to sign out."));
        return;
      }
    }
    clearSession();
  }, [clearSession, notify]);

  // ---------------------------------------------------------------------------
  // Data loading
  // ---------------------------------------------------------------------------
  const transformContext = useCallback(
    (ids: { shared: string | null; mine: string | null }): TransformContext => ({
      myUserId: authUser?.id ?? null,
      myRole: currentUser,
      locale,
      sharedWalletId: ids.shared,
      myPersonalWalletId: ids.mine,
    }),
    [authUser?.id, currentUser, locale]
  );


  const loadHouseholdData = useCallback(
    async (hid: string) => {
      setDataStatus((prev) => ({ ...prev, loading: true }));
      const baseCurrency = household?.baseCurrency ?? "IDR";

      const [
        walletsRes,
        txRes,
        billsRes,
        approvalsRes,
        plansRes,
        activitiesRes,
        heldRes,
        settlementRes,
        rulesRes,
        budgetsRes,
      ] = await Promise.allSettled([
        api.apiGetWallets(hid),
        api.apiGetTransactions(hid, 100),
        api.apiGetBills(hid),
        api.apiGetApprovals(hid),
        api.apiGetPlans(hid),
        api.apiGetActivities(),
        api.apiGetWaitingList(),
        api.apiGetSettlement(),
        api.apiGetFinanceRules(hid),
        api.apiGetBudgets(hid),
      ]);

      const errors: string[] = [];
      const collect = (res: PromiseSettledResult<unknown>) => {
        if (res.status === "rejected") errors.push(errorMessage(res.reason));
      };
      [walletsRes, txRes, billsRes, approvalsRes, plansRes, activitiesRes, heldRes, settlementRes, rulesRes, budgetsRes].forEach(collect);

      let ids = walletIds;
      if (walletsRes.status === "fulfilled") {
        const result = transformWallets(walletsRes.value.wallets, { myUserId: authUser?.id ?? null, myRole: currentUser }, baseCurrency);
        setWallets(result.wallets);
        ids = { shared: result.sharedWalletId, mine: result.myPersonalWalletId };
        setWalletIds(ids);
      }
      const ctx = transformContext(ids);

      let mappedApprovals: ApprovalRequest[] = approvals;
      if (approvalsRes.status === "fulfilled") {
        mappedApprovals = approvalsRes.value.approvals.map(transformApproval);
        setApprovals(mappedApprovals);
      }

      if (txRes.status === "fulfilled") {
        const rows = txRes.value.transactions;
        setTransactions(rows.filter((t) => t.status === "executed").map((t) => transformTransaction(t, ctx)));
        setHeldLedgerTransactions(
          rows
            .filter((t) => t.status === "on_hold")
            .map((t) => {
              const tx = transformTransaction(t, ctx);
              return {
                id: `${HELD_TX_PREFIX}${t.id}`,
                title: tx.title,
                amount: Math.abs(tx.amount),
                currency: tx.currency,
                wallet: tx.wallet,
                requester: tx.paidBy,
                status: "held" as const,
                holdUntil: t.hold_until ? formatRelativeDate(t.hold_until, locale) : "Cooling-off period",
                holdUntilAt: t.hold_until ?? undefined,
                reason: "Cooling-off safeguard from your couple contract. Confirm after the hold ends to execute it.",
                createdAt: t.created_at,
              };
            })
        );
      }

      if (billsRes.status === "fulfilled") {
        const billRows = billsRes.value.bills;
        setBills(withBillIncreaseAnomalies(billRows, billRows.map((b) => transformBill(b, ctx))));
      }
      if (plansRes.status === "fulfilled") {
        setPlans(plansRes.value.plans.map(transformPlan));
      }
      if (activitiesRes.status === "fulfilled") {
        setActivities(activitiesRes.value.activities.map((a) => transformActivity(a, locale)));
      }
      if (heldRes.status === "fulfilled") {
        setHeldPurchaseRows(heldRes.value.heldPurchases.map((h) => transformHeldPurchase(h, locale)));
      }
      if (settlementRes.status === "fulfilled") {
        const s = settlementRes.value.settlement;
        setSettlement({
          partnerBOwesA: Number(s.partnerBOwesA) || 0,
          partnerAOwesB: Number(s.partnerAOwesB) || 0,
          currency: s.currency || baseCurrency,
        });
      }

      if (budgetsRes.status === "fulfilled") {
        const today = new Date().toISOString().slice(0, 10);
        const current = (budgetsRes.value.budgets ?? []).filter((b) => b.period_start <= today && b.period_end >= today);
        if (current.length === 0) {
          setBudgetSummary(null);
        } else {
          const amount = current.reduce((sum, b) => sum + convertAmount(Number(b.amount), b.currency, baseCurrency), 0);
          const spent = current.reduce((sum, b) => sum + convertAmount(Number(b.spent), b.currency, baseCurrency), 0);
          const periodEnd = current.reduce((max, b) => (b.period_end > max ? b.period_end : max), current[0].period_end);
          setBudgetSummary({
            amount: round2(amount),
            spent: round2(spent),
            currency: baseCurrency,
            usagePercent: amount > 0 ? Math.round((spent / amount) * 1000) / 10 : 0,
            daysRemaining: Math.max(0, Math.ceil((new Date(`${periodEnd}T23:59:59`).getTime() - Date.now()) / 86_400_000)),
          });
        }
      }

      let hasActiveRule = contractMeta.hasActiveRule;
      const rulesData = rulesRes.status === "fulfilled" ? rulesRes.value : null;

      if (rulesData) {
        const parsed = contractFromRules(rulesData.rules, rulesData.approvals, {
          myUserId: authUser?.id ?? null,
          myRole: currentUser,
          currency: baseCurrency,
        });
        setContract(parsed.contract);
        setContractMeta({
          pendingRuleId: parsed.pendingRuleId,
          pendingNeedsMyApproval: parsed.pendingNeedsMyApproval,
          hasActiveRule: parsed.hasActiveRule,
        });
        hasActiveRule = parsed.hasActiveRule;
      }

      // Wallets can only be provisioned once both partners ratified the agreement.
      if (hasActiveRule && partnerProfile && !ids.shared && !walletInitAttempted.current) {
        walletInitAttempted.current = true;
        try {
          await api.apiInitializeWallets(hid);
          const fresh = await api.apiGetWallets(hid);
          const result = transformWallets(fresh.wallets, { myUserId: authUser?.id ?? null, myRole: currentUser }, baseCurrency);
          setWallets(result.wallets);
          setWalletIds({ shared: result.sharedWalletId, mine: result.myPersonalWalletId });
        } catch (error) {
          console.warn("[store] wallet initialization failed:", error);
        }
      }

      const allFailed = errors.length === 10;
      setDataStatus({
        loading: false,
        loaded: true,
        error: allFailed ? errors[0] : errors.length ? `Some data could not be loaded: ${errors[0]}` : null,
      });
    },
    [
      household?.baseCurrency,
      walletIds,
      authUser,
      currentUser,
      transformContext,
      approvals,
      locale,
      contractMeta.hasActiveRule,
      partnerProfile,
    ]
  );

  const loadRef = useRef(loadHouseholdData);
  useEffect(() => {
    loadRef.current = loadHouseholdData;
  }, [loadHouseholdData]);

  const refreshData = useCallback(async () => {
    if (!householdId) return;
    // A refresh requested while one is running (e.g. right after a mutation)
    // must not reuse the older, possibly stale load: queue one more pass.
    if (refreshInFlight.current) {
      refreshRerunRequested.current = true;
      return refreshInFlight.current;
    }
    const run = (async () => {
      do {
        refreshRerunRequested.current = false;
        await loadRef.current(householdId);
      } while (refreshRerunRequested.current);
    })().finally(() => {
      refreshInFlight.current = null;
    });
    refreshInFlight.current = run;
    return run;
  }, [householdId]);

  // Wallets can only be provisioned once the agreement is active; do it as
  // soon as a signature activates it rather than waiting for the next poll.
  const ensureWallets = async (hid: string) => {
    try {
      await api.apiInitializeWallets(hid);
      walletInitAttempted.current = true;
    } catch (error) {
      console.warn("[store] wallet initialization failed:", error);
    }
  };

  // Initial session check.
  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  // Load household data whenever the active household (or partner) changes.
  useEffect(() => {
    if (householdId && authUser) {
      void refreshData();
    }
  }, [householdId, authUser?.id, partnerProfile?.userId, refreshData]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep both partners in sync: poll for partner actions and refresh on focus.
  useEffect(() => {
    if (!authUser) return;
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      if (!householdId || !partnerProfile) void refreshSession();
      if (householdId) void refreshData();
    };
    const interval = setInterval(tick, POLL_INTERVAL_MS);
    window.addEventListener("focus", tick);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", tick);
    };
  }, [authUser, householdId, partnerProfile, refreshSession, refreshData]);

  // ---------------------------------------------------------------------------
  // Derived values
  // ---------------------------------------------------------------------------
  const convertedBalances = useMemo(() => {
    const convA = convertMoney(wallets.personalA.balance, wallets.personalA.currency, reportingCurrency);
    const convB = convertMoney(wallets.personalB.balance, wallets.personalB.currency, reportingCurrency);
    const convShared = convertMoney(wallets.shared.balance, wallets.shared.currency, reportingCurrency);

    const allAvailable = convA.available && convB.available && convShared.available;
    const total = allAvailable ? convA.convertedAmount + convB.convertedAmount + convShared.convertedAmount : 0;

    return {
      personalA: { amount: convA.convertedAmount, available: convA.available, isEstimate: convA.isEstimate },
      personalB: { amount: convB.convertedAmount, available: convB.available, isEstimate: convB.isEstimate },
      shared: { amount: convShared.convertedAmount, available: convShared.available, isEstimate: convShared.isEstimate },
      totalCombined: { amount: total, available: allAvailable, isIncomplete: !allAvailable },
    };
  }, [wallets, reportingCurrency]);

  const monthlySummary = useMemo(() => {
    const currency = household?.baseCurrency ?? reportingCurrency;
    // No clock reads while there is nothing to sum (this also keeps prerendering deterministic).
    if (transactions.length === 0) return { income: 0, expenses: 0, currency };
    const now = new Date();
    let income = 0;
    let expenses = 0;
    for (const tx of transactions) {
      const at = new Date(tx.timestamp);
      if (at.getFullYear() !== now.getFullYear() || at.getMonth() !== now.getMonth()) continue;
      const value = convertAmount(Math.abs(tx.amount), tx.currency, currency);
      if (tx.amount >= 0) income += value;
      else expenses += value;
    }
    return { income: round2(income), expenses: round2(expenses), currency };
  }, [transactions, household?.baseCurrency, reportingCurrency]);

  const walletsReady = Boolean(walletIds.shared || walletIds.mine);

  // ---------------------------------------------------------------------------
  // Action helpers
  // ---------------------------------------------------------------------------
  const requireHousehold = () => {
    if (!householdId) {
      throw new ApiError("Create or join your shared space first.", 400);
    }
    return householdId;
  };

  const walletIdFor = (wallet: Transaction["wallet"]) => {
    if (wallet === "shared") {
      if (!walletIds.shared) {
        throw new ApiError("Your shared wallet is not active yet. Both partners must ratify the couple contract first.", 409);
      }
      return walletIds.shared;
    }
    const owner: UserRole = wallet === "personal_a" ? "partner_a" : "partner_b";
    if (owner !== currentUser) {
      throw new ApiError("You can only record transactions on your own personal wallet.", 403);
    }
    if (!walletIds.mine) {
      throw new ApiError("Your personal wallet is not active yet.", 409);
    }
    return walletIds.mine;
  };

  const verifySecurityPin: AppContextType["verifySecurityPin"] = async (pin) => {
    try {
      if (!hasPin) {
        await api.apiSetupPin(pin);
        setHasPin(true);
        notify("info", "Your 6-digit security PIN has been saved for future approvals.");
        return null;
      }
      await api.apiVerifyPin(pin);
      return null;
    } catch (error) {
      return errorMessage(error, "Invalid security PIN.");
    }
  };

  const processGatewayDecision: AppContextType["processGatewayDecision"] = async (request) => {
    try {
      const { decision } = await api.apiGatewayDecision({
        ...request,
        timeOfDay: request.timeOfDay ?? nowTime("en-GB"),
      });
      return { outcome: decision.outcome, reason: decision.reason, details: decision.details };
    } catch (error) {
      return { outcome: "DENY", reason: errorMessage(error, "Unable to evaluate this action right now.") };
    }
  };

  const recordTransaction: AppContextType["recordTransaction"] = async (tx) => {
    try {
      const hid = requireHousehold();
      const res = await api.apiCreateTransaction(hid, {
        walletId: walletIdFor(tx.wallet),
        transactionType: tx.amount >= 0 ? "income" : "expense",
        amount: round2(Math.abs(tx.amount)),
        description: tx.title,
        category: tx.category,
      });
      if (res.transaction?.status && res.transaction.status !== "executed") {
        notify("info", res.message);
      }
      await refreshData();
      return res.transaction ? transformTransaction(res.transaction, transformContext(walletIds)) : null;
    } catch (error) {
      notify("error", errorMessage(error, "Unable to record transaction."));
      return null;
    }
  };

  const [addMoneyRequest, setAddMoneyRequest] = useState<{ wallet: AddMoneyWallet; id: number } | null>(null);
  const openAddMoney: AppContextType["openAddMoney"] = (wallet = "shared") => setAddMoneyRequest({ wallet, id: Date.now() });
  const closeAddMoney: AppContextType["closeAddMoney"] = () => setAddMoneyRequest(null);

  const addMoney: AppContextType["addMoney"] = async (wallet, amount, note) => {
    try {
      const hid = requireHousehold();
      const walletId = wallet === "shared" ? walletIds.shared : walletIds.mine;
      if (!walletId) {
        throw new ApiError("Your wallets open after you and your partner agree on Seiya's Promise.", 409);
      }
      await api.apiCreateTransaction(hid, {
        walletId,
        transactionType: "income",
        amount: round2(amount),
        description: note.trim().slice(0, 250) || "Money added",
        category: "Income",
      });
      notify("success", "Money added.");
      await refreshData();
      return true;
    } catch (error) {
      notify("error", errorMessage(error, "Unable to add money right now."));
      return false;
    }
  };

  const undoTransaction: AppContextType["undoTransaction"] = async (txId) => {
    try {
      await api.apiUndoTransaction(txId);
      notify("success", "Transaction undone.");
      await refreshData();
      return true;
    } catch (error) {
      notify("error", errorMessage(error, "Unable to undo transaction."));
      return false;
    }
  };

  const approveApprovalRequest: AppContextType["approveApprovalRequest"] = async (approvalId, pin) => {
    const item = approvals.find((a) => a.id === approvalId);
    if (!item) return { ok: false, message: "This request no longer exists." };
    if (item.requester === currentUser) {
      return { ok: false, message: "Dual-Key Security Rule: A requester cannot approve their own financial request." };
    }

    try {
      // First approval with a PIN doubles as PIN setup for accounts without one.
      if (pin && !hasPin) {
        await api.apiSetupPin(pin);
        setHasPin(true);
        notify("info", "Your 6-digit security PIN has been saved for future approvals.");
      }

      // Optimistic update; refreshData below reconciles with the server.
      setApprovals((prev) => prev.map((a) => (a.id === approvalId ? { ...a, status: "approved" } : a)));

      // The backend executes the linked expense/bill/plan action atomically.
      await api.apiDecideApproval(approvalId, "approved", pin);
      await refreshData();
      return { ok: true };
    } catch (error) {
      setApprovals((prev) => prev.map((a) => (a.id === approvalId ? { ...a, status: item.status } : a)));
      return { ok: false, message: errorMessage(error, "Unable to approve this request.") };
    }
  };

  const cancelApprovalRequest: AppContextType["cancelApprovalRequest"] = async (approvalId) => {
    try {
      await api.apiCancelApproval(approvalId);
      notify("success", "Request cancelled.");
      await refreshData();
      return true;
    } catch (error) {
      notify("error", errorMessage(error, "Unable to cancel this request."));
      return false;
    }
  };

  const declineApprovalRequest: AppContextType["declineApprovalRequest"] = async (approvalId, reason) => {
    const item = approvals.find((a) => a.id === approvalId);
    if (!item) return false;

    setApprovals((prev) => prev.map((a) => (a.id === approvalId ? { ...a, status: "declined" } : a)));
    try {
      await api.apiDecideApproval(approvalId, "declined", undefined, reason);
      await refreshData();
      return true;
    } catch (error) {
      setApprovals((prev) => prev.map((a) => (a.id === approvalId ? { ...a, status: item.status } : a)));
      notify("error", errorMessage(error, "Unable to decline this request."));
      return false;
    }
  };

  const approveRequest = async (approvalId: string) => {
    const result = await approveApprovalRequest(approvalId);
    if (!result.ok && result.message) notify("error", result.message);
  };

  const declineRequest = async (approvalId: string) => {
    await declineApprovalRequest(approvalId);
  };

  const continueHeldPurchase: AppContextType["continueHeldPurchase"] = async (heldId) => {
    try {
      if (heldId.startsWith(HELD_TX_PREFIX)) {
        const res = await api.apiExecuteHeldTransaction(heldId.slice(HELD_TX_PREFIX.length));
        notify("success", res.message || "Held transaction processed.");
        await refreshData();
        return;
      }

      // continue_held_purchase records the ledger entry (or routes it to approval) atomically.
      const res = await api.apiContinueHeldPurchase(heldId);
      notify(
        res.outcome === "ALLOW" ? "success" : "info",
        res.message || (res.outcome === "ALLOW" ? "Purchase confirmed." : "Held purchase routed to partner approval.")
      );
      await refreshData();
    } catch (error) {
      notify("error", errorMessage(error, "Unable to continue this purchase."));
    }
  };

  const cancelHeldPurchase: AppContextType["cancelHeldPurchase"] = async (heldId) => {
    if (heldId.startsWith(HELD_TX_PREFIX)) {
      notify("error", "This purchase is already reserved in the ledger and can only be executed after the cooling-off period.");
      return;
    }
    const previous = heldPurchaseRows;
    setHeldPurchaseRows((prev) => prev.filter((h) => h.id !== heldId));
    try {
      await api.apiCancelHeldPurchase(heldId);
      await refreshData();
    } catch (error) {
      setHeldPurchaseRows(previous);
      notify("error", errorMessage(error, "Unable to cancel this purchase."));
    }
  };

  const proposeContractChange: AppContextType["proposeContractChange"] = async (
    newThreshold,
    _thresholdCurrency,
    newSplitB,
    newSplitA,
    approveEveryShared
  ) => {
    try {
      const hid = requireHousehold();
      await api.apiProposeFinanceRules(
        hid,
        rulesFromContract({
          splitPartnerA: newSplitA,
          splitPartnerB: newSplitB,
          approvalThreshold: newThreshold,
          approveEverySharedPurchase: approveEveryShared,
          coolingOffEnabled: contract.coolingOffEnabled,
          cooldownThreshold: contract.cooldownThreshold,
        })
      );
      notify("success", "Contract amendment sent to your partner for signature.");
      await refreshData();
      return true;
    } catch (error) {
      notify("error", errorMessage(error, "Unable to propose contract change."));
      return false;
    }
  };

  const approveContractChange: AppContextType["approveContractChange"] = async () => {
    try {
      const hid = requireHousehold();
      if (!contractMeta.pendingRuleId) return false;
      if (contract.proposedChange?.proposedBy === currentUser) {
        notify("error", "A partner cannot approve their own contract proposal.");
        return false;
      }
      await api.apiDecideFinanceRule(hid, contractMeta.pendingRuleId, "approved");
      notify("success", "Contract amendment signed.");
      await ensureWallets(hid);
      await refreshData();
      return true;
    } catch (error) {
      notify("error", errorMessage(error, "Unable to sign the contract amendment."));
      return false;
    }
  };

  const activateInitialContract: AppContextType["activateInitialContract"] = async (params) => {
    try {
      const hid = requireHousehold();
      if (!partnerProfile) {
        const me = await refreshSession();
        if (!me?.household?.partner) return "awaiting_partner_join";
      }

      const { rules, approvals: ruleApprovals } = await api.apiGetFinanceRules(hid);
      const pending = rules.find((r) => r.status === "pending_approval");
      const active = rules.find((r) => r.status === "active");

      if (pending) {
        const mine = ruleApprovals.find((a) => a.rule_id === pending.id && a.user_id === authUser?.id);
        if (!mine || mine.decision === "pending") {
          await api.apiDecideFinanceRule(hid, pending.id, "approved");
        }
      } else if (!active) {
        await api.apiProposeFinanceRules(
          hid,
          rulesFromContract({
            splitPartnerA: params.splitPartnerA,
            splitPartnerB: params.splitPartnerB,
            approvalThreshold: params.approvalThreshold,
            approveEverySharedPurchase: params.approveEverySharedPurchase,
            coolingOffEnabled: params.coolingOffEnabled,
            walletMode: params.walletMode,
          })
        );
      }

      const after = await api.apiGetFinanceRules(hid);
      const isActive = after.rules.some((r) => r.status === "active");
      if (isActive) await ensureWallets(hid);
      await refreshData();
      return isActive ? "active" : "pending_partner";
    } catch (error) {
      notify("error", errorMessage(error, "Unable to sign the couple contract."));
      return "error";
    }
  };

  const payBill: AppContextType["payBill"] = async (billId) => {
    try {
      const hid = requireHousehold();
      const res = await api.apiPayBill(hid, billId, walletIdFor("shared"));
      notify("success", res.message);
      await refreshData();
    } catch (error) {
      notify("error", errorMessage(error, "Unable to pay this bill."));
    }
  };

  const settleUp: AppContextType["settleUp"] = async () => {
    try {
      const res = await api.apiSettleUp();
      setSettlement(res.settlement);
      notify("success", "Shared expense ledger settled.");
      await refreshData();
    } catch (error) {
      notify("error", errorMessage(error, "Unable to settle up."));
    }
  };

  const addBill: AppContextType["addBill"] = async (bill) => {
    try {
      const hid = requireHousehold();
      await api.apiCreateBill(hid, {
        title: bill.title,
        payee: bill.category || null,
        amount: round2(bill.amount),
        currency: bill.currency,
        dueDate: toIsoDate(bill.dueDate),
        recurrence: bill.isRecurring ? "monthly" : "none",
        notes: bill.notes || null,
      });
      await refreshData();
      return true;
    } catch (error) {
      notify("error", errorMessage(error, "Unable to add this bill."));
      return false;
    }
  };

  const editBill: AppContextType["editBill"] = async (billId, updated) => {
    try {
      const hid = requireHousehold();
      await api.apiUpdateBill(hid, billId, {
        ...(updated.title !== undefined ? { title: updated.title } : {}),
        ...(updated.category !== undefined ? { payee: updated.category || null } : {}),
        ...(updated.amount !== undefined ? { amount: round2(updated.amount) } : {}),
        ...(updated.currency !== undefined ? { currency: updated.currency } : {}),
        ...(updated.dueDate !== undefined ? { dueDate: toIsoDate(updated.dueDate) } : {}),
        ...(updated.isRecurring !== undefined ? { recurrence: updated.isRecurring ? ("monthly" as const) : ("none" as const) } : {}),
        ...(updated.notes !== undefined ? { notes: updated.notes || null } : {}),
        ...(updated.status !== undefined ? { status: updated.status } : {}),
      });
      await refreshData();
      return true;
    } catch (error) {
      notify("error", errorMessage(error, "Unable to update this bill."));
      return false;
    }
  };

  const deleteBill: AppContextType["deleteBill"] = async (billId) => {
    const previous = bills;
    setBills((prev) => prev.filter((b) => b.id !== billId));
    try {
      await api.apiDeleteBill(requireHousehold(), billId);
      await refreshData();
      return true;
    } catch (error) {
      setBills(previous);
      notify("error", errorMessage(error, "Unable to delete this bill."));
      return false;
    }
  };

  const requestPayBill: AppContextType["requestPayBill"] = async (billId) => {
    try {
      await api.apiRequestPayBill(requireHousehold(), billId);
      notify("success", "Payment confirmation requested from your partner.");
      await refreshData();
      return true;
    } catch (error) {
      notify("error", errorMessage(error, "Unable to request payment confirmation."));
      return false;
    }
  };

  const toPlanInput = (plan: Partial<PlanItem>): Partial<api.PlanInput> => ({
    ...(plan.title !== undefined ? { title: plan.title } : {}),
    ...(plan.category !== undefined ? { category: plan.category } : {}),
    ...(plan.targetAmount !== undefined ? { targetAmount: round2(plan.targetAmount) } : {}),
    ...(plan.currentAmount !== undefined ? { currentAmount: round2(plan.currentAmount) } : {}),
    ...(plan.currency !== undefined ? { currency: plan.currency } : {}),
    ...(plan.targetDate !== undefined ? { targetDate: plan.targetDate.slice(0, 100) } : {}),
    ...(plan.recommendedMonthly !== undefined ? { recommendedMonthly: round2(plan.recommendedMonthly) } : {}),
    ...(plan.splitRecommendation !== undefined
      ? {
          splitRecommendation: {
            partnerA: round2(plan.splitRecommendation.partnerA),
            partnerB: round2(plan.splitRecommendation.partnerB),
          },
        }
      : {}),
    ...(plan.walletFunding !== undefined ? { walletFunding: plan.walletFunding } : {}),
    ...(plan.status !== undefined ? { status: plan.status } : {}),
    ...(plan.assumptions !== undefined ? { assumptions: plan.assumptions ? plan.assumptions.slice(0, 1000) : null } : {}),
  });

  const addPlan: AppContextType["addPlan"] = async (newPlan) => {
    try {
      const hid = requireHousehold();
      const res = await api.apiCreatePlan(hid, toPlanInput(newPlan) as api.PlanInput);
      const plan = transformPlan(res.plan);
      setPlans((prev) => [plan, ...prev.filter((p) => p.id !== plan.id)]);
      void refreshData();
      return plan;
    } catch (error) {
      notify("error", errorMessage(error, "Unable to create this goal."));
      return null;
    }
  };

  const updatePlan: AppContextType["updatePlan"] = async (planId, updated) => {
    const previous = plans;
    setPlans((prev) => prev.map((p) => (p.id === planId ? { ...p, ...updated } : p)));
    try {
      await api.apiUpdatePlan(requireHousehold(), planId, toPlanInput(updated));
      await refreshData();
      return true;
    } catch (error) {
      setPlans(previous);
      notify("error", errorMessage(error, "Unable to update this goal."));
      return false;
    }
  };

  const requestDeletePlan: AppContextType["requestDeletePlan"] = async (planId, partnerAPin, partnerBPin) => {
    try {
      const hid = requireHousehold();
      // The server cannot read the partner's PIN hash, so verify our own PIN here
      // before submitting an in-person dual-PIN dissolution.
      if (partnerAPin && partnerBPin && hasPin) {
        const myPin = currentUser === "partner_a" ? partnerAPin : partnerBPin;
        try {
          await api.apiVerifyPin(myPin);
        } catch {
          return { success: false, message: "Your security PIN is incorrect." };
        }
      }
      const res = await api.apiRequestDeletePlan(hid, planId, partnerAPin, partnerBPin);
      await refreshData();
      return { success: true, requiresApproval: res.requiresApproval, message: res.message };
    } catch (error) {
      return { success: false, message: errorMessage(error, "Unable to process the goal deletion.") };
    }
  };

  const proposeExpense: AppContextType["proposeExpense"] = async (params) => {
    const hid = requireHousehold();
    const amount = round2(params.amount);

    const decision = await processGatewayDecision({
      actionType: "EXPENSE",
      title: params.title,
      amount,
      currency: params.currency,
      wallet: params.wallet,
      category: params.category,
    });

    if (decision.outcome === "DENY") {
      throw new ApiError(decision.reason, 403);
    }

    if (decision.outcome === "HOLD") {
      const res = await api.apiCreateHeldPurchase({
        title: params.title,
        amount,
        currency: params.currency,
        wallet: params.wallet,
        requesterRole: currentUser,
        reason: decision.reason,
      });
      await refreshData();
      return { outcome: "HOLD", id: res.heldPurchase.id, reason: decision.reason };
    }

    // ALLOW and NEED_APPROVAL both go through the transaction engine, which
    // re-applies the couple rules atomically and reserves the balance.
    const res = await api.apiCreateTransaction(hid, {
      walletId: walletIdFor(params.wallet),
      transactionType: "expense",
      amount,
      description: params.title,
      category: params.category,
    });
    const tx = res.transaction;
    const status = tx?.status;

    if (status === "pending_approval" && tx) {
      const reason = params.notes ? `${params.notes} • ${decision.reason}` : decision.reason;
      // The transaction engine already queued the partner approval; attach the
      // proposer's notes to it so the partner sees the context.
      if (res.approval_id) {
        if (params.notes) {
          try {
            await api.apiSetApprovalNotes(res.approval_id, params.notes.slice(0, 1000));
          } catch (error) {
            // The request itself went through; only the context is missing.
            console.warn("[store] attaching expense notes failed:", error);
          }
        }
        await refreshData();
        return { outcome: "NEED_APPROVAL", id: res.approval_id, reason };
      }
      const approval = await api.apiCreateApproval({
        title: `Expense: ${params.title}`,
        amount,
        currency: tx.currency || params.currency,
        wallet: params.wallet,
        requesterRole: currentUser,
        approverRole: otherRole(currentUser),
        category: "Expenses",
        type: "EXPENSE",
        targetId: tx.id,
        notes: params.notes || null,
        reason,
        expiresInHours: 48,
      });
      await refreshData();
      return { outcome: "NEED_APPROVAL", id: approval.approval.id, reason };
    }

    await refreshData();
    if (status === "on_hold" && tx) {
      return { outcome: "HOLD", id: `${HELD_TX_PREFIX}${tx.id}`, reason: res.message };
    }
    return { outcome: "ALLOW", id: tx?.id ?? "", reason: res.message || "Expense recorded directly." };
  };

  // ---------------------------------------------------------------------------
  // AI chat
  // ---------------------------------------------------------------------------
  const normalizeCardData = (data: Record<string, unknown> | undefined) => {
    if (!data) return undefined;
    const out: Record<string, unknown> = { ...data };
    for (const key of ["amount", "targetAmount", "monthlyTarget", "currentAmount"]) {
      if (typeof out[key] === "string" && out[key] !== "" && Number.isFinite(Number(out[key]))) {
        out[key] = Number(out[key]);
      }
    }
    if (typeof out.holdUntil === "string" && !Number.isNaN(new Date(out.holdUntil).getTime())) {
      out.holdUntil = formatRelativeDate(out.holdUntil, locale);
    }
    return out;
  };

  const sendChatMessage: AppContextType["sendChatMessage"] = async (text, options) => {
    const sessionKey = options?.sessionKey ?? "default";
    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      sender: "user",
      userRole: currentUser,
      text,
      timestamp: nowTime(locale),
    };
    setChatMessages((prev) => [...prev, userMsg]);

    let reply: ChatMessage;
    if (!householdId) {
      reply = {
        id: `msg-${Date.now() + 1}`,
        sender: "seiya",
        text: "Let's finish setting up your shared space first. Once you and your partner are connected, I can help with expenses, bills, and goals.",
        timestamp: nowTime(locale),
      };
    } else {
      try {
        const existingId = conversationIds.current.get(sessionKey);
        const res = await api.apiSendChat(householdId, text, existingId);
        if (res.conversationId) conversationIds.current.set(sessionKey, res.conversationId);
        // Chats started in "Shared with your partner" mode are saved as shared.
        if (options?.shared && !existingId && res.conversationId) {
          void api.apiUpdateConversation(householdId, res.conversationId, { visibility: "shared" }).catch((error) => {
            console.warn("[chat] could not share the new chat:", error);
          });
        }
        if (res.warning) console.warn("[chat]", res.warning);

        reply = {
          id: `msg-${Date.now() + 1}`,
          sender: "seiya",
          text: res.message,
          timestamp: nowTime(locale),
          ...(res.cardType ? { cardType: res.cardType as ChatMessage["cardType"] } : {}),
          ...(res.cardData ? { cardData: normalizeCardData(res.cardData) } : {}),
        };

        // A tool call (e.g. record_expense) may have changed household data.
        if (res.cardType) void refreshData();
      } catch (error) {
        reply = {
          id: `msg-${Date.now() + 1}`,
          sender: "seiya",
          text: errorMessage(error, "Seiya is temporarily unavailable. Please try again in a moment."),
          timestamp: nowTime(locale),
        };
      }
    }

    setChatMessages((prev) => [...prev, reply]);
    return reply;
  };

  // Chat history comes through our API (same RLS: the caller's private
  // conversations and shared household ones), so the browser only ever talks
  // to our own domain, which matters for users in mainland China.
  const loadChatHistory: AppContextType["loadChatHistory"] = async () => {
    if (!householdId || !authUser) return [];
    try {
      const { conversations, messages } = await api.apiGetChatHistory(householdId);
      if (!conversations.length) return [];

      return conversations.map((c) => {
        const convMessages: ChatMessage[] = (messages ?? [])
          .filter((m) => m.conversation_id === c.id)
          .map((m) => ({
            id: m.id,
            sender: m.role === "user" ? ("user" as const) : ("seiya" as const),
            userRole: m.role === "user" ? currentUser : undefined,
            text: m.content,
            timestamp: new Date(m.created_at).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }),
          }));
        const firstUser = convMessages.find((m) => m.sender === "user")?.text ?? "Conversation";
        const creatorRole: UserRole = c.user_id === authUser.id ? currentUser : currentUser === "partner_a" ? "partner_b" : "partner_a";
        conversationIds.current.set(`history-${c.id}`, c.id);
        return {
          conversationId: c.id,
          title: c.title || (firstUser.length > 32 ? `${firstUser.slice(0, 32)}...` : firstUser),
          updatedAt: c.updated_at || c.created_at,
          messages: convMessages.map((m) => (m.sender === "user" ? { ...m, userRole: creatorRole } : m)),
          isShared: c.visibility === "shared",
          creatorRole,
        };
      });
    } catch (error) {
      console.warn("[store] chat history unavailable:", error);
      return [];
    }
  };

  const updateConversation: AppContextType["updateConversation"] = async (sessionKey, changes) => {
    const conversationId = conversationIds.current.get(sessionKey);
    if (!conversationId || !householdId) return true; // not saved on the server yet
    try {
      await api.apiUpdateConversation(householdId, conversationId, {
        ...(changes.title !== undefined ? { title: changes.title } : {}),
        ...(changes.shared !== undefined ? { visibility: changes.shared ? "shared" : "private" } : {}),
      });
      return true;
    } catch (error) {
      notify("error", errorMessage(error, "Unable to save this chat change."));
      return false;
    }
  };

  const deleteConversation: AppContextType["deleteConversation"] = async (sessionKey) => {
    const conversationId = conversationIds.current.get(sessionKey);
    if (!conversationId || !householdId) return true;
    try {
      await api.apiDeleteConversation(householdId, conversationId);
      conversationIds.current.delete(sessionKey);
      return true;
    } catch (error) {
      notify("error", errorMessage(error, "Unable to delete this chat."));
      return false;
    }
  };

  const unreadNotificationsCount =
    approvals.filter((a) => a.status === "pending" && a.approver === currentUser).length +
    heldPurchases.filter((h) => h.status === "held").length +
    bills.filter((b) => b.status !== "paid" && b.daysRemaining <= 3).length;

  return (
    <AppContext.Provider
      value={{
        isAuthenticated,
        isLoading,
        authUser,
        householdId,
        household,
        myRole: currentUser,
        hasPin,
        partnerProfile,
        refreshSession,
        refreshData,
        signOut,
        verifySecurityPin,
        dataStatus,
        notices,
        notify,
        dismissNotice,
        currentUser,
        partnerAName,
        partnerBName,
        setPartnerNames: (a, b) => {
          setPartnerAName(a);
          setPartnerBName(b);
        },
        locale,
        setLocale,
        timeZone,
        setTimeZone,
        reportingCurrency,
        hideAmounts,
        toggleHideAmounts,
        setReportingCurrency: (currency) => {
          reportingCurrencyTouched.current = true;
          setReportingCurrency(currency);
        },
        wallets,
        walletsReady,
        convertedBalances,
        monthlySummary,
        contract,
        contractMeta,
        budgetSummary,
        transactions,
        approvals,
        heldPurchases,
        bills,
        plans,
        activities,
        chatMessages,
        settlement,
        unreadNotificationsCount,
        processGatewayDecision,
        approveRequest,
        declineRequest,
        continueHeldPurchase,
        cancelHeldPurchase,
        recordTransaction,
        addMoney,
        addMoneyRequest,
        openAddMoney,
        closeAddMoney,
        undoTransaction,
        proposeContractChange,
        approveContractChange,
        activateInitialContract,
        sendChatMessage,
        loadChatHistory,
        updateConversation,
        deleteConversation,
        payBill,
        settleUp,
        addPlan,
        updatePlan,
        addBill,
        editBill,
        deleteBill,
        requestPayBill,
        requestDeletePlan,
        approveApprovalRequest,
        declineApprovalRequest,
        cancelApprovalRequest,
        pendingDirectChat,
        setPendingDirectChat,
        proposeExpense,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useApp must be used within an AppProvider");
  }
  return context;
}
