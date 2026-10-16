"use client";

import React, { createContext, useContext, useState, useMemo } from "react";
import { formatMoney, convertMoney, SUPPORTED_CURRENCIES, MOCK_FX_METADATA } from "./currency";

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

export interface HeldPurchase {
  id: string;
  title: string;
  amount: number;
  currency: string;
  wallet: "shared" | "personal_a" | "personal_b";
  requester: "partner_a" | "partner_b";
  status: "held" | "released" | "cancelled";
  holdUntil: string;
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
  cardType?: "TRANSACTION" | "ACTION_ALLOW" | "ACTION_NEED_APPROVAL" | "ACTION_HOLD" | "ACTION_DENY" | "PLAN" | "CLARIFICATION";
  cardData?: any;
}

export interface PendingDirectChat {
  message: string;
  attachedFileName?: string;
  mode?: "personal" | "shared";
}

interface AppContextType {
  currentUser: UserRole;
  setCurrentUser: (user: UserRole) => void;
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
  simulateMissingFXRate: boolean;
  setSimulateMissingFXRate: (val: boolean) => void;
  // Wallets Native Balances
  wallets: {
    personalA: { balance: number; currency: string; label: string };
    personalB: { balance: number; currency: string; label: string };
    shared: { balance: number; currency: string; label: string };
  };
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
  }) => {
    outcome: "ALLOW" | "NEED_APPROVAL" | "HOLD" | "DENY";
    reason: string;
    details?: any;
  };
  approveRequest: (approvalId: string) => void;
  declineRequest: (approvalId: string) => void;
  continueHeldPurchase: (heldId: string) => void;
  cancelHeldPurchase: (heldId: string) => void;
  recordTransaction: (tx: Omit<Transaction, "id" | "date" | "timestamp">) => Transaction;
  undoTransaction: (txId: string) => void;
  proposeContractChange: (
    newThreshold: number,
    thresholdCurrency: string,
    newSplitB: number,
    newSplitA: number,
    approveEveryShared: boolean
  ) => void;
  approveContractChange: () => void;
  sendChatMessage: (text: string) => Promise<void>;
  payBill: (billId: string) => void;
  settleUp: () => void;
  // Demo presets
  applyDemoPreset: (preset: "global_usd" | "regional_idr") => void;
  // Bill Management
  addBill: (bill: Omit<BillItem, "id" | "daysRemaining">) => BillItem;
  editBill: (billId: string, updated: Partial<BillItem>) => void;
  deleteBill: (billId: string) => void;
  requestPayBill: (billId: string) => void;
  // Plan Management & Dual-Key Deletion
  addPlan: (newPlan: Omit<PlanItem, "id">) => PlanItem;
  updatePlan: (planId: string, updated: Partial<PlanItem>) => void;
  deletePlan: (planId: string) => void;
  requestDeletePlan: (
    planId: string,
    partnerAPin?: string,
    partnerBPin?: string
  ) => { success: boolean; requiresApproval?: boolean };
  // Approval Queue Management
  approveApprovalRequest: (approvalId: string, pin?: string) => boolean;
  declineApprovalRequest: (approvalId: string, reason?: string) => void;
  // Direct chat shortcut from dashboard
  pendingDirectChat: PendingDirectChat | null;
  setPendingDirectChat: (data: PendingDirectChat | null) => void;
  // Expense Proposal
  proposeExpense: (params: ProposeExpenseParams) => {
    outcome: "NEED_APPROVAL" | "ALLOW" | "HOLD";
    id: string;
    reason: string;
  };
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

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<UserRole>("partner_a");

  // Neutral default identities
  const [partnerAName, setPartnerAName] = useState<string>("Alex");
  const [partnerBName, setPartnerBName] = useState<string>("Taylor");
  const [locale, setLocale] = useState<string>("en-US");
  const [timeZone, setTimeZone] = useState<string>("America/New_York");

  // Multi-currency reporting & mock FX controls
  const [reportingCurrency, setReportingCurrency] = useState<string>("USD");
  const [simulateMissingFXRate, setSimulateMissingFXRate] = useState<boolean>(false);
  const [pendingDirectChat, setPendingDirectChat] = useState<PendingDirectChat | null>(null);

  // Wallets with native denomination
  const [wallets, setWallets] = useState({
    personalA: { balance: 14800, currency: "USD", label: "Your balance" },
    personalB: { balance: 12500, currency: "EUR", label: "Partner balance" },
    shared: { balance: 24200, currency: "USD", label: "Shared balance" },
  });

  const [monthlySummary, setMonthlySummary] = useState({
    income: 8250,
    expenses: 4180,
    currency: "USD",
  });

  const [contract, setContract] = useState<CoupleContract>({
    status: "active",
    splitPartnerB: 60,
    splitPartnerA: 40,
    approvalThreshold: 500,
    thresholdCurrency: "USD",
    approveEverySharedPurchase: false,
    cooldownThreshold: 1000,
    cooldownCurrency: "USD",
    cooldownSchedule: "23:00 - 08:00 (Local Time)",
    coolingOffEnabled: true,
    proposedChange: null,
  });

  const [settlement, setSettlement] = useState({
    partnerBOwesA: 51,
    partnerAOwesB: 0,
    currency: "USD",
  });

  const [transactions, setTransactions] = useState<Transaction[]>([
    {
      id: "tx-1",
      title: "Artisanal Coffee & Breakfast",
      amount: -18.5,
      currency: "USD",
      category: "Food & Drinks",
      wallet: "personal_a",
      paidBy: "partner_a",
      date: "Today, 08:34",
      timestamp: "2026-10-14T08:34:00Z",
      isPrivateToA: true,
    },
    {
      id: "tx-2",
      title: "Consulting Client Payout",
      amount: 1450.0,
      currency: "USD",
      category: "Income",
      wallet: "personal_a",
      paidBy: "partner_a",
      date: "Today, 07:45",
      timestamp: "2026-10-14T07:45:00Z",
      isPrivateToA: true,
    },
    {
      id: "tx-3",
      title: "Bookstore Purchase",
      amount: -45.0,
      currency: "EUR",
      category: "Others",
      wallet: "personal_b",
      paidBy: "partner_b",
      date: "Yesterday, 14:20",
      timestamp: "2026-10-13T14:20:00Z",
      isPrivateToB: true,
    },
    {
      id: "tx-4",
      title: "Bistro Dinner Together",
      amount: -85.0,
      currency: "USD",
      category: "Food & Drinks",
      wallet: "shared",
      paidBy: "partner_a",
      splitRatio: { partnerB: 60, partnerA: 40 },
      partnerBOwesA: 51.0,
      date: "Yesterday, 19:10",
      timestamp: "2026-10-13T19:10:00Z",
    },
    {
      id: "tx-5",
      title: "Organic Groceries",
      amount: -145.0,
      currency: "USD",
      category: "Shopping",
      wallet: "shared",
      paidBy: "partner_b",
      splitRatio: { partnerB: 60, partnerA: 40 },
      date: "12 Oct 2026, 17:30",
      timestamp: "2026-10-12T17:30:00Z",
    },
    {
      id: "tx-6",
      title: "High-Speed Fiber Internet",
      amount: -75.0,
      currency: "USD",
      category: "Bills",
      wallet: "shared",
      paidBy: "partner_b",
      date: "10 Oct 2026, 10:00",
      timestamp: "2026-10-10T10:00:00Z",
    },
  ]);

  const [approvals, setApprovals] = useState<ApprovalRequest[]>([
    {
      id: "appr-1",
      title: "Electricity & AC - Payment Confirmation",
      amount: 145,
      currency: "USD",
      wallet: "shared",
      requester: "partner_b",
      approver: "partner_a",
      status: "pending",
      reason: "Taylor marked electricity bill as paid. Requires your confirmation to settle from shared wallet.",
      createdAt: "2026-10-16T07:10:00Z",
      expiresInHours: 24,
      category: "Bills",
      type: "BILL",
      targetId: "bill-1",
    },
    {
      id: "appr-2",
      title: "Delete Goal: Kyoto Vacation Trip",
      amount: 6000,
      currency: "USD",
      wallet: "shared",
      requester: "partner_b",
      approver: "partner_a",
      status: "pending",
      reason: "Goal dissolution proposed by Taylor. Dual-Key PIN consent required to dissolve collaborative goal.",
      createdAt: "2026-10-15T21:10:00Z",
      expiresInHours: 48,
      category: "Plans",
      type: "PLAN_DELETE",
      targetId: "plan-1",
    },
    {
      id: "appr-3",
      title: "Weekend Getaway Airbnb Reservation",
      amount: 540,
      currency: "USD",
      wallet: "shared",
      requester: "partner_a",
      approver: "partner_b",
      status: "pending",
      reason: "Shared expense exceeds agreed $500 threshold under Couple Contract Rule §2.",
      createdAt: "2026-10-16T06:20:00Z",
      expiresInHours: 18,
      category: "Expenses",
      type: "EXPENSE",
    },
    {
      id: "appr-4",
      title: "Amend Contract Split to 50:50",
      amount: 0,
      currency: "USD",
      wallet: "shared",
      requester: "partner_b",
      approver: "partner_a",
      status: "pending",
      reason: "Proposed adjustment of shared contribution split from 60:40 to equal 50:50.",
      createdAt: "2026-10-16T06:50:00Z",
      expiresInHours: 72,
      category: "Contracts",
      type: "CONTRACT",
    },
  ]);

  const [heldPurchases, setHeldPurchases] = useState<HeldPurchase[]>([
    {
      id: "hold-1",
      title: "Limited Edition Designer Jacket",
      amount: 1250,
      currency: "USD",
      wallet: "shared",
      requester: "partner_a",
      status: "held",
      holdUntil: "Tomorrow at 08:00 (Local Time)",
      reason: "Late-night promotional checkout (23:40) exceeding USD 1,000 cooling-off safeguard",
      createdAt: "2026-10-13T23:40:00Z",
    },
  ]);

  const [bills, setBills] = useState<BillItem[]>([
    {
      id: "bill-1",
      title: "High-Speed Fiber Internet 1Gbps",
      amount: 95,
      currency: "USD",
      dueDate: "17 Oct 2026",
      daysRemaining: 3,
      wallet: "shared",
      category: "Utilities",
      status: "upcoming",
      anomaly: {
        type: "increase",
        message: "Bill increased +15% from last month (promotional discount ended)",
      },
    },
    {
      id: "bill-2",
      title: "Annual Home Insurance",
      amount: 1200,
      currency: "USD",
      dueDate: "19 Oct 2026",
      daysRemaining: 5,
      wallet: "shared",
      category: "Housing",
      status: "pending_approval",
    },
    {
      id: "bill-3",
      title: "Cloud Streaming Family Plan",
      amount: 22,
      currency: "USD",
      dueDate: "21 Oct 2026",
      daysRemaining: 7,
      wallet: "shared",
      category: "Entertainment",
      status: "upcoming",
      anomaly: {
        type: "duplicate",
        message: "Duplicate streaming plan detected across shared and personal accounts",
      },
    },
  ]);

  const [plans, setPlans] = useState<PlanItem[]>([
    {
      id: "plan-1",
      title: "Kyoto Vacation Trip",
      category: "Travel",
      targetAmount: 6000,
      currentAmount: 2400,
      currency: "USD",
      targetDate: "Jul 2027 (10 months)",
      recommendedMonthly: 600,
      splitRecommendation: { partnerB: 360, partnerA: 240 },
      walletFunding: "Planned shared contributions",
      status: "Active",
      assumptions: "Planned monthly contribution of USD 600. Taylor 60% (USD 360), Alex 40% (USD 240). No auto-debit.",
    },
    {
      id: "plan-2",
      title: "Emergency Reserve (6 Months)",
      category: "Safety Net",
      targetAmount: 24000,
      currentAmount: 18000,
      currency: "USD",
      targetDate: "Dec 2026",
      recommendedMonthly: 1000,
      splitRecommendation: { partnerB: 600, partnerA: 400 },
      walletFunding: "Planned monthly allocations",
      status: "Active",
      assumptions: "Covers 6 months of fixed household commitments at USD 4,000/mo.",
    },
    {
      id: "plan-3",
      title: "City Electric Scooter",
      category: "Mobility",
      targetAmount: 1800,
      currentAmount: 400,
      currency: "USD",
      targetDate: "Oct 2027",
      recommendedMonthly: 150,
      splitRecommendation: { partnerB: 90, partnerA: 60 },
      walletFunding: "Shared contribution",
      status: "Draft",
      assumptions: "Draft created by Seiya Planner. Awaiting mutual partner activation.",
    },
  ]);

  const [activities, setActivities] = useState<ActivityItem[]>([
    {
      id: "act-1",
      title: "Late-night Jacket Purchase Held",
      category: "Safeguard",
      actor: "seiya",
      status: "HOLD",
      amount: 1250,
      currency: "USD",
      reason: "Cooling-off safeguard triggered (> USD 1,000 at 23:40). Held until 08:00.",
      timestamp: "Yesterday, 23:40",
      timeAgo: "8h ago",
    },
    {
      id: "act-2",
      title: "Home Insurance Approval Requested",
      category: "Bill",
      actor: "partner_a",
      status: "NEED_APPROVAL",
      amount: 1200,
      currency: "USD",
      reason: "Shared bill exceeds agreed USD 500 threshold. Pending Taylor's signature.",
      timestamp: "Today, 09:15",
      timeAgo: "2h ago",
    },
    {
      id: "act-3",
      title: "Dinner Together Shared",
      category: "Food & Drinks",
      actor: "partner_a",
      status: "ALLOW",
      amount: 85,
      currency: "USD",
      reason: "Expense recorded with 60:40 split. Taylor owes Alex USD 51.00.",
      timestamp: "Yesterday, 19:10",
      timeAgo: "1d ago",
    },
  ]);

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: "msg-1",
      sender: "seiya",
      text: "Hello! I'm Seiya, your financial co-pilot. I operate under your Couple Contract with Dual-Key safety. How can I help you both today?",
      timestamp: "09:00",
    },
  ]);

  // Derived Converted Balances into reporting currency
  const convertedBalances = useMemo(() => {
    const convA = convertMoney(wallets.personalA.balance, wallets.personalA.currency, reportingCurrency, simulateMissingFXRate);
    const convB = convertMoney(wallets.personalB.balance, wallets.personalB.currency, reportingCurrency, simulateMissingFXRate);
    const convShared = convertMoney(wallets.shared.balance, wallets.shared.currency, reportingCurrency, simulateMissingFXRate);

    const allAvailable = convA.available && convB.available && convShared.available;
    const total = allAvailable ? convA.convertedAmount + convB.convertedAmount + convShared.convertedAmount : 0;

    return {
      personalA: { amount: convA.convertedAmount, available: convA.available, isEstimate: convA.isEstimate },
      personalB: { amount: convB.convertedAmount, available: convB.available, isEstimate: convB.isEstimate },
      shared: { amount: convShared.convertedAmount, available: convShared.available, isEstimate: convShared.isEstimate },
      totalCombined: { amount: total, available: allAvailable, isIncomplete: !allAvailable },
    };
  }, [wallets, reportingCurrency, simulateMissingFXRate]);

  // Preset switchers for global vs regional demo testing
  const applyDemoPreset = (preset: "global_usd" | "regional_idr") => {
    if (preset === "regional_idr") {
      setPartnerAName("Raka");
      setPartnerBName("Dina");
      setLocale("id-ID");
      setTimeZone("Asia/Jakarta");
      setReportingCurrency("IDR");
      setWallets({
        personalA: { balance: 230_000_000, currency: "IDR", label: "Your balance" },
        personalB: { balance: 133_400_000, currency: "IDR", label: "Partner balance" },
        shared: { balance: 220_000_000, currency: "IDR", label: "Shared balance" },
      });
      setMonthlySummary({ income: 12_525_000, expenses: 6_350_000, currency: "IDR" });
      setContract((prev) => ({
        ...prev,
        approvalThreshold: 500_000,
        thresholdCurrency: "IDR",
        cooldownThreshold: 1_000_000,
        cooldownCurrency: "IDR",
      }));
      setSettlement({ partnerBOwesA: 51_000, partnerAOwesB: 0, currency: "IDR" });
    } else {
      setPartnerAName("Alex");
      setPartnerBName("Taylor");
      setLocale("en-US");
      setTimeZone("America/New_York");
      setReportingCurrency("USD");
      setWallets({
        personalA: { balance: 14800, currency: "USD", label: "Your balance" },
        personalB: { balance: 12500, currency: "EUR", label: "Partner balance" },
        shared: { balance: 24200, currency: "USD", label: "Shared balance" },
      });
      setMonthlySummary({ income: 8250, expenses: 4180, currency: "USD" });
      setContract((prev) => ({
        ...prev,
        approvalThreshold: 500,
        thresholdCurrency: "USD",
        cooldownThreshold: 1000,
        cooldownCurrency: "USD",
      }));
      setSettlement({ partnerBOwesA: 51, partnerAOwesB: 0, currency: "USD" });
    }
  };

  // Deterministic Gateway evaluation
  const processGatewayDecision = (request: {
    actionType: "EXPENSE" | "BILL_PAY" | "PURCHASE" | "EXTERNAL_TRANSFER" | "PRIVACY_REQUEST";
    title: string;
    amount: number;
    currency: string;
    wallet: "shared" | "personal_a" | "personal_b";
    timeOfDay?: string;
    category?: string;
  }) => {
    if (request.actionType === "EXTERNAL_TRANSFER") {
      return {
        outcome: "DENY" as const,
        reason: "External transfers to outside bank accounts are blocked. Seiya operates on couple-managed accounts only.",
      };
    }

    if (request.actionType === "PRIVACY_REQUEST") {
      return {
        outcome: "DENY" as const,
        reason: "Couple Privacy Contract: Partner's aggregate balance is shared, but itemized transaction history is private.",
      };
    }

    // Cooling-off check (Late-night & amount threshold)
    // Convert to threshold currency for accurate comparison
    const convCooldown = convertMoney(request.amount, request.currency, contract.cooldownCurrency);
    const isLateNight = request.timeOfDay ? request.timeOfDay >= "23:00" || request.timeOfDay < "08:00" : false;

    if (
      contract.coolingOffEnabled &&
      convCooldown.available &&
      convCooldown.convertedAmount >= contract.cooldownThreshold &&
      (isLateNight || request.title.toLowerCase().includes("flash-sale") || request.title.toLowerCase().includes("shoes") || request.title.toLowerCase().includes("jacket"))
    ) {
      return {
        outcome: "HOLD" as const,
        reason: `Late-night checkout above couple safeguard (${formatMoney(contract.cooldownThreshold, contract.cooldownCurrency, locale)}). Held until 08:00 to ensure thoughtful decisions.`,
        details: { holdUntil: "Tomorrow at 08:00", originalAmount: request.amount, currency: request.currency },
      };
    }

    // Check shared-wallet approval threshold
    const convThreshold = convertMoney(request.amount, request.currency, contract.thresholdCurrency);
    const exceedsThreshold =
      contract.approveEverySharedPurchase ||
      (convThreshold.available && convThreshold.convertedAmount >= contract.approvalThreshold);

    if (request.wallet === "shared" && exceedsThreshold) {
      return {
        outcome: "NEED_APPROVAL" as const,
        reason: contract.approveEverySharedPurchase
          ? "Couple policy: Every shared purchase requires partner confirmation."
          : `Shared expense exceeds agreed approval threshold (${formatMoney(contract.approvalThreshold, contract.thresholdCurrency, locale)}). Partner signature required.`,
        details: {
          requester: currentUser,
          approver: currentUser === "partner_a" ? "partner_b" : "partner_a",
          amount: request.amount,
          currency: request.currency,
        },
      };
    }

    return {
      outcome: "ALLOW" as const,
      reason: "Action complies with agreed Couple Contract rules and limits.",
    };
  };

  const approveRequest = (approvalId: string) => {
    const item = approvals.find((a) => a.id === approvalId);
    if (!item) return;

    if (item.requester === currentUser) {
      alert("Security Rule: A requester cannot approve their own financial request.");
      return;
    }

    setApprovals((prev) =>
      prev.map((a) => (a.id === approvalId ? { ...a, status: "approved" } : a))
    );

    if (item.wallet === "shared") {
      setWallets((prev) => ({
        ...prev,
        shared: { ...prev.shared, balance: prev.shared.balance - item.amount },
      }));
    }

    setBills((prev) =>
      prev.map((b) => (b.title === item.title ? { ...b, status: "paid" } : b))
    );

    const approverName = currentUser === "partner_a" ? partnerAName : partnerBName;

    setActivities((prev) => [
      {
        id: `act-${Date.now()}`,
        title: `${item.title} Approved & Executed`,
        category: "Approval",
        actor: currentUser,
        status: "ALLOW",
        amount: item.amount,
        currency: item.currency,
        reason: `Approved by ${approverName} with passkey signature via Dual-Key Gateway.`,
        timestamp: "Just now",
        timeAgo: "Just now",
      },
      ...prev,
    ]);
  };

  const declineRequest = (approvalId: string) => {
    const item = approvals.find((a) => a.id === approvalId);
    if (!item) return;

    setApprovals((prev) =>
      prev.map((a) => (a.id === approvalId ? { ...a, status: "declined" } : a))
    );

    const declinerName = currentUser === "partner_a" ? partnerAName : partnerBName;

    setActivities((prev) => [
      {
        id: `act-${Date.now()}`,
        title: `${item.title} Declined`,
        category: "Approval",
        actor: currentUser,
        status: "DENY",
        amount: item.amount,
        currency: item.currency,
        reason: `Declined by ${declinerName}.`,
        timestamp: "Just now",
        timeAgo: "Just now",
      },
      ...prev,
    ]);
  };

  const continueHeldPurchase = (heldId: string) => {
    const item = heldPurchases.find((h) => h.id === heldId);
    if (!item) return;

    // Rerunning checks
    const convThreshold = convertMoney(item.amount, item.currency, contract.thresholdCurrency);
    if (item.wallet === "shared" && convThreshold.available && convThreshold.convertedAmount >= contract.approvalThreshold) {
      setHeldPurchases((prev) => prev.filter((h) => h.id !== heldId));
      const newAppr: ApprovalRequest = {
        id: `appr-${Date.now()}`,
        title: item.title,
        amount: item.amount,
        currency: item.currency,
        wallet: item.wallet,
        requester: item.requester,
        approver: item.requester === "partner_a" ? "partner_b" : "partner_a",
        status: "pending",
        reason: "User confirmed held item; secondary gateway check routed to partner approval.",
        createdAt: new Date().toISOString(),
        expiresInHours: 24,
      };
      setApprovals((prev) => [newAppr, ...prev]);
      return;
    }

    setHeldPurchases((prev) => prev.filter((h) => h.id !== heldId));
    setWallets((prev) => ({
      ...prev,
      shared: { ...prev.shared, balance: prev.shared.balance - item.amount },
    }));

    setActivities((prev) => [
      {
        id: `act-${Date.now()}`,
        title: `${item.title} Confirmed after Cooldown`,
        category: "Safeguard",
        actor: currentUser,
        status: "ALLOW",
        amount: item.amount,
        currency: item.currency,
        reason: "Secondary confirmation verified through gateway.",
        timestamp: "Just now",
        timeAgo: "Just now",
      },
      ...prev,
    ]);
  };

  const cancelHeldPurchase = (heldId: string) => {
    setHeldPurchases((prev) => prev.filter((h) => h.id !== heldId));
    setActivities((prev) => [
      {
        id: `act-${Date.now()}`,
        title: "Held Purchase Cancelled",
        category: "Safeguard",
        actor: currentUser,
        status: "INFO",
        reason: "Cancelled by user after cooling-off review.",
        timestamp: "Just now",
        timeAgo: "Just now",
      },
      ...prev,
    ]);
  };

  const recordTransaction = (tx: Omit<Transaction, "id" | "date" | "timestamp">): Transaction => {
    const newTx: Transaction = {
      ...tx,
      id: `tx-${Date.now()}`,
      date: "Today, " + new Date().toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }),
      timestamp: new Date().toISOString(),
    };

    setTransactions((prev) => [newTx, ...prev]);

    // Update native wallet balance
    if (newTx.wallet === "shared") {
      setWallets((prev) => ({
        ...prev,
        shared: { ...prev.shared, balance: prev.shared.balance + newTx.amount },
      }));
    } else if (newTx.wallet === "personal_a") {
      setWallets((prev) => ({
        ...prev,
        personalA: { ...prev.personalA, balance: prev.personalA.balance + newTx.amount },
      }));
    } else if (newTx.wallet === "personal_b") {
      setWallets((prev) => ({
        ...prev,
        personalB: { ...prev.personalB, balance: prev.personalB.balance + newTx.amount },
      }));
    }

    // Update settlement
    if (newTx.partnerBOwesA) {
      setSettlement((prev) => ({
        ...prev,
        partnerBOwesA: prev.partnerBOwesA + (newTx.partnerBOwesA || 0),
      }));
    } else if (newTx.partnerAOwesB) {
      setSettlement((prev) => ({
        ...prev,
        partnerAOwesB: prev.partnerAOwesB + (newTx.partnerAOwesB || 0),
      }));
    }

    setActivities((prev) => [
      {
        id: `act-${Date.now()}`,
        title: newTx.title,
        category: newTx.category,
        actor: newTx.paidBy,
        status: "ALLOW",
        amount: Math.abs(newTx.amount),
        currency: newTx.currency,
        reason: `Transaction recorded to ${newTx.wallet}.`,
        timestamp: "Just now",
        timeAgo: "Just now",
      },
      ...prev,
    ]);

    return newTx;
  };

  const undoTransaction = (txId: string) => {
    const tx = transactions.find((t) => t.id === txId);
    if (!tx) return;

    setTransactions((prev) => prev.filter((t) => t.id !== txId));

    if (tx.wallet === "shared") {
      setWallets((prev) => ({
        ...prev,
        shared: { ...prev.shared, balance: prev.shared.balance - tx.amount },
      }));
    } else if (tx.wallet === "personal_a") {
      setWallets((prev) => ({
        ...prev,
        personalA: { ...prev.personalA, balance: prev.personalA.balance - tx.amount },
      }));
    } else if (tx.wallet === "personal_b") {
      setWallets((prev) => ({
        ...prev,
        personalB: { ...prev.personalB, balance: prev.personalB.balance - tx.amount },
      }));
    }

    if (tx.partnerBOwesA) {
      setSettlement((prev) => ({
        ...prev,
        partnerBOwesA: Math.max(0, prev.partnerBOwesA - tx.partnerBOwesA!),
      }));
    }

    setActivities((prev) => [
      {
        id: `act-${Date.now()}`,
        title: `Undo: ${tx.title}`,
        category: "Undo",
        actor: currentUser,
        status: "INFO",
        reason: "Eligible transaction entry reverted within undo window.",
        timestamp: "Just now",
        timeAgo: "Just now",
      },
      ...prev,
    ]);
  };

  const proposeContractChange = (
    newThreshold: number,
    thresholdCurrency: string,
    newSplitB: number,
    newSplitA: number,
    approveEveryShared: boolean
  ) => {
    setContract((prev) => ({
      ...prev,
      status: "pending_partner_approval",
      proposedChange: {
        approvalThreshold: newThreshold,
        thresholdCurrency,
        splitPartnerB: newSplitB,
        splitPartnerA: newSplitA,
        approveEverySharedPurchase: approveEveryShared,
        proposedBy: currentUser,
        timestamp: new Date().toISOString(),
      },
    }));

    setActivities((prev) => [
      {
        id: `act-${Date.now()}`,
        title: "Contract Amendment Proposed",
        category: "Contract",
        actor: currentUser,
        status: "NEED_APPROVAL",
        reason: `Proposed approval threshold ${thresholdCurrency} ${newThreshold}. Pending partner signature.`,
        timestamp: "Just now",
        timeAgo: "Just now",
      },
      ...prev,
    ]);
  };

  const approveContractChange = () => {
    if (!contract.proposedChange) return;
    if (contract.proposedChange.proposedBy === currentUser) {
      alert("A partner cannot approve their own contract proposal.");
      return;
    }

    setContract((prev) => ({
      ...prev,
      status: "active",
      approvalThreshold: prev.proposedChange!.approvalThreshold,
      thresholdCurrency: prev.proposedChange!.thresholdCurrency,
      splitPartnerB: prev.proposedChange!.splitPartnerB,
      splitPartnerA: prev.proposedChange!.splitPartnerA,
      approveEverySharedPurchase: prev.proposedChange!.approveEverySharedPurchase,
      proposedChange: null,
    }));

    setActivities((prev) => [
      {
        id: `act-${Date.now()}`,
        title: "Contract Amendment Activated",
        category: "Contract",
        actor: currentUser,
        status: "ALLOW",
        reason: "Both partners have signed the updated contract terms.",
        timestamp: "Just now",
        timeAgo: "Just now",
      },
      ...prev,
    ]);
  };

  const payBill = (billId: string) => {
    const bill = bills.find((b) => b.id === billId);
    if (!bill) return;

    const gateway = processGatewayDecision({
      actionType: "BILL_PAY",
      title: bill.title,
      amount: bill.amount,
      currency: bill.currency,
      wallet: bill.wallet,
    });

    if (gateway.outcome === "NEED_APPROVAL") {
      const newAppr: ApprovalRequest = {
        id: `appr-${Date.now()}`,
        title: bill.title,
        amount: bill.amount,
        currency: bill.currency,
        wallet: bill.wallet,
        requester: currentUser,
        approver: currentUser === "partner_a" ? "partner_b" : "partner_a",
        status: "pending",
        reason: gateway.reason,
        createdAt: new Date().toISOString(),
        expiresInHours: 24,
      };
      setApprovals((prev) => [newAppr, ...prev]);
      setBills((prev) =>
        prev.map((b) => (b.id === billId ? { ...b, status: "pending_approval" } : b))
      );
    } else if (gateway.outcome === "ALLOW") {
      setBills((prev) =>
        prev.map((b) => (b.id === billId ? { ...b, status: "paid" } : b))
      );
      setWallets((prev) => ({
        ...prev,
        shared: { ...prev.shared, balance: prev.shared.balance - bill.amount },
      }));
    }
  };

  const settleUp = () => {
    setSettlement({
      partnerBOwesA: 0,
      partnerAOwesB: 0,
      currency: settlement.currency,
    });
    setActivities((prev) => [
      {
        id: `act-${Date.now()}`,
        title: "Settlement Completed",
        category: "Settlement",
        actor: currentUser,
        status: "ALLOW",
        reason: "Shared expense ledger balance settled between partners.",
        timestamp: "Just now",
        timeAgo: "Just now",
      },
      ...prev,
    ]);
  };

  const proposeExpense = (params: ProposeExpenseParams) => {
    const decision = processGatewayDecision({
      actionType: "EXPENSE",
      title: params.title,
      amount: params.amount,
      currency: params.currency,
      wallet: params.wallet,
      category: params.category,
    });

    const approverRole: UserRole = currentUser === "partner_a" ? "partner_b" : "partner_a";
    const approverName = approverRole === "partner_a" ? partnerAName : partnerBName;

    if (decision.outcome === "NEED_APPROVAL") {
      const newAppr: ApprovalRequest = {
        id: `appr-exp-${Date.now()}`,
        title: `Expense: ${params.title}`,
        amount: params.amount,
        currency: params.currency,
        wallet: params.wallet,
        requester: currentUser,
        approver: approverRole,
        status: "pending",
        reason: params.notes ? `${params.notes} • ${decision.reason}` : decision.reason,
        createdAt: new Date().toISOString(),
        expiresInHours: 48,
        category: "Expenses",
        type: "EXPENSE",
        notes: params.notes,
      };
      setApprovals((prev) => [newAppr, ...prev]);
      setActivities((prev) => [
        {
          id: `act-${Date.now()}`,
          title: `Expense Proposed: ${params.title}`,
          category: "Approval Request",
          actor: currentUser,
          status: "NEED_APPROVAL",
          amount: params.amount,
          currency: params.currency,
          reason: `Dual-Key signature required by ${approverName}.`,
          timestamp: "Just now",
          timeAgo: "Just now",
        },
        ...prev,
      ]);
      return { outcome: "NEED_APPROVAL" as const, id: newAppr.id, reason: decision.reason };
    } else if (decision.outcome === "HOLD") {
      const newHeld: HeldPurchase = {
        id: `held-exp-${Date.now()}`,
        title: params.title,
        amount: params.amount,
        currency: params.currency,
        wallet: params.wallet,
        requester: currentUser,
        status: "held",
        holdUntil: "Tomorrow at 08:00",
        reason: decision.reason,
        createdAt: new Date().toISOString(),
      };
      setHeldPurchases((prev) => [newHeld, ...prev]);
      setActivities((prev) => [
        {
          id: `act-${Date.now()}`,
          title: `Expense Held by Safeguard: ${params.title}`,
          category: "Safeguard",
          actor: currentUser,
          status: "HOLD",
          amount: params.amount,
          currency: params.currency,
          reason: decision.reason,
          timestamp: "Just now",
          timeAgo: "Just now",
        },
        ...prev,
      ]);
      return { outcome: "HOLD" as const, id: newHeld.id, reason: decision.reason };
    } else {
      recordTransaction({
        title: params.title,
        amount: -Math.abs(params.amount),
        currency: params.currency,
        category: params.category,
        wallet: params.wallet,
        paidBy: currentUser,
        splitRatio: params.splitRatio,
      });
      setActivities((prev) => [
        {
          id: `act-${Date.now()}`,
          title: `Expense Recorded: ${params.title}`,
          category: "Transaction",
          actor: currentUser,
          status: "ALLOW",
          amount: params.amount,
          currency: params.currency,
          reason: "Executed directly within agreed threshold.",
          timestamp: "Just now",
          timeAgo: "Just now",
        },
        ...prev,
      ]);
      return { outcome: "ALLOW" as const, id: `tx-${Date.now()}`, reason: "Expense recorded directly." };
    }
  };

  const addPlan = (newPlan: Omit<PlanItem, "id">): PlanItem => {
    const id = `plan-${Date.now()}`;
    const plan: PlanItem = {
      ...newPlan,
      id,
    };
    setPlans((prev) => [plan, ...prev]);

    const creatorName = currentUser === "partner_a" ? partnerAName : partnerBName;

    setActivities((prev) => [
      {
        id: `act-${Date.now()}`,
        title: `New Goal Added: ${plan.title}`,
        category: "Plan",
        actor: currentUser,
        status: "INFO",
        amount: plan.targetAmount,
        currency: plan.currency,
        reason: `${creatorName} manually created financial goal "${plan.title}" targeting ${plan.targetDate}.`,
        timestamp: "Just now",
        timeAgo: "Just now",
      },
      ...prev,
    ]);

    return plan;
  };

  const updatePlan = (planId: string, updated: Partial<PlanItem>) => {
    setPlans((prev) =>
      prev.map((p) => {
        if (p.id === planId) {
          return { ...p, ...updated };
        }
        return p;
      })
    );

    const plan = plans.find((p) => p.id === planId);
    if (plan) {
      const editorName = currentUser === "partner_a" ? partnerAName : partnerBName;
      setActivities((prev) => [
        {
          id: `act-${Date.now()}`,
          title: `Goal Adjusted: ${updated.title || plan.title}`,
          category: "Plan",
          actor: currentUser,
          status: "INFO",
          amount: updated.targetAmount || plan.targetAmount,
          currency: updated.currency || plan.currency,
          reason: `${editorName} adjusted goal terms and allocation for "${updated.title || plan.title}".`,
          timestamp: "Just now",
          timeAgo: "Just now",
        },
        ...prev,
      ]);
    }
  };

  const deletePlan = (planId: string) => {
    setPlans((prev) => prev.filter((p) => p.id !== planId));
  };

  const addBill = (billData: Omit<BillItem, "id" | "daysRemaining">): BillItem => {
    const id = `bill-${Date.now()}`;
    const newBill: BillItem = {
      ...billData,
      id,
      daysRemaining: 14,
      status: "upcoming",
    };
    setBills((prev) => [newBill, ...prev]);

    const creatorName = currentUser === "partner_a" ? partnerAName : partnerBName;
    setActivities((prev) => [
      {
        id: `act-${Date.now()}`,
        title: `New Bill Added: ${newBill.title}`,
        category: "Bills",
        actor: currentUser,
        status: "INFO",
        amount: newBill.amount,
        currency: newBill.currency,
        reason: `${creatorName} registered recurring obligation "${newBill.title}" due on ${newBill.dueDate}.`,
        timestamp: "Just now",
        timeAgo: "Just now",
      },
      ...prev,
    ]);

    return newBill;
  };

  const editBill = (billId: string, updated: Partial<BillItem>) => {
    setBills((prev) =>
      prev.map((b) => (b.id === billId ? { ...b, ...updated } : b))
    );
  };

  const deleteBill = (billId: string) => {
    const bill = bills.find((b) => b.id === billId);
    setBills((prev) => prev.filter((b) => b.id !== billId));

    if (bill) {
      const actorName = currentUser === "partner_a" ? partnerAName : partnerBName;
      setActivities((prev) => [
        {
          id: `act-${Date.now()}`,
          title: `Bill Deleted: ${bill.title}`,
          category: "Bills",
          actor: currentUser,
          status: "INFO",
          amount: bill.amount,
          currency: bill.currency,
          reason: `${actorName} removed recurring bill "${bill.title}".`,
          timestamp: "Just now",
          timeAgo: "Just now",
        },
        ...prev,
      ]);
    }
  };

  const requestPayBill = (billId: string) => {
    const bill = bills.find((b) => b.id === billId);
    if (!bill) return;

    // Set bill status to pending_approval ("Waiting Partner ACC")
    setBills((prev) =>
      prev.map((b) => (b.id === billId ? { ...b, status: "pending_approval" } : b))
    );

    const requesterName = currentUser === "partner_a" ? partnerAName : partnerBName;
    const partnerRole: UserRole = currentUser === "partner_a" ? "partner_b" : "partner_a";
    const partnerName = currentUser === "partner_a" ? partnerBName : partnerAName;

    // Create an approval request for the partner to manually confirm
    const newApproval: ApprovalRequest = {
      id: `appr-${Date.now()}`,
      title: `${bill.title} - Payment Confirmation`,
      amount: bill.amount,
      currency: bill.currency,
      wallet: bill.wallet,
      requester: currentUser,
      approver: partnerRole,
      status: "pending",
      reason: `${requesterName} marked this bill as paid. Requires ${partnerName}'s confirmation to settle.`,
      createdAt: new Date().toISOString(),
      expiresInHours: 24,
      category: "Bills",
      type: "BILL",
      targetId: bill.id,
    };

    setApprovals((prev) => [newApproval, ...prev]);

    setActivities((prev) => [
      {
        id: `act-${Date.now()}`,
        title: `Payment Confirmation Requested: ${bill.title}`,
        category: "Bills",
        actor: currentUser,
        status: "NEED_APPROVAL",
        amount: bill.amount,
        currency: bill.currency,
        reason: `${requesterName} marked bill as paid. Dispatched to ${partnerName} for partner confirmation.`,
        timestamp: "Just now",
        timeAgo: "Just now",
      },
      ...prev,
    ]);
  };

  const requestDeletePlan = (
    planId: string,
    partnerAPin?: string,
    partnerBPin?: string
  ): { success: boolean; requiresApproval?: boolean } => {
    const plan = plans.find((p) => p.id === planId);
    if (!plan) return { success: false };

    // Both PINs provided in-person (Dual-Key immediate consensus)
    if (partnerAPin && partnerBPin && partnerAPin.length === 6 && partnerBPin.length === 6) {
      setPlans((prev) => prev.filter((p) => p.id !== planId));
      setActivities((prev) => [
        {
          id: `act-${Date.now()}`,
          title: `Goal Dissolved: ${plan.title}`,
          category: "Plans",
          actor: currentUser,
          status: "ALLOW",
          amount: plan.targetAmount,
          currency: plan.currency,
          reason: `Both ${partnerAName} & ${partnerBName} entered their cryptographic PINs to confirm goal deletion.`,
          timestamp: "Just now",
          timeAgo: "Just now",
        },
        ...prev,
      ]);
      return { success: true, requiresApproval: false };
    }

    // Single partner initiating -> Create an approval request for partner
    const requesterName = currentUser === "partner_a" ? partnerAName : partnerBName;
    const partnerRole: UserRole = currentUser === "partner_a" ? "partner_b" : "partner_a";
    const partnerName = currentUser === "partner_a" ? partnerBName : partnerAName;

    const newApproval: ApprovalRequest = {
      id: `appr-${Date.now()}`,
      title: `Delete Goal: ${plan.title}`,
      amount: plan.targetAmount,
      currency: plan.currency,
      wallet: "shared",
      requester: currentUser,
      approver: partnerRole,
      status: "pending",
      reason: `${requesterName} requested deletion of collaborative goal "${plan.title}". Requires ${partnerName}'s dual-key PIN signature.`,
      createdAt: new Date().toISOString(),
      expiresInHours: 48,
      category: "Plans",
      type: "PLAN_DELETE",
      targetId: plan.id,
    };

    setApprovals((prev) => [newApproval, ...prev]);

    setActivities((prev) => [
      {
        id: `act-${Date.now()}`,
        title: `Goal Deletion Proposed: ${plan.title}`,
        category: "Plans",
        actor: currentUser,
        status: "NEED_APPROVAL",
        amount: plan.targetAmount,
        currency: plan.currency,
        reason: `${requesterName} requested to dissolve "${plan.title}". Awaiting ${partnerName}'s dual-key approval.`,
        timestamp: "Just now",
        timeAgo: "Just now",
      },
      ...prev,
    ]);

    return { success: true, requiresApproval: true };
  };

  const approveApprovalRequest = (approvalId: string, pin?: string): boolean => {
    const item = approvals.find((a) => a.id === approvalId);
    if (!item) return false;

    if (item.requester === currentUser) {
      alert("Dual-Key Security Rule: A requester cannot approve their own financial request.");
      return false;
    }

    setApprovals((prev) =>
      prev.map((a) => (a.id === approvalId ? { ...a, status: "approved" } : a))
    );

    const approverName = currentUser === "partner_a" ? partnerAName : partnerBName;

    // Execute based on approval category/type
    if (item.type === "BILL" || item.category === "Bills") {
      setBills((prev) =>
        prev.map((b) => (
          b.id === item.targetId ||
          b.title === item.title.replace(" - Payment Confirmation", "").replace(" - Payment ACC", "")
            ? { ...b, status: "paid" }
            : b
        ))
      );
      if (item.wallet === "shared") {
        setWallets((prev) => ({
          ...prev,
          shared: { ...prev.shared, balance: Math.max(0, prev.shared.balance - item.amount) },
        }));
      }
    } else if (item.type === "PLAN_DELETE" || item.category === "Plans") {
      if (item.targetId) {
        setPlans((prev) => prev.filter((p) => p.id !== item.targetId));
      }
    } else if (item.type === "EXPENSE" || item.category === "Expenses") {
      if (item.wallet === "shared") {
        setWallets((prev) => ({
          ...prev,
          shared: { ...prev.shared, balance: Math.max(0, prev.shared.balance - item.amount) },
        }));
      }
    } else if (item.type === "CONTRACT" || item.category === "Contracts") {
      if (contract.proposedChange) {
        setContract((prev) => ({
          ...prev,
          status: "active",
          approvalThreshold: prev.proposedChange!.approvalThreshold,
          thresholdCurrency: prev.proposedChange!.thresholdCurrency,
          splitPartnerB: prev.proposedChange!.splitPartnerB,
          splitPartnerA: prev.proposedChange!.splitPartnerA,
          approveEverySharedPurchase: prev.proposedChange!.approveEverySharedPurchase,
          proposedChange: null,
        }));
      }
    }

    setActivities((prev) => [
      {
        id: `act-${Date.now()}`,
        title: `${item.title} Approved & Executed`,
        category: item.category || "Approval",
        actor: currentUser,
        status: "ALLOW",
        amount: item.amount,
        currency: item.currency,
        reason: `Dual-Key signature verified by ${approverName} with security PIN. Execution confirmed.`,
        timestamp: "Just now",
        timeAgo: "Just now",
      },
      ...prev,
    ]);

    return true;
  };

  const declineApprovalRequest = (approvalId: string, reason?: string) => {
    const item = approvals.find((a) => a.id === approvalId);
    if (!item) return;

    setApprovals((prev) =>
      prev.map((a) => (a.id === approvalId ? { ...a, status: "declined" } : a))
    );

    // If it was a bill, reset status
    if (item.type === "BILL" || item.category === "Bills") {
      setBills((prev) =>
        prev.map((b) => (
          b.id === item.targetId ||
          b.title === item.title.replace(" - Payment Confirmation", "").replace(" - Payment ACC", "")
            ? { ...b, status: "upcoming" }
            : b
        ))
      );
    }

    const declinerName = currentUser === "partner_a" ? partnerAName : partnerBName;

    setActivities((prev) => [
      {
        id: `act-${Date.now()}`,
        title: `${item.title} Declined`,
        category: item.category || "Approval",
        actor: currentUser,
        status: "DENY",
        amount: item.amount,
        currency: item.currency,
        reason: `Declined by ${declinerName}. ${reason || "Action rejected under mutual veto power."}`,
        timestamp: "Just now",
        timeAgo: "Just now",
      },
      ...prev,
    ]);
  };

  // Agent Chat Simulation supporting multi-currency and global scenarios
  const sendChatMessage = async (text: string) => {
    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      sender: "user",
      userRole: currentUser,
      text,
      timestamp: new Date().toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }),
    };

    setChatMessages((prev) => [...prev, userMsg]);

    const lower = text.toLowerCase();

    // 1. Record shared expense (USD 85 or IDR 85.000)
    if (lower.includes("85") && (lower.includes("lunch") || lower.includes("dinner") || lower.includes("paid"))) {
      const isIDR = lower.includes("85.000") || reportingCurrency === "IDR";
      const currency = isIDR ? "IDR" : "USD";
      const amount = isIDR ? 85_000 : 85;
      const splitB = 60;
      const splitA = 40;
      const bOwes = (amount * splitB) / 100;

      const recordedTx = recordTransaction({
        title: "Dinner together",
        amount: -amount,
        currency,
        category: "Food & Drinks",
        wallet: "shared",
        paidBy: currentUser,
        splitRatio: { partnerB: splitB, partnerA: splitA },
        partnerBOwesA: currentUser === "partner_a" ? bOwes : 0,
        partnerAOwesB: currentUser === "partner_b" ? (amount * splitA) / 100 : 0,
      });

      const seiyaReply: ChatMessage = {
        id: `msg-${Date.now() + 1}`,
        sender: "seiya",
        text: `Checked against Couple Contract rules: standard expense within agreed limits. Recorded with ${splitB}:${splitA} split ratio.`,
        timestamp: new Date().toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }),
        cardType: "ACTION_ALLOW",
        cardData: {
          title: "Dinner together",
          category: "Food & Drinks",
          amount,
          currency,
          paidBy: currentUser === "partner_a" ? partnerAName : partnerBName,
          split: `${partnerBName} 60% : ${partnerAName} 40%`,
          settlementText: `${partnerBName} owes ${partnerAName} ${formatMoney(bOwes, currency, locale)}`,
          wallet: "Shared wallet",
          txId: recordedTx.id,
        },
      };
      setChatMessages((prev) => [...prev, seiyaReply]);
      return;
    }

    // 2. Clarification
    if (lower.includes("groceries") && (lower.includes("450") || lower.includes("145") || lower.includes("monthly"))) {
      const isIDR = lower.includes("450") || reportingCurrency === "IDR";
      const currency = isIDR ? "IDR" : "USD";
      const amount = isIDR ? 450_000 : 145;

      const seiyaReply: ChatMessage = {
        id: `msg-${Date.now() + 1}`,
        sender: "seiya",
        text: `I can record the ${formatMoney(amount, currency, locale)} grocery expense. One quick question before recording:`,
        timestamp: new Date().toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }),
        cardType: "CLARIFICATION",
        cardData: {
          question: "Which wallet was used?",
          options: ["Shared wallet", "Personal wallet"],
          amount,
          currency,
          category: "Shopping",
          title: "Groceries",
        },
      };
      setChatMessages((prev) => [...prev, seiyaReply]);
      return;
    }

    // 3. Edit / Correct transaction
    if (lower.includes("58") || lower.includes("actually") || lower.includes("correct it")) {
      const isIDR = lower.includes("58.000") || reportingCurrency === "IDR";
      const currency = isIDR ? "IDR" : "USD";
      const amount = isIDR ? 58_000 : 58;
      const bOwes = (amount * 60) / 100;

      setTransactions((prev) =>
        prev.map((t) => {
          if (t.title.toLowerCase().includes("dinner") || t.title.toLowerCase().includes("lunch")) {
            return {
              ...t,
              amount: -amount,
              currency,
              partnerBOwesA: bOwes,
            };
          }
          return t;
        })
      );

      const seiyaReply: ChatMessage = {
        id: `msg-${Date.now() + 1}`,
        sender: "seiya",
        text: `Updated the prior dining transaction to ${formatMoney(amount, currency, locale)} without creating a duplicate. ${partnerBName} now owes ${partnerAName} ${formatMoney(bOwes, currency, locale)}.`,
        timestamp: new Date().toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }),
        cardType: "ACTION_ALLOW",
        cardData: {
          title: "Dinner together (Updated)",
          category: "Food & Drinks",
          amount,
          currency,
          paidBy: currentUser === "partner_a" ? partnerAName : partnerBName,
          split: `${partnerBName} 60% : ${partnerAName} 40%`,
          settlementText: `${partnerBName} owes ${partnerAName} ${formatMoney(bOwes, currency, locale)}`,
          wallet: "Shared wallet",
          statusNote: "Transaction corrected in place",
        },
      };
      setChatMessages((prev) => [...prev, seiyaReply]);
      return;
    }

    // 4. Shared bill approval (e.g. USD 1,200 insurance)
    if (lower.includes("insurance") || lower.includes("motor") || lower.includes("installment") || lower.includes("1200")) {
      const isIDR = reportingCurrency === "IDR";
      const currency = isIDR ? "IDR" : "USD";
      const amount = isIDR ? 1_200_000 : 1200;

      const gateway = processGatewayDecision({
        actionType: "BILL_PAY",
        title: isIDR ? "Motor installment (Shared)" : "Annual Home Insurance",
        amount,
        currency,
        wallet: "shared",
      });

      if (gateway.outcome === "NEED_APPROVAL") {
        const newAppr: ApprovalRequest = {
          id: `appr-${Date.now()}`,
          title: isIDR ? "Motor installment (Shared)" : "Annual Home Insurance",
          amount,
          currency,
          wallet: "shared",
          requester: currentUser,
          approver: currentUser === "partner_a" ? "partner_b" : "partner_a",
          status: "pending",
          reason: gateway.reason,
          createdAt: new Date().toISOString(),
          expiresInHours: 24,
        };
        setApprovals((prev) => [newAppr, ...prev]);

        const seiyaReply: ChatMessage = {
          id: `msg-${Date.now() + 1}`,
          sender: "seiya",
          text: `This payment of ${formatMoney(amount, currency, locale)} exceeds your agreed shared threshold. Dual-Key Gateway requires partner approval before funds can be debited.`,
          timestamp: new Date().toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }),
          cardType: "ACTION_NEED_APPROVAL",
          cardData: {
            title: isIDR ? "Motor installment (Shared)" : "Annual Home Insurance",
            amount,
            currency,
            wallet: "Shared savings",
            requester: currentUser === "partner_a" ? partnerAName : partnerBName,
            waitingFor: currentUser === "partner_a" ? partnerBName : partnerAName,
            reason: gateway.reason,
            expiresIn: "24 hours",
            status: "Waiting for partner signature",
          },
        };
        setChatMessages((prev) => [...prev, seiyaReply]);
        return;
      }
    }

    // 5. Cooling-off hold
    if (lower.includes("jacket") || lower.includes("shoes") || lower.includes("flash-sale") || lower.includes("1250") || lower.includes("1.800")) {
      const isIDR = reportingCurrency === "IDR";
      const currency = isIDR ? "IDR" : "USD";
      const amount = isIDR ? 1_800_000 : 1250;

      const gateway = processGatewayDecision({
        actionType: "PURCHASE",
        title: isIDR ? "Flash-sale Limited Sneakers" : "Designer Jacket",
        amount,
        currency,
        wallet: "shared",
        timeOfDay: "23:40",
      });

      if (gateway.outcome === "HOLD") {
        const newHeld: HeldPurchase = {
          id: `hold-${Date.now()}`,
          title: isIDR ? "Flash-sale Limited Sneakers" : "Designer Jacket",
          amount,
          currency,
          wallet: "shared",
          requester: currentUser,
          status: "held",
          holdUntil: "Tomorrow at 08:00 (Local Time)",
          reason: gateway.reason,
          createdAt: new Date().toISOString(),
        };
        setHeldPurchases((prev) => [newHeld, ...prev]);

        const seiyaReply: ChatMessage = {
          id: `msg-${Date.now() + 1}`,
          sender: "seiya",
          text: `Placed on cooling-off hold. This is a couple-defined safeguard for purchases over threshold during the late-night window.`,
          timestamp: new Date().toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }),
          cardType: "ACTION_HOLD",
          cardData: {
            title: isIDR ? "Flash-sale Limited Sneakers" : "Designer Jacket",
            amount,
            currency,
            wallet: "Shared wallet",
            holdUntil: "Tomorrow, 08:00",
            reason: gateway.reason,
            heldId: newHeld.id,
          },
        };
        setChatMessages((prev) => [...prev, seiyaReply]);
        return;
      }
    }

    // 6. External transfer denial
    if (lower.includes("external") || (lower.includes("transfer") && lower.includes("account"))) {
      const seiyaReply: ChatMessage = {
        id: `msg-${Date.now() + 1}`,
        sender: "seiya",
        text: "Gateway Rule Violation: External bank account transfers are blocked. Seiya operates on couple-managed allocations only.",
        timestamp: new Date().toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }),
        cardType: "ACTION_DENY",
        cardData: {
          title: "External Wire Transfer",
          amount: 2000,
          currency: reportingCurrency,
          reason: "Direct transfer to external account is blocked by the Dual-Key Gateway.",
          safeAlternative: "Record internal couple allocations or joint goal contributions.",
        },
      };
      setChatMessages((prev) => [...prev, seiyaReply]);
      return;
    }

    // 7. Privacy breach denial
    if (lower.includes("private") || lower.includes("show all") || lower.includes("transactions of")) {
      const seiyaReply: ChatMessage = {
        id: `msg-${Date.now() + 1}`,
        sender: "seiya",
        text: `Privacy Guard Active: Under your Couple Contract, each partner's aggregate savings balance is visible, but detailed personal transactions are private.`,
        timestamp: new Date().toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }),
        cardType: "ACTION_DENY",
        cardData: {
          title: `Inspect Partner's Itemized Transactions`,
          reason: `Partner privacy rule protects line-item personal history. Only total balance is visible.`,
          safeAlternative: `View aggregate savings total on the Home dashboard or Wallets page.`,
        },
      };
      setChatMessages((prev) => [...prev, seiyaReply]);
      return;
    }

    // 8. Global Honeymoon Goal Plan (USD 2,000 or USD 6,000)
    if (lower.includes("vacation") || lower.includes("honeymoon") || lower.includes("kyoto") || lower.includes("20.000.000") || lower.includes("2000")) {
      const isIDR = reportingCurrency === "IDR";
      const currency = isIDR ? "IDR" : "USD";
      const target = isIDR ? 20_000_000 : 2000;
      const monthly = target / 10;
      const splitB = (monthly * 60) / 100;
      const splitA = (monthly * 40) / 100;

      const seiyaReply: ChatMessage = {
        id: `msg-${Date.now() + 1}`,
        sender: "seiya",
        text: `Here is a collaborative goal projection for your trip. Saving ${formatMoney(target, currency, locale)} in 10 months requires ${formatMoney(monthly, currency, locale)}/month.`,
        timestamp: new Date().toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }),
        cardType: "PLAN",
        cardData: {
          title: "Kyoto Vacation Trip",
          targetAmount: target,
          currency,
          horizon: "10 months",
          monthlyTarget: monthly,
          split: `${partnerBName} ${formatMoney(splitB, currency, locale)} • ${partnerAName} ${formatMoney(splitA, currency, locale)}`,
          fundingWallet: "Planned contributions",
          status: "Draft",
          assumptions: "Planned monthly contribution. Does not automatically debit any wallet. Awaiting partner approval.",
        },
      };
      setChatMessages((prev) => [...prev, seiyaReply]);
      return;
    }

    // Default friendly assistant fallback
    const fallbackReply: ChatMessage = {
      id: `msg-${Date.now() + 1}`,
      sender: "seiya",
      text: `Under your Couple Contract, I can record expenses, clarify budgets, analyze affordability, and safeguard mutual funds. How would you like to proceed?`,
      timestamp: new Date().toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }),
    };
    setChatMessages((prev) => [...prev, fallbackReply]);
  };

  const unreadNotificationsCount =
    approvals.filter((a) => a.status === "pending" && a.approver === currentUser).length +
    heldPurchases.filter((h) => h.status === "held").length +
    bills.filter((b) => b.daysRemaining <= 3).length;

  return (
    <AppContext.Provider
      value={{
        currentUser,
        setCurrentUser,
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
        setReportingCurrency,
        simulateMissingFXRate,
        setSimulateMissingFXRate,
        wallets,
        convertedBalances,
        monthlySummary,
        contract,
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
        undoTransaction,
        proposeContractChange,
        approveContractChange,
        sendChatMessage,
        payBill,
        settleUp,
        addPlan,
        updatePlan,
        deletePlan,
        addBill,
        editBill,
        deleteBill,
        requestPayBill,
        requestDeletePlan,
        approveApprovalRequest,
        declineApprovalRequest,
        applyDemoPreset,
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
