"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import { formatMoney, formatMoneyConverted, convertMoney, convertAmount, getTransactionCategoryVisual } from "@/lib/utils";
import { SolarIcon } from "@/components/icons/solar";
import { SeiyaIcon } from "@/components/icons/seiya-logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useApp, Transaction } from "@/lib/store";
import { dashboardLocale, greetingParts, longDate, type GreetingParts } from "@/lib/greeting";
import { ApprovalDialog } from "@/components/modals/approval-dialog";
import { TransactionDetailDialog } from "@/components/modals/transaction-detail-dialog";
import { ApprovalDeck } from "@/components/cards/approval-deck";
import { AllApprovalsModal } from "@/components/modals/all-approvals-modal";
import { BillDialog } from "@/components/modals/bill-dialog";
import { ProposeExpenseDialog } from "@/components/modals/propose-expense-dialog";
import { MOCK_FX_METADATA } from "@/lib/currency";
import { computeDashboardStats } from "@/lib/dashboard-stats";

function TrendSparkline({
  id,
  color,
  pathD,
  areaD,
}: {
  id: string;
  color: string;
  pathD: string;
  areaD: string;
}) {
  return (
    <svg
      viewBox="0 0 120 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="w-full h-full overflow-visible"
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0.0" />
        </linearGradient>
      </defs>
      <path d={areaD} fill={`url(#${id})`} />
      <path
        d={pathD}
        stroke={color}
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function AskSeiyaDirectChatBox({
  onNavigate,
  setPendingDirectChat,
  placeholder = "Ask Seiya or type an expense...",
}: {
  onNavigate: (tab: string) => void;
  setPendingDirectChat: (data: { message: string; attachedFileName?: string; mode?: "personal" | "shared" }) => void;
  placeholder?: string;
}) {
  const [text, setText] = useState("");
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() && !attachedFile) return;

    setPendingDirectChat({
      message: text.trim(),
      attachedFileName: attachedFile?.name,
      mode: "personal",
    });

    onNavigate("seiya");
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setAttachedFile(e.target.files[0]);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mt-2 pt-2 border-t border-[#d1c9bf]/40">
      {attachedFile && (
        <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-[8px] bg-[#fef9ef] border border-[#B45529]/30 text-xs text-[#2a2b2f] mb-2 animate-in fade-in-0 slide-in-from-bottom-1">
          <div className="flex items-center gap-1.5 min-w-0 truncate">
            <SolarIcon name="paperclip" size={13} className="text-[#B45529] shrink-0" />
            <span className="truncate font-medium text-[11px]">{attachedFile.name}</span>
          </div>
          <button
            type="button"
            onClick={() => setAttachedFile(null)}
            className="text-[#808988] hover:text-[#B45529] p-0.5 rounded-full cursor-pointer shrink-0"
            title="Remove attachment"
            aria-label="Remove attachment"
          >
            <SolarIcon name="close-circle" size={13} />
          </button>
        </div>
      )}

      {/* Curious Seiya Mascot peeking with paws resting directly on the chat textformfield */}
      <div className="relative">
        <div className="flex justify-center -mb-[5px] relative z-10 pointer-events-none select-none">
          <img
            src="/dashboard/CuriousSeiya-Dashboard.png"
            alt="Curious Seiya"
            className="w-40 sm:w-44 h-auto object-contain block drop-shadow-xs"
          />
        </div>

        <div className="relative z-0 flex items-center gap-1.5 bg-[#fef9ef] p-1.5 rounded-[12px] border border-[#d1c9bf] focus-within:border-[#B45529] focus-within:ring-2 focus-within:ring-[#B45529]/15 transition-all shadow-2xs">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            className="hidden"
            accept="image/*,.pdf,.doc,.docx,.txt"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className={`p-1.5 rounded-full transition-colors cursor-pointer shrink-0 ${
              attachedFile
                ? "bg-[#B45529]/15 text-[#B45529]"
                : "text-[#808988] hover:text-[#B45529] hover:bg-[#ece3d3]/60"
            }`}
            title="Attach receipt, bill, or document"
            aria-label="Attach file"
          >
            <SolarIcon name="paperclip" size={16} />
          </button>

          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={placeholder}
            className="flex-1 min-w-0 bg-transparent text-xs text-[#2a2b2f] placeholder-[#808988] focus:outline-none px-1"
          />

          <button
            type="submit"
            disabled={!text.trim() && !attachedFile}
            className="w-7 h-7 rounded-full bg-[#B45529] text-[#fef9ef] hover:bg-[#96421c] flex items-center justify-center shrink-0 disabled:opacity-35 disabled:cursor-not-allowed transition-all shadow-2xs cursor-pointer"
            title="Direct chat with Seiya"
            aria-label="Send direct message"
          >
            <SolarIcon name="arrow-right" size={13} />
          </button>
        </div>
      </div>
    </form>
  );
}

// `notice` (e.g. "Your partner hasn't joined yet") sits under the greeting so it
// never covers the landscape illustration at the top of the dashboard.
export function HomeView({ onNavigate, notice }: { onNavigate: (tab: any) => void; notice?: React.ReactNode }) {
  const {
    wallets,
    convertedBalances,
    reportingCurrency,
    locale,
    monthlySummary,
    transactions,
    approvals,
    bills,
    heldPurchases,
    currentUser,
    partnerAName,
    partnerBName,
    setPendingDirectChat,
    settlement,
    budgetSummary,
    walletsReady,
    partnerProfile,
    hideAmounts,
    household,
  } = useApp();

  // Opens Ask Seiya with this question; the chat view sends it and shows the reply.
  const askSeiya = (message: string) => {
    setPendingDirectChat({ message, mode: "personal" });
    onNavigate("seiya");
  };

  const activeName = currentUser === "partner_a" ? partnerAName : partnerBName;
  // Greeting and date follow the household's country and the device clock;
  // refreshed every minute so "morning" turns into "afternoon" on its own.
  const headerLocale = dashboardLocale(household?.country, locale);
  const [header, setHeader] = useState<{ parts: GreetingParts; date: string } | null>(null);
  useEffect(() => {
    const update = () => setHeader({ parts: greetingParts(headerLocale), date: longDate(headerLocale) });
    const first = window.setTimeout(update, 0);
    const timer = window.setInterval(update, 60_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [headerLocale]);

  const [selectedApproval, setSelectedApproval] = useState<any>(null);
  const [approvalModalOpen, setApprovalModalOpen] = useState(false);
  const [allApprovalsModalOpen, setAllApprovalsModalOpen] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [transactionModalOpen, setTransactionModalOpen] = useState(false);
  const [addBillModalOpen, setAddBillModalOpen] = useState(false);
  const [proposeExpenseModalOpen, setProposeExpenseModalOpen] = useState(false);
  const [txFilter, setTxFilter] = useState<"all" | "shared" | "partnerA" | "partnerB">("all");
  const [activeWeekIndex, setActiveWeekIndex] = useState<number | null>(null);
  const [showAskSeiyaInfo, setShowAskSeiyaInfo] = useState(false);
  const [showQuickActions, setShowQuickActions] = useState(false);
  const quickActionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (quickActionsRef.current && !quickActionsRef.current.contains(event.target as Node)) {
        setShowQuickActions(false);
      }
    }
    if (showQuickActions) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showQuickActions]);

  const pendingApprovalsCount = approvals.filter((a) => a.status === "pending").length;
  const urgentBillsCount = bills ? bills.filter((b) => b.status !== "paid" && b.daysRemaining <= 3).length : 0;
  const heldPurchasesCount = heldPurchases ? heldPurchases.length : 0;

  // All dashboard figures are derived from the household's real transactions.
  const stats = useMemo(
    () => computeDashboardStats(transactions, reportingCurrency, locale),
    [transactions, reportingCurrency, locale]
  );
  const weeklyOverviewData = stats.weeks;

  const activeWeek = activeWeekIndex !== null ? weeklyOverviewData[activeWeekIndex] : null;
  const tooltipLeftPercent = activeWeek
    ? Math.max(25, Math.min(75, (activeWeek.xCenter / 460) * 100))
    : 50;
  const arrowOffsetPercent = activeWeek
    ? ((activeWeek.xCenter / 460) * 100) - tooltipLeftPercent
    : 0;
  const tooltipTopPercent = activeWeek
    ? (Math.min(activeWeek.bar1.yTop, activeWeek.bar2.yTop) / 210) * 100
    : 0;

  const pendingApproval = approvals.find((a) => a.status === "pending");
  const upcomingBills = bills
    .filter((b) => b.status !== "paid" && b.daysRemaining >= 0 && b.daysRemaining <= 7)
    .sort((a, b) => a.daysRemaining - b.daysRemaining);

  const filteredTransactions = transactions.filter((t) => {
    if (txFilter === "shared") return t.wallet === "shared";
    if (txFilter === "partnerA") return t.wallet === "personal_a";
    if (txFilter === "partnerB") return t.wallet === "personal_b";
    return true;
  });

  const categories = useMemo(
    () => stats.categories.map((c) => ({ ...c, amount: formatMoney(c.value, reportingCurrency, locale) })),
    [stats.categories, reportingCurrency, locale]
  );

  // Donut segments on a circle with r=38 (circumference ~238.76).
  const donutSegments = useMemo(() => {
    const circumference = 2 * Math.PI * 38;
    const lengths = stats.categories.map((c) => c.share * circumference);
    return stats.categories.map((c, i) => {
      const offset = lengths.slice(0, i).reduce((sum, len) => sum + len, 0);
      return { name: c.name, color: c.color, dash: `${lengths[i].toFixed(1)} ${circumference.toFixed(1)}`, offset: -offset };
    });
  }, [stats.categories]);

  const formatChange = (change: number | null) =>
    change === null ? null : `${Math.abs(change).toFixed(change !== 0 && Math.abs(change) < 10 ? 1 : 0)}%`;

  const hasMonthData = stats.income > 0 || stats.expenses > 0 || stats.savings > 0;
  const yLabels = useMemo(() => {
    if (!hasMonthData) return { top: "", midTop: "", midBottom: "", zero: "0" };
    if (hideAmounts) return { top: "•••", midTop: "•••", midBottom: "•••", zero: "0" };
    const k6 = stats.scaleMax;
    const k4 = (stats.scaleMax * 2) / 3;
    const k2 = stats.scaleMax / 3;
    const formatCompact = (val: number) => {
      const short = (n: number) => (n < 10 ? n.toFixed(1).replace(/\.0$/, "") : n.toFixed(0));
      if (val >= 1_000_000) return `${short(val / 1_000_000)}M`;
      if (val >= 1_000) return `${short(val / 1_000)}k`;
      return Math.round(val).toString();
    };
    return {
      top: formatCompact(k6),
      midTop: formatCompact(k4),
      midBottom: formatCompact(k2),
      zero: "0",
    };
  }, [stats.scaleMax, hasMonthData, hideAmounts]);

  const isPartnerA = currentUser === "partner_a";

  // Wallets only exist after both partners agree on Seiya's Promise.
  const walletStatus = (cardId: string) => {
    if (cardId === "partner-wallet" && !partnerProfile) return "Waiting for your partner to join";
    if (!walletsReady) return "Opens after Seiya's Promise";
    return null;
  };

  const walletCards = [
    // 1. Your Balance (Always leftmost / paling kiri)
    {
      id: "your-wallet",
      avatar: isPartnerA ? "/dashboard/Profile-Card-Man.png" : "/dashboard/Profile-Card-Women.png",
      alt: `${isPartnerA ? partnerAName : partnerBName} avatar`,
      shouldFlip: !isPartnerA, // When cewe is on the left, reverse horizontal so she faces right towards partner
      label: "Your balance",
      currency: isPartnerA ? wallets.personalA.currency : wallets.personalB.currency,
      balance: isPartnerA ? wallets.personalA.balance : wallets.personalB.balance,
      converted: isPartnerA ? convertedBalances.personalA : convertedBalances.personalB,
      chartColor: isPartnerA ? "#2d5232" : "#B45529", // Cowo: Green (#2d5232), Cewe: Terracotta (#B45529)
      chartId: isPartnerA ? "sparkline-cowo-card1" : "sparkline-cewe-card1",
      pathD: isPartnerA
        ? "M 0,36 C 14,35 22,25 36,29 C 50,33 62,15 78,19 C 92,23 104,9 120,5"
        : "M 0,38 C 16,33 28,31 44,35 C 58,38 72,21 88,25 C 100,28 110,13 120,9",
      areaD: isPartnerA
        ? "M 0,36 C 14,35 22,25 36,29 C 50,33 62,15 78,19 C 92,23 104,9 120,5 L 120,48 L 0,48 Z"
        : "M 0,38 C 16,33 28,31 44,35 C 58,38 72,21 88,25 C 100,28 110,13 120,9 L 120,48 L 0,48 Z",
      badgeClass: isPartnerA
        ? "bg-[#edf3ec] text-[#2d5232] border-[#2d5232]/25"
        : "bg-[#faeade] text-[#B45529] border-[#B45529]/25",
    },
    // 2. Partner Balance (Middle)
    {
      id: "partner-wallet",
      avatar: isPartnerA ? "/dashboard/Profile-Card-Women.png" : "/dashboard/Profile-Card-Man.png",
      alt: `${isPartnerA ? partnerBName : partnerAName} avatar`,
      shouldFlip: !isPartnerA, // When partner is cowo, reverse horizontal so he faces left towards partner
      label: "Partner balance",
      currency: isPartnerA ? wallets.personalB.currency : wallets.personalA.currency,
      balance: isPartnerA ? wallets.personalB.balance : wallets.personalA.balance,
      converted: isPartnerA ? convertedBalances.personalB : convertedBalances.personalA,
      chartColor: isPartnerA ? "#B45529" : "#2d5232", // Cewe: Terracotta (#B45529), Cowo: Green (#2d5232)
      chartId: isPartnerA ? "sparkline-cewe-card2" : "sparkline-cowo-card2",
      pathD: isPartnerA
        ? "M 0,38 C 16,33 28,31 44,35 C 58,38 72,21 88,25 C 100,28 110,13 120,9"
        : "M 0,36 C 14,35 22,25 36,29 C 50,33 62,15 78,19 C 92,23 104,9 120,5",
      areaD: isPartnerA
        ? "M 0,38 C 16,33 28,31 44,35 C 58,38 72,21 88,25 C 100,28 110,13 120,9 L 120,48 L 0,48 Z"
        : "M 0,36 C 14,35 22,25 36,29 C 50,33 62,15 78,19 C 92,23 104,9 120,5 L 120,48 L 0,48 Z",
      badgeClass: isPartnerA
        ? "bg-[#faeade] text-[#B45529] border-[#B45529]/25"
        : "bg-[#edf3ec] text-[#2d5232] border-[#2d5232]/25",
    },
    // 3. Shared Balance (Rightmost / full width on mobile)
    {
      id: "shared-wallet",
      avatar: "/dashboard/Profile-Card-Shared.png",
      alt: "Shared pool avatar",
      shouldFlip: false,
      label: "Shared balance",
      currency: wallets.shared.currency,
      balance: wallets.shared.balance,
      converted: convertedBalances.shared,
      chartColor: "#C98A4F", // Shared: Honey Amber (#C98A4F)
      chartId: "sparkline-shared-card3",
      pathD: "M 0,39 C 18,37 26,23 42,27 C 58,31 74,15 90,18 C 102,21 112,11 120,7",
      areaD: "M 0,39 C 18,37 26,23 42,27 C 58,31 74,15 90,18 C 102,21 112,11 120,7 L 120,48 L 0,48 Z",
      badgeClass: "bg-[#fef4e8] text-[#C98A4F] border-[#C98A4F]/30",
    },
  ];

  return (
    <div className="space-y-6 pb-20 md:pb-12 max-w-7xl mx-auto">
      {/* 0. DASHBOARD HEADER & QUICK ACTIONS TOOLBAR */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pt-1 sm:pt-4 pb-2">
        <div>
          <h2 className="text-2xl sm:text-3xl lg:text-[34px] font-serif text-[#2a2b2f] font-normal tracking-tight leading-tight">
            {header ? header.parts.greeting : " "}
            {header?.parts.separator}
            <span className="font-semibold text-[#B45529]">{activeName}</span>
            {header?.parts.suffix}
          </h2>
          <div className="flex items-center gap-2 text-xs sm:text-sm text-[#808988] mt-1 font-medium">
            <SolarIcon name="calendar" size={14} className="text-[#B45529]/80 shrink-0" />
            <span lang={headerLocale}>{header?.date ?? " "}</span>
          </div>
        </div>

        {/* Action Buttons with Dropdown - positioned below mascots on uncropped wallpaper */}
        <div className="relative flex items-center gap-2 self-start sm:self-auto sm:mt-16 lg:mt-20 flex-wrap sm:flex-nowrap" ref={quickActionsRef}>
          {/* 1. Propose Expense */}
          <button
            type="button"
            onClick={() => setProposeExpenseModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-white hover:bg-[#fcf7ee] text-[#2a2b2f] border border-[#e8dfd5] text-xs font-semibold shadow-2xs hover:shadow-xs hover:border-[#B45529]/40 transition-all cursor-pointer active:scale-97 shrink-0"
            title="Propose a new expense"
          >
            <SolarIcon name="plus" size={14} className="text-[#B45529]" />
            <span>Propose Expense</span>
          </button>

          {/* 2. Add Goal */}
          <button
            type="button"
            onClick={() => onNavigate("add_goal")}
            className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-white hover:bg-[#fcf7ee] text-[#2a2b2f] border border-[#e8dfd5] text-xs font-semibold shadow-2xs hover:shadow-xs hover:border-[#B45529]/40 transition-all cursor-pointer active:scale-97 shrink-0"
            title="Add a new collaborative goal"
          >
            <SolarIcon name="chart" size={14} className="text-[#B45529]" />
            <span>Add Goal</span>
          </button>

          {/* 3. Add Bill */}
          <button
            type="button"
            onClick={() => setAddBillModalOpen(true)}
            className="hidden md:inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-white hover:bg-[#fcf7ee] text-[#2a2b2f] border border-[#e8dfd5] text-xs font-semibold shadow-2xs hover:shadow-xs hover:border-[#B45529]/40 transition-all cursor-pointer active:scale-97 shrink-0"
            title="Add a recurring bill reminder"
          >
            <SolarIcon name="receipt" size={14} className="text-[#B45529]" />
            <span>Add Bill</span>
          </button>

          {/* 4. Settle Balances */}
          <button
            type="button"
            onClick={() => onNavigate("wallets")}
            className="hidden xl:inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-white hover:bg-[#fcf7ee] text-[#2a2b2f] border border-[#e8dfd5] text-xs font-semibold shadow-2xs hover:shadow-xs hover:border-[#B45529]/40 transition-all cursor-pointer active:scale-97 shrink-0"
            title="Settle up couple balances"
          >
            <SolarIcon name="users-group-rounded" size={14} className="text-[#C98A4F]" />
            <span>Settle Up</span>
          </button>

          {/* 5. More Actions Dropdown Toggle */}
          <button
            type="button"
            onClick={() => setShowQuickActions((prev) => !prev)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-[#B45529] hover:bg-[#9a461e] text-[#fef9ef] text-xs font-semibold shadow-[0_2px_10px_rgba(180,85,41,0.28)] hover:shadow-[0_4px_16px_rgba(180,85,41,0.38)] transition-all cursor-pointer active:scale-97 shrink-0"
            aria-expanded={showQuickActions}
            aria-haspopup="true"
            title="More couple actions"
          >
            <SolarIcon name="bolt" size={14} className="text-[#fef9ef]" />
            <span>More</span>
            <SolarIcon
              name="arrow-down"
              size={12}
              className={`text-[#fef9ef]/80 transition-transform duration-200 ${showQuickActions ? "rotate-180" : ""}`}
            />
          </button>

          {/* Quick Actions Dropdown Menu */}
          {showQuickActions && (
            <div className="absolute right-0 top-full mt-2 w-[calc(100vw-2rem)] sm:w-[380px] max-w-sm bg-[#fef9ef] rounded-[20px] shadow-[0_16px_40px_-6px_rgba(42,43,47,0.2)] border border-[#e8dfd5] p-3 z-50 animate-in fade-in-0 zoom-in-95 origin-top-right">
              {/* Menu Header */}
              <div className="flex items-center justify-between px-2 pt-1 pb-2 border-b border-[#e8dfd5]/80">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-[#B45529]/10 text-[#B45529] flex items-center justify-center">
                    <SolarIcon name="bolt" size={13} />
                  </div>
                  <div>
                    <span className="text-xs font-serif font-bold text-[#2a2b2f] block leading-none">
                      Quick Actions
                    </span>
                    <span className="text-[10px] text-[#808988]">Fast 1-click couple shortcuts</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowQuickActions(false)}
                  className="w-6 h-6 rounded-full hover:bg-[#f5eee1] text-[#808988] hover:text-[#2a2b2f] flex items-center justify-center transition-colors text-xs font-bold"
                  aria-label="Close Quick Actions"
                >
                  ✕
                </button>
              </div>

              {/* Action List */}
              <div className="py-2 space-y-1">
                {/* 1. Propose Shared Expense */}
                <button
                  type="button"
                  onClick={() => {
                    setProposeExpenseModalOpen(true);
                    setShowQuickActions(false);
                  }}
                  className="w-full flex items-center justify-between p-2.5 rounded-[14px] hover:bg-[#f5eee1] transition-all text-left group cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-[#faeade] text-[#B45529] flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                      <SolarIcon name="receipt" size={18} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-[#2a2b2f] group-hover:text-[#B45529] transition-colors truncate">
                        Propose Shared Expense
                      </div>
                      <div className="text-[11px] text-[#808988] truncate">
                        Draft an expense with split ratio via Seiya
                      </div>
                    </div>
                  </div>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#f5eee1] text-[#B45529] border border-[#d1c9bf]/50 shrink-0 ml-2">
                    AI Split
                  </span>
                </button>

                {/* 2. Dual-Key Approvals */}
                <button
                  type="button"
                  onClick={() => {
                    onNavigate("approvals");
                    setShowQuickActions(false);
                  }}
                  className="w-full flex items-center justify-between p-2.5 rounded-[14px] hover:bg-[#f5eee1] transition-all text-left group cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-[#fbe7e0] text-[#a34426] flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                      <SolarIcon name="shield-check" size={18} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-[#2a2b2f] group-hover:text-[#B45529] transition-colors truncate">
                        Dual-Key Approvals
                      </div>
                      <div className="text-[11px] text-[#808988] truncate">
                        Sign off on mutual high-value transactions
                      </div>
                    </div>
                  </div>
                  {pendingApprovalsCount > 0 ? (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#B45529] text-[#fef9ef] shrink-0 ml-2 animate-pulse">
                      {pendingApprovalsCount} Pending
                    </span>
                  ) : (
                    <SolarIcon name="arrow-right" size={14} className="text-[#808988] group-hover:text-[#B45529] group-hover:translate-x-0.5 transition-all shrink-0 ml-2" />
                  )}
                </button>

                {/* 3. Settle Balances */}
                <button
                  type="button"
                  onClick={() => {
                    onNavigate("wallets");
                    setShowQuickActions(false);
                  }}
                  className="w-full flex items-center justify-between p-2.5 rounded-[14px] hover:bg-[#f5eee1] transition-all text-left group cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-[#fef3db] text-[#C98A4F] flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                      <SolarIcon name="users-group-rounded" size={18} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-[#2a2b2f] group-hover:text-[#B45529] transition-colors truncate">
                        Settle Balances
                      </div>
                      <div className="text-[11px] text-[#808988] truncate">
                        Transfer & clear couple debt calculation
                      </div>
                    </div>
                  </div>
                  <SolarIcon name="arrow-right" size={14} className="text-[#808988] group-hover:text-[#B45529] group-hover:translate-x-0.5 transition-all shrink-0 ml-2" />
                </button>

                {/* 4. Pay Upcoming Bills */}
                <button
                  type="button"
                  onClick={() => {
                    onNavigate("bills");
                    setShowQuickActions(false);
                  }}
                  className="w-full flex items-center justify-between p-2.5 rounded-[14px] hover:bg-[#f5eee1] transition-all text-left group cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-[#e6efe7] text-[#2d5232] flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                      <SolarIcon name="calendar" size={18} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-[#2a2b2f] group-hover:text-[#B45529] transition-colors truncate">
                        Pay Upcoming Bills
                      </div>
                      <div className="text-[11px] text-[#808988] truncate">
                        Review utilities, rent, and subscriptions
                      </div>
                    </div>
                  </div>
                  {urgentBillsCount > 0 ? (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#e39c83] text-[#3B1D17] shrink-0 ml-2">
                      {urgentBillsCount} Due soon
                    </span>
                  ) : (
                    <SolarIcon name="arrow-right" size={14} className="text-[#808988] group-hover:text-[#B45529] group-hover:translate-x-0.5 transition-all shrink-0 ml-2" />
                  )}
                </button>

                {/* 5. Add New Goal */}
                <button
                  type="button"
                  onClick={() => {
                    onNavigate("add_goal");
                    setShowQuickActions(false);
                  }}
                  className="w-full flex items-center justify-between p-2.5 rounded-[14px] hover:bg-[#f5eee1] transition-all text-left group cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-[#faece0] text-[#8f3916] flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                      <SolarIcon name="chart" size={18} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-[#2a2b2f] group-hover:text-[#B45529] transition-colors truncate">
                        Add New Goal
                      </div>
                      <div className="text-[11px] text-[#808988] truncate">
                        Plan holiday, wedding, or emergency fund
                      </div>
                    </div>
                  </div>
                  <SolarIcon name="arrow-right" size={14} className="text-[#808988] group-hover:text-[#B45529] group-hover:translate-x-0.5 transition-all shrink-0 ml-2" />
                </button>

                {/* 6. Add Recurring Bill */}
                <button
                  type="button"
                  onClick={() => {
                    setAddBillModalOpen(true);
                    setShowQuickActions(false);
                  }}
                  className="w-full flex items-center justify-between p-2.5 rounded-[14px] hover:bg-[#f5eee1] transition-all text-left group cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-[#faeade] text-[#B45529] flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                      <SolarIcon name="receipt" size={18} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-[#2a2b2f] group-hover:text-[#B45529] transition-colors truncate">
                        Add Recurring Bill
                      </div>
                      <div className="text-[11px] text-[#808988] truncate">
                        Schedule rent, utilities, or subscriptions
                      </div>
                    </div>
                  </div>
                  <SolarIcon name="arrow-right" size={14} className="text-[#808988] group-hover:text-[#B45529] group-hover:translate-x-0.5 transition-all shrink-0 ml-2" />
                </button>

                {/* 6. Review Waiting List */}
                <button
                  type="button"
                  onClick={() => {
                    onNavigate("waiting_list");
                    setShowQuickActions(false);
                  }}
                  className="w-full flex items-center justify-between p-2.5 rounded-[14px] hover:bg-[#f5eee1] transition-all text-left group cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-[#edebe8] text-[#515151] flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                      <SolarIcon name="clock-circle" size={18} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-[#2a2b2f] group-hover:text-[#B45529] transition-colors truncate">
                        Cooling-Off Holds
                      </div>
                      <div className="text-[11px] text-[#808988] truncate">
                        Items paused for intentional cooling period
                      </div>
                    </div>
                  </div>
                  {heldPurchasesCount > 0 ? (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#edebe8] text-[#515151] border border-[#d1c9bf]/60 shrink-0 ml-2">
                      {heldPurchasesCount} Held
                    </span>
                  ) : (
                    <SolarIcon name="arrow-right" size={14} className="text-[#808988] group-hover:text-[#B45529] group-hover:translate-x-0.5 transition-all shrink-0 ml-2" />
                  )}
                </button>
              </div>

              {/* Menu Footer */}
              <div className="pt-2 border-t border-[#e8dfd5]/80 px-2 flex items-center justify-between text-[11px] text-[#808988]">
                <span className="flex items-center gap-1">
                  <SolarIcon name="sparkles" size={12} className="text-[#B45529]" />
                  <span>Dual-Key protected</span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    onNavigate("seiya");
                    setShowQuickActions(false);
                  }}
                  className="text-[#B45529] font-semibold hover:underline cursor-pointer"
                >
                  Chat with Seiya →
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {notice}

      {/* 1. THREE DISTINCTIVE WHITE CARDS WITH BORDER & COLORED CHARTS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
        {walletCards.map((card, idx) => (
          <div
            key={card.id}
            className={`p-5 sm:p-6 rounded-[22px] bg-white border border-[#e8dfd5] shadow-[0_2px_12px_-2px_rgba(42,43,47,0.06)] flex flex-col justify-between transition-all hover:translate-y-[-1px] hover:shadow-[0_8px_24px_-4px_rgba(42,43,47,0.09)] ${
              idx === 2 ? "sm:col-span-2 lg:col-span-1" : ""
            }`}
          >
            <div className="flex items-center justify-between mb-3.5">
              <div className="flex items-center gap-3">
                <img
                  src={card.avatar}
                  alt={card.alt}
                  style={{ transform: card.shouldFlip ? "scaleX(-1)" : "none" }}
                  className="w-10 h-10 sm:w-11 sm:h-11 rounded-full object-cover shrink-0 shadow-2xs border border-[#ecd9c7] transition-transform duration-300"
                />
                <span className="text-xs sm:text-[13px] font-semibold text-[#515151] tracking-tight">
                  {card.label}
                </span>
              </div>
              <span
                className={`text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full border shadow-2xs ${card.badgeClass}`}
              >
                {card.currency}
              </span>
            </div>

            <div className="flex items-end justify-between gap-3 mt-2">
              <div className="min-w-0">
                <div className="text-2xl sm:text-[28px] font-bold text-[#2a2b2f] tracking-tight font-serif leading-none">
                  {formatMoney(card.balance, card.currency, locale)}
                </div>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  {walletStatus(card.id) && (
                    <span className="text-[11px] text-[#808988] font-medium">{walletStatus(card.id)}</span>
                  )}
                  {card.currency !== reportingCurrency && (
                    <span className="text-[11px] text-[#808988] font-medium">
                      {!card.converted.available ? (
                        <span className="text-[#a34426]">FX unavail.</span>
                      ) : (
                        <span>
                          ≈ {formatMoney(card.converted.amount, reportingCurrency, locale)}{" "}
                          <span className="text-[#a3abaa] font-normal">est.</span>
                        </span>
                      )}
                    </span>
                  )}
                </div>
              </div>

              {/* Decorative wave, shown only once the wallet holds money */}
              {card.balance > 0 && !walletStatus(card.id) && (
                <div className="shrink-0 w-24 sm:w-28 h-10 sm:h-12">
                  <TrendSparkline
                    id={card.chartId}
                    color={card.chartColor}
                    pathD={card.pathD}
                    areaD={card.areaD}
                  />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>



      {/* 3. MONTHLY OVERVIEW & ASK SEIYA (Side-by-side on desktop, stacked on mobile) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-stretch">
        {/* Left / Main: Monthly Overview Stacked Bar Chart */}
        <div className="xl:col-span-8 p-5 sm:p-7 rounded-[24px] bg-white border border-[#e8dfd5] shadow-[0_2px_14px_-2px_rgba(42,43,47,0.06)] flex flex-col justify-between">
          {/* Header Row */}
          <div className="flex items-start sm:items-center justify-between pb-4 border-b border-[#e8dfd5]/60 mb-5">
            <div>
              <h3 className="text-xl sm:text-2xl font-serif font-normal text-[#2a2b2f] tracking-tight">
                Monthly Overview
              </h3>
              <p className="text-xs text-[#808988] mt-0.5">
                {stats.monthLabel}
              </p>
            </div>
            <button
              onClick={() => onNavigate("activity")}
              className="text-xs font-semibold text-[#B45529] border border-[#B45529]/40 hover:bg-[#B45529]/10 rounded-full px-4 py-1.5 transition-all inline-flex items-center gap-1.5 cursor-pointer shadow-2xs"
            >
              <span>View Details</span>
              <span className="text-sm leading-none">→</span>
            </button>
          </div>

          {/* 2-Column Body: Chart on Left, Summary Stats on Right */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center flex-1">
            {/* Left: Bar Chart */}
            <div className="lg:col-span-7 flex flex-col justify-between">
              {/* Legend & Instructions */}
              <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
                <div className="flex items-center gap-4 sm:gap-6 text-xs text-[#515151]">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#557353]" />
                    <span className="font-medium">Income</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#e39c83]" />
                    <span className="font-medium">Expenses</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#e6c19c]" />
                    <span className="font-medium">Savings</span>
                  </div>
                </div>
                <span className="text-[11px] text-[#808988] font-medium hidden sm:inline-flex items-center gap-1">
                  Hover or tap bars for details
                </span>
              </div>

              {/* Interactive SVG Chart Container with Tooltip */}
              <div
                className="relative w-full pt-1"
                onClick={() => setActiveWeekIndex(null)}
              >
                {/* Floating Tooltip */}
                {activeWeek && (
                  <div
                    className="absolute z-30 pointer-events-none transition-all duration-150 animate-in fade-in-0 zoom-in-95 shadow-[0_12px_28px_rgba(0,0,0,0.24)] rounded-[14px] bg-[#2a2b2f] text-[#fef9ef] p-3 text-xs border border-white/15 min-w-[170px]"
                    style={{
                      left: `${tooltipLeftPercent}%`,
                      top: `${tooltipTopPercent}%`,
                      transform: "translate(-50%, calc(-100% - 12px))",
                    }}
                  >
                    <div className="flex items-center justify-between gap-3 border-b border-white/15 pb-1.5 mb-2">
                      <span className="font-bold text-xs text-white tracking-tight">{activeWeek.period}</span>
                      <span className="text-[10px] text-[#e8a58c] font-mono font-medium">Breakdown</span>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-4">
                        <span className="flex items-center gap-1.5 text-white/75 text-[11px]">
                          <span className="w-2 h-2 rounded-full bg-[#557353] shrink-0" />
                          <span>Income:</span>
                        </span>
                        <span className="font-serif font-bold text-xs text-[#86efac]">
                          +{formatMoney(activeWeek.income, reportingCurrency, locale)}
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-4">
                        <span className="flex items-center gap-1.5 text-white/75 text-[11px]">
                          <span className="w-2 h-2 rounded-full bg-[#e39c83] shrink-0" />
                          <span>Expenses:</span>
                        </span>
                        <span className="font-serif font-bold text-xs text-[#fca5a5]">
                          -{formatMoney(activeWeek.expenses, reportingCurrency, locale)}
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-4 pt-1 border-t border-white/10">
                        <span className="flex items-center gap-1.5 text-white/75 text-[11px]">
                          <span className="w-2 h-2 rounded-full bg-[#e6c19c] shrink-0" />
                          <span>Savings:</span>
                        </span>
                        <span className="font-serif font-bold text-xs text-[#fde047]">
                          {formatMoney(activeWeek.savings, reportingCurrency, locale)}
                        </span>
                      </div>
                    </div>

                    {/* Downward indicator triangle */}
                    <div
                      className="absolute -bottom-1.5 w-3 h-3 bg-[#2a2b2f] rotate-45 border-r border-b border-white/15"
                      style={{
                        left: `calc(50% + ${arrowOffsetPercent}%)`,
                        transform: "translateX(-50%) rotate(45deg)",
                      }}
                    />
                  </div>
                )}

                <svg
                  viewBox="0 0 460 210"
                  className="w-full h-auto overflow-visible select-none"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  {!hasMonthData && (
                    <text x="245" y="100" textAnchor="middle" fill="#a3abaa" fontSize="12" fontFamily="serif">
                      No transactions yet this month
                    </text>
                  )}
                  {/* Horizontal Gridlines & Y-Axis labels */}
                  <text x="0" y="24" fill="#808988" fontSize="10" fontFamily="serif" fontWeight="bold">{yLabels.top}</text>
                  <line x1="32" y1="20" x2="455" y2="20" stroke="#e8dfd5" strokeWidth="1" strokeDasharray="3 3" opacity="0.6" />

                  <text x="0" y="74" fill="#808988" fontSize="10" fontFamily="serif" fontWeight="bold">{yLabels.midTop}</text>
                  <line x1="32" y1="70" x2="455" y2="70" stroke="#e8dfd5" strokeWidth="1" strokeDasharray="3 3" opacity="0.6" />

                  <text x="0" y="124" fill="#808988" fontSize="10" fontFamily="serif" fontWeight="bold">{yLabels.midBottom}</text>
                  <line x1="32" y1="120" x2="455" y2="120" stroke="#e8dfd5" strokeWidth="1" strokeDasharray="3 3" opacity="0.6" />

                  <text x="0" y="174" fill="#808988" fontSize="10" fontFamily="serif" fontWeight="bold">{yLabels.zero}</text>
                  <line x1="32" y1="170" x2="455" y2="170" stroke="#e8dfd5" strokeWidth="1.2" opacity="0.9" />

                  {/* 4 Interactive Weekly Bars */}
                  {weeklyOverviewData.map((week, idx) => {
                    const isCurrentActive = activeWeekIndex === idx;
                    const isAnyActive = activeWeekIndex !== null;
                    const opacity = isAnyActive ? (isCurrentActive ? 1 : 0.35) : 1;

                    return (
                      <g
                        key={week.id}
                        className="transition-all duration-200 cursor-pointer"
                        style={{ opacity }}
                        onMouseEnter={() => setActiveWeekIndex(idx)}
                        onMouseLeave={() => setActiveWeekIndex(null)}
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveWeekIndex(activeWeekIndex === idx ? null : idx);
                        }}
                        onTouchStart={(e) => {
                          e.stopPropagation();
                          setActiveWeekIndex(activeWeekIndex === idx ? null : idx);
                        }}
                      >
                        {/* Active highlight background pill */}
                        {isCurrentActive && (
                          <rect
                            x={week.xCenter - 26}
                            y={15}
                            width={52}
                            height={160}
                            rx={8}
                            fill="#B45529"
                            fillOpacity={0.07}
                            className="transition-all duration-200"
                          />
                        )}

                        {/* Bar 1 (Income / Expense stack) */}
                        <rect x={week.b1X} y={week.bar1.yBottom} width="18" height={week.bar1.hBottom} fill="#e39c83" />
                        <rect x={week.b1X} y={week.bar1.yMid} width="18" height={week.bar1.hMid} fill="#9fb497" />
                        <rect x={week.b1X} y={week.bar1.yTop} width="18" height={week.bar1.hTop} rx="4" fill="#557353" />
                        <rect x={week.b1X} y={week.bar1.yTop + 14} width="18" height={Math.max(0, week.bar1.hTop - 14)} fill="#557353" />

                        {/* Bar 2 (Savings stack) */}
                        <rect x={week.b2X} y={week.bar2.yBottom} width="18" height={week.bar2.hBottom} fill="#db8563" />
                        <rect x={week.b2X} y={week.bar2.yMid} width="18" height={week.bar2.hMid} fill="#efa889" />
                        <rect x={week.b2X} y={week.bar2.yTop} width="18" height={week.bar2.hTop} rx="4" fill="#e6c19c" />
                        <rect x={week.b2X} y={week.bar2.yTop + 14} width="18" height={Math.max(0, week.bar2.hTop - 14)} fill="#e6c19c" />

                        {/* X-axis Label */}
                        <text
                          x={week.xCenter}
                          y="194"
                          fill={isCurrentActive ? "#B45529" : "#808988"}
                          fontWeight={isCurrentActive ? "700" : "400"}
                          fontSize="11"
                          fontFamily="sans-serif"
                          textAnchor="middle"
                        >
                          {week.label}
                        </text>

                        {/* Transparent touch & hover hit-area */}
                        <rect
                          x={week.xCenter - 28}
                          y={15}
                          width={56}
                          height={185}
                          fill="transparent"
                        />
                      </g>
                    );
                  })}
                </svg>
              </div>
            </div>

            {/* Right: Summary Stats List */}
            <div className="lg:col-span-5 lg:border-l lg:border-[#e8dfd5]/80 lg:pl-8 pt-4 lg:pt-0 space-y-4">
              {/* Total Income */}
              <div>
                <span className="text-xs text-[#515151] font-medium block mb-1">
                  Total Income
                </span>
                <div className="flex items-center justify-between">
                  <div className="text-2xl sm:text-[28px] font-serif font-bold text-[#2a2b2f] tracking-tight">
                    {formatMoney(stats.income, reportingCurrency, locale)}
                  </div>
                  {formatChange(stats.incomeChange) && (
                    <div className={`flex items-center gap-0.5 text-xs font-bold ${(stats.incomeChange ?? 0) >= 0 ? "text-[#2d5232]" : "text-[#a34426]"}`}>
                      <span className="text-[11px]">{(stats.incomeChange ?? 0) >= 0 ? "↑" : "↓"}</span>
                      <span>{formatChange(stats.incomeChange)}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="border-b border-[#e8dfd5]/80" />

              {/* Total Expenses */}
              <div>
                <span className="text-xs text-[#515151] font-medium block mb-1">
                  Total Expenses
                </span>
                <div className="flex items-center justify-between">
                  <div className="text-2xl sm:text-[28px] font-serif font-bold text-[#B45529] tracking-tight">
                    {formatMoney(stats.expenses, reportingCurrency, locale)}
                  </div>
                  {formatChange(stats.expensesChange) && (
                    <div className={`flex items-center gap-0.5 text-xs font-bold ${(stats.expensesChange ?? 0) >= 0 ? "text-[#a34426]" : "text-[#2d5232]"}`}>
                      <span className="text-[11px]">{(stats.expensesChange ?? 0) >= 0 ? "↑" : "↓"}</span>
                      <span>{formatChange(stats.expensesChange)}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="border-b border-[#e8dfd5]/80" />

              {/* Savings */}
              <div>
                <span className="text-xs text-[#515151] font-medium block mb-1">
                  Savings
                </span>
                <div className="flex items-center justify-between">
                  <div className="text-2xl sm:text-[28px] font-serif font-bold text-[#2a2b2f] tracking-tight">
                    {formatMoney(stats.savings, reportingCurrency, locale)}
                  </div>
                  {formatChange(stats.savingsChange) && (
                    <div className={`flex items-center gap-0.5 text-xs font-bold ${(stats.savingsChange ?? 0) >= 0 ? "text-[#2d5232]" : "text-[#a34426]"}`}>
                      <span className="text-[11px]">{(stats.savingsChange ?? 0) >= 0 ? "↑" : "↓"}</span>
                      <span>{formatChange(stats.savingsChange)}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right / Beside: Ask Seiya Card (Visible on Desktop xl+, hidden on mobile/tablet) */}
        <div
          className="hidden xl:flex xl:col-span-4 p-6 sm:p-7 rounded-[24px] shadow-sm relative overflow-hidden flex-col justify-between"
          style={{
            background: "linear-gradient(135deg, #f7efe4 0%, #ebdfce 100%)",
          }}
        >
          <div>
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <div className="flex items-center gap-2 text-[#B45529]">
                <SeiyaIcon size={24} color="#B45529" />
                <h3 className="text-xl font-serif font-normal text-[#2a2b2f]">
                  Ask Seiya
                </h3>
              </div>

              {/* Circle 'i' toggle button */}
              <button
                type="button"
                onClick={() => setShowAskSeiyaInfo((prev) => !prev)}
                aria-label={showAskSeiyaInfo ? "Sembunyikan penjelasan" : "Lihat penjelasan Ask Seiya"}
                title={showAskSeiyaInfo ? "Tutup penjelasan" : "Lihat penjelasan fitur Ask Seiya"}
                className={`w-6 h-6 rounded-full flex items-center justify-center transition-all cursor-pointer shadow-2xs ${
                  showAskSeiyaInfo
                    ? "bg-[#B45529] text-[#fef9ef] scale-105"
                    : "bg-[#fef9ef] text-[#808988] hover:text-[#B45529]"
                }`}
              >
                <SolarIcon name="info-circle" size={15} />
              </button>
            </div>

            {showAskSeiyaInfo && (
              <div className="p-3 rounded-[10px] bg-[#fef9ef]/80 border border-[#d1c9bf]/40 text-xs text-[#515151] mb-2 animate-in fade-in-0 slide-in-from-top-1">
                Let’s make your next financial decision a little easier. Propose expenses, test cooling-off rules, or plan shared goals.
              </div>
            )}
          </div>

          {/* Bottom container: Quick prompts, Direct Chat Box & Footer note aligned to bottom end */}
          <div className="mt-auto pt-4 flex flex-col justify-end space-y-3">
            {/* Quick prompt buttons (Stacked on desktop sidebar card) */}
            <div className="space-y-2">
              <button
                onClick={() => {
                  askSeiya("I want to log a shared expense.");
                }}
                className="w-full p-3 bg-[#fef9ef] hover:bg-[#fffdf9] text-left rounded-[12px] text-xs font-semibold text-[#2a2b2f] shadow-xs transition-all cursor-pointer flex items-center gap-2.5"
              >
                <SolarIcon name="receipt" size={16} className="text-[#B45529] shrink-0" />
                <span className="truncate">Log an expense</span>
              </button>
              <button
                onClick={() => {
                  askSeiya("Can we afford all bills this month?");
                }}
                className="w-full p-3 bg-[#fef9ef] hover:bg-[#fffdf9] text-left rounded-[12px] text-xs font-semibold text-[#2a2b2f] shadow-xs transition-all cursor-pointer flex items-center gap-2.5"
              >
                <SolarIcon name="calendar" size={16} className="text-[#B45529] shrink-0" />
                <span className="truncate">Which bills are due?</span>
              </button>
              <button
                onClick={() => {
                  askSeiya("Help us stop overspending this month.");
                }}
                className="w-full p-3 bg-[#fef9ef] hover:bg-[#fffdf9] text-left rounded-[12px] text-xs font-semibold text-[#2a2b2f] shadow-xs transition-all cursor-pointer flex items-center gap-2.5"
              >
                <SolarIcon name="chart" size={16} className="text-[#B45529] shrink-0" />
                <span className="truncate">Spending trend & plan</span>
              </button>
            </div>

            {/* Direct Chat & Attach File Shortcut */}
            <AskSeiyaDirectChatBox
              onNavigate={onNavigate}
              setPendingDirectChat={setPendingDirectChat}
              placeholder="Ask Seiya or type an expense..."
            />

            <div className="text-[11px] text-[#515151] flex items-center gap-1.5 pt-2 border-t border-[#d1c9bf]/30">
              <SolarIcon name="shield-check" size={14} className="text-[#B45529] shrink-0" />
              <span className="leading-tight">AI suggests. Dual-Key Gateway decides.</span>
            </div>
          </div>
        </div>
      </div>

      {/* 4. PARTNER APPROVAL REQUESTS (STACKED CARD) */}
      <ApprovalDeck
        onViewAll={() => setAllApprovalsModalOpen(true)}
        onSelectApproval={(approval) => {
          setSelectedApproval(approval);
          setApprovalModalOpen(true);
        }}
      />

      {/* 5. BUDGET WARNING WIDGET */}
      <div className="p-5 rounded-[12px] bg-[#fcf5e8] shadow-xs flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-full bg-[#fef9ef] text-[#C98A4F] shrink-0">
            <SolarIcon name="danger-triangle" size={20} />
          </div>
          <div>
            <h4 className="text-xs font-bold text-[#C98A4F]">
              {budgetSummary ? `Monthly Budget: ${budgetSummary.usagePercent}% Spent` : "No Budget Set Yet"}
            </h4>
            <p className="text-[11px] text-[#515151] mt-0.5">
              {budgetSummary
                ? `You’ve used ${formatMoneyConverted(budgetSummary.spent, budgetSummary.currency, reportingCurrency, locale)} out of your ${formatMoneyConverted(budgetSummary.amount, budgetSummary.currency, reportingCurrency, locale)} budget with ${budgetSummary.daysRemaining} day${budgetSummary.daysRemaining === 1 ? "" : "s"} remaining.`
                : "Set a shared spending budget with Seiya so you both get an early warning before overspending."}
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onNavigate("plan")}
          className="shrink-0 text-xs"
        >
          View Budget
        </Button>
      </div>

      {/* 6. MAIN GRID: Transactions & Cashflow Analysis */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Last Transactions (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base sm:text-lg font-serif font-normal text-[#2a2b2f]">
              Last Transactions
            </h3>
            <button
              onClick={() => onNavigate("activity")}
              className="text-xs font-semibold text-[#B45529] hover:underline cursor-pointer"
            >
              View all
            </button>
          </div>

          {/* Filter Tabs */}
          <div className="flex items-center gap-1.5 p-1 bg-[#f5eee1] rounded-full w-fit">
            {[
              { id: "all", label: "All" },
              { id: "shared", label: "Shared" },
              { id: "partnerA", label: partnerAName },
              { id: "partnerB", label: partnerBName },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setTxFilter(tab.id as any)}
                className={`px-3.5 py-1 text-xs font-semibold rounded-full capitalize transition-all cursor-pointer ${
                  txFilter === tab.id
                    ? "bg-[#B45529] text-[#fef9ef] shadow-xs"
                    : "text-[#515151] hover:text-[#2a2b2f]"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Transaction List Items Card (12px, borderless, category-specific icons) */}
          <div className="bg-[#f5eee1] rounded-[12px] shadow-xs overflow-hidden">
            {filteredTransactions.length === 0 && (
              <p className="p-5 text-xs text-[#808988] text-center">
                No transactions yet. Record an expense or ask Seiya to log one for you.
              </p>
            )}
            {filteredTransactions.slice(0, 5).map((tx) => {
              const visual = getTransactionCategoryVisual(tx.category, tx.title);
              return (
                <div
                  key={tx.id}
                  onClick={() => {
                    setSelectedTransaction(tx);
                    setTransactionModalOpen(true);
                  }}
                  className="p-4 flex items-center justify-between hover:bg-[#ece3d3]/70 transition-colors cursor-pointer group"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${visual.bgClass} ${visual.textClass} group-hover:scale-105 transition-transform shadow-2xs`}>
                      <SolarIcon name={visual.iconName} size={18} />
                    </div>
                    <div>
                      <h4 className="text-xs sm:text-sm font-semibold text-[#2a2b2f] group-hover:text-[#B45529] transition-colors">{tx.title}</h4>
                      <span className="text-[11px] text-[#515151]">
                        {tx.date} • {tx.wallet.replace("_", " ")}
                      </span>
                    </div>
                  </div>
                  <div className="text-right flex items-center gap-2.5">
                    <div>
                      <div
                        className={`text-xs sm:text-sm font-bold font-serif ${
                          tx.amount > 0 ? "text-[#2d5232]" : "text-[#2a2b2f]"
                        }`}
                      >
                        {formatMoney(tx.amount, tx.currency || reportingCurrency, locale)}
                      </div>
                      {(tx.currency || reportingCurrency) !== reportingCurrency && (
                        <span className="text-[10px] text-[#808988] font-serif block">
                          ≈ {formatMoneyConverted(tx.amount, tx.currency || reportingCurrency, reportingCurrency, locale)}
                        </span>
                      )}
                      {tx.partnerBOwesA || tx.partnerAOwesB ? (
                        <span className="text-[10px] text-[#B45529] block font-medium">Split recorded</span>
                      ) : null}
                    </div>
                    <SolarIcon
                      name="arrow-right"
                      size={14}
                      className="text-[#808988] opacity-40 group-hover:opacity-100 group-hover:text-[#B45529] transition-all shrink-0"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Spending Analysis & Donut Breakdown (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base sm:text-lg font-serif font-normal text-[#2a2b2f]">
              Spending Analysis
            </h3>
            <span className="text-xs font-semibold text-[#B45529] font-mono">{stats.monthLabel}</span>
          </div>

          <div className="bg-[#f5eee1] rounded-[12px] shadow-xs p-5 sm:p-6 space-y-4">
            {/* Visual Donut representation */}
            <div className="relative w-52 h-52 sm:w-64 sm:h-64 mx-auto flex items-center justify-center my-2">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="38" fill="transparent" stroke="#e6ded3" strokeWidth="10" />
                {donutSegments.map((seg) => (
                  <circle
                    key={seg.name}
                    cx="50"
                    cy="50"
                    r="38"
                    fill="transparent"
                    stroke={seg.color}
                    strokeWidth="10"
                    strokeDasharray={seg.dash}
                    strokeDashoffset={seg.offset}
                  />
                ))}
              </svg>
              {/* Text stays inside the ring's hole (inner radius 33 of 50) and shrinks for long amounts */}
              <div className="absolute inset-[20%] flex flex-col items-center justify-center text-center">
                <span className="text-xs sm:text-sm text-[#515151] font-medium tracking-wide">Total Spent</span>
                {(() => {
                  const totalSpentLabel = formatMoney(stats.totalSpent, reportingCurrency, locale);
                  const sizeClass =
                    totalSpentLabel.length <= 10
                      ? "text-xl sm:text-3xl"
                      : totalSpentLabel.length <= 14
                        ? "text-base sm:text-xl"
                        : "text-sm sm:text-lg";
                  return (
                    <span className={`${sizeClass} max-w-full whitespace-nowrap font-extrabold font-serif text-[#2a2b2f] tracking-tight leading-tight my-1`}>
                      {totalSpentLabel}
                    </span>
                  );
                })()}
                {stats.spentChange !== null && (
                  <span
                    className={`text-xs font-bold flex items-center gap-1 px-2 py-0.5 rounded-full mt-0.5 ${
                      stats.spentChange <= 0 ? "text-[#2d5232] bg-[#2d5232]/10" : "text-[#a34426] bg-[#a34426]/10"
                    }`}
                  >
                    <SolarIcon name={stats.spentChange <= 0 ? "trend-down" : "trend-up"} size={12} />
                    {stats.spentChange > 0 ? "+" : "-"}
                    {formatChange(stats.spentChange)}
                  </span>
                )}
              </div>
            </div>

            {/* Category breakdown list */}
            <div className="space-y-2 pt-2">
              {categories.length === 0 && (
                <p className="text-xs text-[#808988] text-center py-2">
                  No spending recorded this month yet.
                </p>
              )}
              {categories.map((cat) => (
                <div key={cat.name} className="flex items-center justify-between text-xs py-1">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                    <span className="text-[#333333] font-medium">{cat.name}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[#515151] text-[11px] font-serif">{cat.percent}</span>
                    <span className="text-[#2a2b2f] font-semibold font-serif">{cat.amount}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 7. AGENT INSIGHTS & UPCOMING BILLS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Insight Card 1 */}
        <div className="p-5 rounded-[12px] bg-[#f5eee1] shadow-xs flex items-start gap-3.5">
          <div className="p-2.5 rounded-full bg-[#fef9ef] text-[#B45529] shrink-0">
            <SeiyaIcon size={18} color="#B45529" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-[#2a2b2f]">
              Seiya Insight: {upcomingBills.length > 0 ? "Bills Due This Week" : "No Bills Due Soon"}
            </h4>
            <p className="text-xs text-[#515151] mt-0.5 leading-relaxed">
              {upcomingBills.length > 0
                ? `${upcomingBills.length} bill${upcomingBills.length === 1 ? "" : "s"} due in the next 7 days, totalling ${formatMoney(
                    upcomingBills.reduce((sum, b) => sum + convertAmount(b.amount, b.currency, reportingCurrency), 0),
                    reportingCurrency,
                    locale
                  )}. Next up: ${upcomingBills[0].title} (${upcomingBills[0].dueDate}).`
                : "Nothing is due in the next 7 days. Add recurring bills so Seiya can remind you both in time."}
            </p>
          </div>
        </div>

        {/* Insight Card 2 */}
        <div className="p-5 rounded-[12px] bg-[#f5eee1] shadow-xs flex items-start gap-3.5">
          <div className="p-2.5 rounded-full bg-[#fef9ef] text-[#C98A4F] shrink-0">
            <SolarIcon name="info-circle" size={18} />
          </div>
          <div>
            <h4 className="text-xs font-bold text-[#2a2b2f]">
              Seiya Insight: {settlement.partnerBOwesA > 0 || settlement.partnerAOwesB > 0 ? "Shared Balance" : "Couple Check-in"}
            </h4>
            <p className="text-xs text-[#515151] mt-0.5 leading-relaxed">
              {settlement.partnerBOwesA > 0
                ? `${partnerBName} owes ${partnerAName} ${formatMoney(settlement.partnerBOwesA, settlement.currency, locale)} from shared expenses.`
                : settlement.partnerAOwesB > 0
                ? `${partnerAName} owes ${partnerBName} ${formatMoney(settlement.partnerAOwesB, settlement.currency, locale)} from shared expenses.`
                : pendingApprovalsCount > 0
                ? `${pendingApprovalsCount} request${pendingApprovalsCount === 1 ? " is" : "s are"} waiting for a Dual-Key decision.`
                : "You're all settled up and no requests are waiting. A good moment for a quick money check-in together."}
            </p>
          </div>
        </div>
      </div>

      {/* 8. PERSISTENT ASK SEIYA CARD (Mobile/Tablet only, Desktop is placed beside Monthly Overview) */}
      <div
        className="xl:hidden p-6 sm:p-8 rounded-[12px] shadow-sm relative overflow-hidden"
        style={{
          background: "linear-gradient(135deg, #f7efe4 0%, #ebdfce 100%)",
        }}
      >
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div className="flex items-center gap-2 text-[#B45529]">
            <SeiyaIcon size={24} color="#B45529" />
            <h3 className="text-xl font-serif font-normal text-[#2a2b2f]">
              Ask Seiya
            </h3>
          </div>

          {/* Circle 'i' toggle button */}
          <button
            type="button"
            onClick={() => setShowAskSeiyaInfo((prev) => !prev)}
            aria-label={showAskSeiyaInfo ? "Sembunyikan penjelasan" : "Lihat penjelasan Ask Seiya"}
            title={showAskSeiyaInfo ? "Tutup penjelasan" : "Lihat penjelasan fitur Ask Seiya"}
            className={`w-6 h-6 rounded-full flex items-center justify-center transition-all cursor-pointer shadow-2xs ${
              showAskSeiyaInfo
                ? "bg-[#B45529] text-[#fef9ef] scale-105"
                : "bg-[#fef9ef] text-[#808988] hover:text-[#B45529]"
            }`}
          >
            <SolarIcon name="info-circle" size={15} />
          </button>
        </div>

        {showAskSeiyaInfo && (
          <div className="p-3 rounded-[10px] bg-[#fef9ef]/80 border border-[#d1c9bf]/40 text-xs text-[#515151] mb-4 animate-in fade-in-0 slide-in-from-top-1">
            Let’s make your next financial decision a little easier. Propose expenses, test cooling-off rules, or plan shared goals.
          </div>
        )}

        {/* Quick prompt buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mb-5">
          <button
            onClick={() => {
              askSeiya("I want to log a shared expense.");
            }}
            className="p-3.5 bg-[#fef9ef] hover:bg-[#fffdf9] text-left rounded-[12px] text-xs font-semibold text-[#2a2b2f] shadow-xs transition-all cursor-pointer flex items-center gap-2"
          >
            <SolarIcon name="receipt" size={16} className="text-[#B45529] shrink-0" />
            <span>Log an expense</span>
          </button>
          <button
            onClick={() => {
              askSeiya("Can we afford all bills this month?");
            }}
            className="p-3.5 bg-[#fef9ef] hover:bg-[#fffdf9] text-left rounded-[12px] text-xs font-semibold text-[#2a2b2f] shadow-xs transition-all cursor-pointer flex items-center gap-2"
          >
            <SolarIcon name="calendar" size={16} className="text-[#B45529] shrink-0" />
            <span>Which bills are due?</span>
          </button>
          <button
            onClick={() => {
              askSeiya("Help us stop overspending this month.");
            }}
            className="p-3.5 bg-[#fef9ef] hover:bg-[#fffdf9] text-left rounded-[12px] text-xs font-semibold text-[#2a2b2f] shadow-xs transition-all cursor-pointer flex items-center gap-2"
          >
            <SolarIcon name="chart" size={16} className="text-[#B45529] shrink-0" />
            <span>Spending trend & plan</span>
          </button>
        </div>

        {/* Direct Chat & Attach File Shortcut (Mobile) */}
        <div className="mb-4">
          <AskSeiyaDirectChatBox
            onNavigate={onNavigate}
            setPendingDirectChat={setPendingDirectChat}
            placeholder="Ask Seiya or type an expense..."
          />
        </div>

        <div className="text-[11px] text-[#515151] flex items-center gap-1.5">
          <SolarIcon name="shield-check" size={14} className="text-[#B45529]" />
          <span>AI suggests. Your agreed rules and Dual-Key Gateway decide.</span>
        </div>
      </div>

      {/* Approval Dialog */}
      <ApprovalDialog
        request={selectedApproval}
        open={approvalModalOpen}
        onOpenChange={setApprovalModalOpen}
      />

      {/* Transaction Detail Dialog */}
      <TransactionDetailDialog
        transaction={selectedTransaction}
        open={transactionModalOpen}
        onOpenChange={setTransactionModalOpen}
        onAskSeiya={(prompt) => {
          askSeiya(prompt);
        }}
      />

      {/* All Approvals Detail List View Modal */}
      <AllApprovalsModal
        open={allApprovalsModalOpen}
        onOpenChange={setAllApprovalsModalOpen}
      />

      {/* Add Recurring Bill Modal */}
      <BillDialog
        open={addBillModalOpen}
        onOpenChange={setAddBillModalOpen}
      />

      {/* Propose Expense Modal */}
      <ProposeExpenseDialog
        open={proposeExpenseModalOpen}
        onOpenChange={setProposeExpenseModalOpen}
      />
    </div>
  );
}
