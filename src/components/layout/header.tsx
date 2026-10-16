"use client";

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { SolarIcon, SolarIconName } from "@/components/icons/solar";
import { Badge } from "@/components/ui/badge";
import { useApp } from "@/lib/store";
import { SUPPORTED_CURRENCIES } from "@/lib/currency";
import { formatMoney, getTransactionCategoryVisual } from "@/lib/utils";

export interface TabHeaderConfig {
  title: string;
  shortTitle?: string;
  iconName?: SolarIconName;
  description?: string;
}

const TAB_HEADER_CONFIG: Record<string, TabHeaderConfig> = {
  home: {
    title: "Dashboard",
    shortTitle: "Dashboard",
    iconName: "home",
    description: "Overview of your couple financial ecosystem, balances, and shared budget.",
  },
  plan: {
    title: "Financial Planning & Couple Goals",
    shortTitle: "Financial Planning",
    iconName: "chart",
    description: "Collaborative planning: forward-looking assumptions, projections, and dual-partner agreement.",
  },
  add_goal: {
    title: "Add New Couple Goal",
    shortTitle: "New Goal",
    iconName: "money-bag",
    description: "Design transparent financial milestones, contribution splits, and dual-key security rules.",
  },
  draft_goals: {
    title: "Draft Couple Goals",
    shortTitle: "Draft Goals",
    iconName: "edit",
    description: "Milestones in planning stage awaiting proposal, revision, or mutual dual-key activation.",
  },
  approvals: {
    title: "Dual-Key Approvals Center",
    shortTitle: "Dual-Key Approvals",
    iconName: "shield-check",
    description: "Every shared decision above agreed threshold requires both keys. Verbal agreement does not count.",
  },
  wallets: {
    title: "Wallets & Multi-Currency Balances",
    shortTitle: "Wallets & Balances",
    iconName: "wallet",
    description: "Transparent shared ledger with strict partner privacy protection and multi-currency tracking.",
  },
  bills: {
    title: "Upcoming Bills & Deadlines",
    shortTitle: "Upcoming Bills",
    iconName: "receipt",
    description: "Track due dates, anomalies, price increases, and pay securely through Dual-Key Gateway.",
  },
  waiting_list: {
    title: "Waiting List & Cooling-Off Holds",
    shortTitle: "Cooling-Off Holds",
    iconName: "clock-circle",
    description: "Couple safety guardrail: temporary holding area for late-night or high-value purchases.",
  },
  activity: {
    title: "Activity & Decision Audit Trail",
    shortTitle: "Activity & Audit",
    iconName: "calendar",
    description: "A transparent ledger of mutual approvals, cooling-off holds, and spending rules.",
  },
  settings: {
    title: "Couple Contract & Settings",
    shortTitle: "Couple Contract",
    iconName: "settings",
    description: "Rules governing your Dual-Key Gateway, spending thresholds, splits, currency reporting, and privacy.",
  },
  profile: {
    title: "Partner Profile & Couple Contract",
    shortTitle: "Profile & Contract",
    iconName: "user",
    description: "Manage partner identity, dual-key signing rules, expense split ratios, and privacy settings.",
  },
};

export function Header({
  currentTab = "home",
  onOpenAskSeiya,
  onLogout,
  onOpenProfile,
  onNavigate,
}: {
  currentTab?: string;
  onOpenAskSeiya?: () => void;
  onLogout?: () => void;
  onOpenProfile?: () => void;
  onNavigate?: (tab: any) => void;
}) {
  const {
    currentUser,
    partnerAName,
    partnerBName,
    reportingCurrency,
    setReportingCurrency,
    unreadNotificationsCount,
    approvals,
    bills,
    transactions,
    plans,
    locale,
  } = useApp();

  const [showNotifications, setShowNotifications] = useState(false);
  const [showCurrencyMenu, setShowCurrencyMenu] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFilter, setSearchFilter] = useState<"all" | "transactions" | "bills" | "plans" | "approvals">("all");
  const [mounted, setMounted] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Detect scroll on main-scroll-container for transparent header transition
  useEffect(() => {
    const scrollContainer = document.getElementById("main-scroll-container");
    if (!scrollContainer) return;

    const handleScroll = () => {
      setIsScrolled(scrollContainer.scrollTop > 16);
    };

    scrollContainer.addEventListener("scroll", handleScroll, { passive: true });
    return () => scrollContainer.removeEventListener("scroll", handleScroll);
  }, []);

  // Close info panel when changing tabs
  useEffect(() => {
    setShowInfo(false);
  }, [currentTab]);

  // Global keyboard shortcut (⌘K / Ctrl+K) and custom event listener
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setShowSearch((prev) => !prev);
      } else if (e.key === "Escape" && showSearch) {
        setShowSearch(false);
      }
    }
    function handleCustomOpen() {
      setShowSearch(true);
    }
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("open-global-search", handleCustomOpen);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("open-global-search", handleCustomOpen);
    };
  }, [showSearch]);

  const activeName = currentUser === "partner_a" ? partnerAName : partnerBName;
  const currentConfig = TAB_HEADER_CONFIG[currentTab] || {
    title: currentTab.charAt(0).toUpperCase() + currentTab.slice(1).replace("_", " "),
  };

  const availableCurrencies = Object.values(SUPPORTED_CURRENCIES);

  // Search filter computations
  const query = searchQuery.trim().toLowerCase();

  const filteredTransactions = transactions.filter((t) => {
    if (!query) return true;
    return (
      t.title.toLowerCase().includes(query) ||
      t.category.toLowerCase().includes(query) ||
      t.amount.toString().includes(query)
    );
  });

  const filteredBills = bills.filter((b) => {
    if (!query) return true;
    return (
      b.title.toLowerCase().includes(query) ||
      b.category.toLowerCase().includes(query) ||
      b.amount.toString().includes(query)
    );
  });

  const filteredPlans = plans.filter((p) => {
    if (!query) return true;
    return (
      p.title.toLowerCase().includes(query) ||
      p.category.toLowerCase().includes(query) ||
      (p.assumptions && p.assumptions.toLowerCase().includes(query)) ||
      p.targetAmount.toString().includes(query)
    );
  });

  const filteredApprovals = approvals.filter((a) => {
    if (!query) return true;
    return (
      a.title.toLowerCase().includes(query) ||
      a.reason.toLowerCase().includes(query) ||
      a.amount.toString().includes(query)
    );
  });

  const totalResultsCount =
    (searchFilter === "all" || searchFilter === "transactions" ? filteredTransactions.length : 0) +
    (searchFilter === "all" || searchFilter === "bills" ? filteredBills.length : 0) +
    (searchFilter === "all" || searchFilter === "plans" ? filteredPlans.length : 0) +
    (searchFilter === "all" || searchFilter === "approvals" ? filteredApprovals.length : 0);

  const isHome = currentTab === "home";
  const headerBgClass = isScrolled
    ? "bg-[#fefcf6]/90 backdrop-blur-md border-b border-[#e8dfd5]/60 shadow-2xs"
    : "bg-transparent border-b border-transparent";

  return (
    <header className={`sticky top-0 z-30 shrink-0 px-3 sm:px-8 ${isHome ? "pt-2.5 pb-1 sm:pt-4 sm:pb-2" : "pt-3 pb-2.5 sm:pt-7 sm:pb-5"} flex flex-col justify-center transition-all duration-200 ${headerBgClass}`}>
      <div className="w-full max-w-7xl mx-auto flex items-center justify-between gap-2 sm:gap-3">
        {/* Left: Page Title */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            {currentConfig.iconName && (
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-[#f5eee1] flex items-center justify-center shrink-0 shadow-2xs">
                <SolarIcon
                  name={currentConfig.iconName}
                  size={18}
                  className="text-[#B45529]"
                />
              </div>
            )}
            <div className="min-w-0 flex items-center gap-1.5">
              <h1 className="text-base sm:text-2xl font-serif text-[#2a2b2f] tracking-tight font-normal truncate">
                <span className="sm:hidden">{currentConfig.shortTitle || currentConfig.title}</span>
                <span className="hidden sm:inline">{currentConfig.title}</span>
              </h1>

              {currentConfig.description && (
                <button
                  type="button"
                  onClick={() => setShowInfo((prev) => !prev)}
                  aria-label={showInfo ? "Sembunyikan penjelasan" : "Lihat penjelasan halaman"}
                  title={showInfo ? "Tutup penjelasan" : "Lihat penjelasan halaman"}
                  className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center transition-all cursor-pointer shadow-2xs shrink-0 ${
                    showInfo
                      ? "bg-[#B45529] text-[#fef9ef] scale-105"
                      : "bg-[#f5eee1] text-[#808988] hover:text-[#B45529] hover:bg-[#ece3d3]"
                  }`}
                >
                  <SolarIcon name="info-circle" size={13} />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Right: Search Button, Reporting Currency Selector & Notifications */}
        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          {/* Top Search Button */}
          <button
            type="button"
            onClick={() => setShowSearch(true)}
            className="w-8 h-8 sm:w-auto sm:px-3 sm:py-1.5 rounded-full bg-[#f5eee1] hover:bg-[#ece3d3] border border-[#d1c9bf]/60 text-xs font-semibold text-[#515151] hover:text-[#2a2b2f] flex items-center justify-center sm:gap-2 transition-all cursor-pointer shadow-2xs group shrink-0"
            title="Search (⌘K)"
          >
            <SolarIcon name="search" size={14} className="text-[#808988] group-hover:text-[#B45529] transition-colors shrink-0" />
            <span className="hidden sm:inline text-xs font-medium text-[#808988] group-hover:text-[#2a2b2f]">Search...</span>
            <kbd className="hidden md:inline-flex items-center px-1.5 py-0.5 text-[9px] font-mono font-bold text-[#808988] bg-[#fef9ef] border border-[#d1c9bf]/70 rounded shadow-2xs">
              ⌘K
            </kbd>
          </button>

          {/* Reporting Currency Selector Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowCurrencyMenu(!showCurrencyMenu)}
              className="flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-full bg-[#f5eee1] hover:bg-[#ece3d3] text-xs font-semibold text-[#2a2b2f] transition-all cursor-pointer shrink-0 border border-[#d1c9bf]/40"
              title="Change Couple Reporting Currency"
            >
              <SolarIcon name="refresh" size={12} className="text-[#B45529]" />
              <span className="font-mono text-[11px] font-bold">{reportingCurrency}</span>
              <SolarIcon name="arrow-down" size={10} className="text-[#808988]" />
            </button>

            {showCurrencyMenu && (
              <div className="absolute right-0 mt-2 w-56 bg-[#fef9ef] rounded-[12px] shadow-xl p-2 z-50 animate-in fade-in-0 zoom-in-95">
                <div className="px-3 py-1.5 text-[11px] font-bold text-[#808988] uppercase tracking-wider">
                  Reporting Currency
                </div>
                <div className="max-h-60 overflow-y-auto py-1">
                  {availableCurrencies.map((c) => (
                    <button
                      key={c.code}
                      onClick={() => {
                        setReportingCurrency(c.code);
                        setShowCurrencyMenu(false);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-1.5 rounded-full text-xs transition-colors cursor-pointer ${
                        reportingCurrency === c.code
                          ? "bg-[#f5eee1] text-[#B45529] font-bold"
                          : "text-[#333333] hover:bg-[#f5eee1]/60"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-semibold">{c.code}</span>
                        <span className="text-[#515151] text-[11px] truncate">{c.name}</span>
                      </div>
                      <span className="text-[#808988] font-mono text-[11px]">{c.symbol}</span>
                    </button>
                  ))}
                </div>
                <div className="px-3 pt-2 text-[10px] text-[#808988]">
                  Centralized display conversion · Does not mutate native money
                </div>
              </div>
            )}
          </div>

          {/* Notifications Icon with Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              className="relative p-2 rounded-full text-[#515151] hover:bg-[#f5eee1] hover:text-[#2a2b2f] transition-colors cursor-pointer"
              aria-label="View notifications"
            >
              <SolarIcon name="bell" size={18} />
              {unreadNotificationsCount > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-[#B45529] text-[#fef9ef] text-[10px] font-bold flex items-center justify-center">
                  {unreadNotificationsCount}
                </span>
              )}
            </button>

            {showNotifications && (
              <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-[#fef9ef] rounded-[12px] shadow-xl p-4 z-50 animate-in fade-in-0 zoom-in-95">
                <div className="flex items-center justify-between pb-3">
                  <span className="text-sm font-serif font-normal text-[#2a2b2f]">Notifications</span>
                  <span className="text-xs text-[#808988] font-mono">{unreadNotificationsCount} active</span>
                </div>
                <div className="space-y-1.5 max-h-80 overflow-y-auto">
                  {approvals.filter(a => a.status === "pending").map(a => (
                    <div key={a.id} className="py-2.5 text-xs">
                      <div className="flex items-center justify-between text-[#2a2b2f] font-semibold mb-0.5">
                        <span>Approval: {a.title}</span>
                        <span className="text-[10px] text-[#B45529] font-semibold">Pending</span>
                      </div>
                      <p className="text-[#515151] text-[11px]">{a.reason}</p>
                    </div>
                  ))}
                  {bills.filter(b => b.daysRemaining <= 3).map(b => (
                    <div key={b.id} className="py-2.5 text-xs">
                      <div className="flex items-center justify-between text-[#2a2b2f] font-semibold mb-0.5">
                        <span>Upcoming Bill: {b.title}</span>
                        <span className="text-[10px] text-[#a34426] font-semibold">Due in 3 days</span>
                      </div>
                      <p className="text-[#515151] text-[11px]">{b.anomaly?.message || "Due 25 Sep 2026"}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Expandable Explanation Info Box */}
      {showInfo && currentTab !== "home" && currentConfig.description && (
        <div className="w-full mt-3 p-3.5 rounded-[12px] bg-[#f5eee1] border border-[#d1c9bf]/50 text-xs text-[#515151] animate-in fade-in-0 slide-in-from-top-1">
          {currentConfig.description}
        </div>
      )}

      {/* Global Search Modal / Command Palette (Portaled to document.body to avoid header stacking context) */}
      {mounted && showSearch && createPortal(
        <div
          className="fixed inset-0 z-50 bg-[#2a2b2f]/45 backdrop-blur-xs flex items-start justify-center p-3 sm:p-4 pt-12 sm:pt-20 animate-in fade-in-0 duration-150"
          onClick={() => setShowSearch(false)}
        >
          <div
            className="w-full max-w-xl bg-[#fef9ef] rounded-[24px] shadow-[0_24px_60px_rgba(42,43,47,0.25)] border border-[#e8dfd5] overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Search Input Bar */}
            <div className="p-3.5 sm:p-4 border-b border-[#e8dfd5] flex items-center gap-3 bg-white">
              <SolarIcon name="search" size={20} className="text-[#B45529] shrink-0" />
              <input
                type="text"
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search transactions, bills, plans, approvals..."
                className="w-full bg-transparent text-sm sm:text-base text-[#2a2b2f] placeholder-[#808988] outline-none font-medium"
              />
              {searchQuery ? (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="text-xs text-[#808988] hover:text-[#2a2b2f] px-2 py-1 rounded-full hover:bg-[#f5eee1] transition-colors cursor-pointer"
                >
                  Clear
                </button>
              ) : (
                <kbd className="hidden sm:inline-flex items-center px-2 py-0.5 text-[11px] font-mono text-[#808988] bg-[#f5eee1] rounded border border-[#d1c9bf]/60">
                  ESC
                </kbd>
              )}
            </div>

            {/* Filter Categories Chips */}
            <div className="flex items-center gap-1.5 px-3.5 sm:px-4 py-2 bg-[#fcf8f0] border-b border-[#e8dfd5]/60 overflow-x-auto text-xs shrink-0">
              {[
                { id: "all", label: "All" },
                { id: "transactions", label: `Transactions (${filteredTransactions.length})` },
                { id: "bills", label: `Bills (${filteredBills.length})` },
                { id: "plans", label: `Goals (${filteredPlans.length})` },
                { id: "approvals", label: `Approvals (${filteredApprovals.length})` },
              ].map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSearchFilter(cat.id as any)}
                  className={`px-3 py-1 rounded-full font-semibold transition-all shrink-0 cursor-pointer ${
                    searchFilter === cat.id
                      ? "bg-[#B45529] text-[#fef9ef] shadow-xs"
                      : "bg-white text-[#515151] hover:bg-[#f5eee1] border border-[#e8dfd5]"
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {/* Results Container */}
            <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-4 max-h-[60vh]">
              {/* Quick Jump Links when query is empty */}
              {!query && (
                <div>
                  <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-[#808988] px-2 mb-2">
                    Quick Navigation
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {[
                      { name: "Wallets & Balances", tab: "wallets", icon: "wallet" as const },
                      { name: "Dual-Key Approvals", tab: "approvals", icon: "shield-check" as const },
                      { name: "Upcoming Bills", tab: "bills", icon: "receipt" as const },
                      { name: "Financial Planning", tab: "plan", icon: "chart" as const },
                      { name: "Waiting List", tab: "waiting_list", icon: "clock-circle" as const },
                      { name: "Activity Ledger", tab: "activity", icon: "calendar" as const },
                    ].map((item) => (
                      <button
                        key={item.tab}
                        type="button"
                        onClick={() => {
                          if (onNavigate) onNavigate(item.tab);
                          setShowSearch(false);
                        }}
                        className="flex items-center gap-2.5 p-2.5 rounded-[12px] bg-white hover:bg-[#f5eee1] border border-[#e8dfd5] text-left transition-all cursor-pointer group shadow-2xs"
                      >
                        <div className="w-7 h-7 rounded-full bg-[#f5eee1] text-[#B45529] group-hover:bg-[#B45529] group-hover:text-[#fef9ef] flex items-center justify-center shrink-0 transition-colors">
                          <SolarIcon name={item.icon} size={15} />
                        </div>
                        <span className="text-xs font-semibold text-[#2a2b2f] group-hover:text-[#B45529] transition-colors truncate">
                          {item.name}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Transactions Section */}
              {(searchFilter === "all" || searchFilter === "transactions") && filteredTransactions.length > 0 && (
                <div>
                  <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-[#808988] px-2 mb-2 flex items-center justify-between">
                    <span>Transactions</span>
                    <span className="text-[10px] font-normal lowercase">{filteredTransactions.length} found</span>
                  </div>
                  <div className="space-y-1.5">
                    {filteredTransactions.slice(0, 5).map((tx) => {
                      const visual = getTransactionCategoryVisual(tx.category, tx.title);
                      return (
                        <button
                          key={tx.id}
                          type="button"
                          onClick={() => {
                            if (onNavigate) onNavigate("activity");
                            setShowSearch(false);
                          }}
                          className="w-full flex items-center justify-between p-2.5 rounded-[12px] bg-white hover:bg-[#f5eee1] border border-[#e8dfd5]/80 text-left transition-all cursor-pointer group shadow-2xs"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-8 h-8 rounded-full bg-[#f5eee1] text-[#515151] flex items-center justify-center shrink-0">
                              <SolarIcon name={visual.iconName} size={16} />
                            </div>
                            <div className="min-w-0">
                              <div className="text-xs font-semibold text-[#2a2b2f] group-hover:text-[#B45529] transition-colors truncate">
                                {tx.title}
                              </div>
                              <div className="text-[10px] text-[#808988] truncate">
                                {tx.date} · {tx.category} · {tx.wallet === "shared" ? "Shared Pool" : "Personal"}
                              </div>
                            </div>
                          </div>
                          <span className={`text-xs font-mono font-bold shrink-0 ml-3 ${tx.amount < 0 ? "text-[#a34426]" : "text-[#2d5232]"}`}>
                            {tx.amount < 0 ? "-" : "+"}
                            {formatMoney(Math.abs(tx.amount), tx.currency, locale)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Bills Section */}
              {(searchFilter === "all" || searchFilter === "bills") && filteredBills.length > 0 && (
                <div>
                  <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-[#808988] px-2 mb-2 flex items-center justify-between">
                    <span>Upcoming Bills</span>
                    <span className="text-[10px] font-normal lowercase">{filteredBills.length} found</span>
                  </div>
                  <div className="space-y-1.5">
                    {filteredBills.slice(0, 4).map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => {
                          if (onNavigate) onNavigate("bills");
                          setShowSearch(false);
                        }}
                        className="w-full flex items-center justify-between p-2.5 rounded-[12px] bg-white hover:bg-[#f5eee1] border border-[#e8dfd5]/80 text-left transition-all cursor-pointer group shadow-2xs"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-8 h-8 rounded-full bg-[#e6efe7] text-[#2d5232] flex items-center justify-center shrink-0">
                            <SolarIcon name="calendar" size={16} />
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-[#2a2b2f] group-hover:text-[#B45529] transition-colors truncate">
                              {b.title}
                            </div>
                            <div className="text-[10px] text-[#808988] truncate">
                              Due in {b.daysRemaining} days · {b.category}
                            </div>
                          </div>
                        </div>
                        <span className="text-xs font-mono font-bold text-[#B45529] shrink-0 ml-3">
                          {formatMoney(b.amount, b.currency, locale)}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Goals & Plans Section */}
              {(searchFilter === "all" || searchFilter === "plans") && filteredPlans.length > 0 && (
                <div>
                  <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-[#808988] px-2 mb-2 flex items-center justify-between">
                    <span>Couple Financial Goals</span>
                    <span className="text-[10px] font-normal lowercase">{filteredPlans.length} found</span>
                  </div>
                  <div className="space-y-1.5">
                    {filteredPlans.slice(0, 4).map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          if (onNavigate) onNavigate("plan");
                          setShowSearch(false);
                        }}
                        className="w-full flex items-center justify-between p-2.5 rounded-[12px] bg-white hover:bg-[#f5eee1] border border-[#e8dfd5]/80 text-left transition-all cursor-pointer group shadow-2xs"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-8 h-8 rounded-full bg-[#faece0] text-[#8f3916] flex items-center justify-center shrink-0">
                            <SolarIcon name="chart" size={16} />
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-[#2a2b2f] group-hover:text-[#B45529] transition-colors truncate">
                              {p.title}
                            </div>
                            <div className="text-[10px] text-[#808988] truncate">
                              Target: {formatMoney(p.targetAmount, reportingCurrency, locale)} · {p.targetDate || "Ongoing"}
                            </div>
                          </div>
                        </div>
                        <span className="text-xs font-mono font-bold text-[#2d5232] shrink-0 ml-3">
                          {formatMoney(p.currentAmount, reportingCurrency, locale)}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Approvals Section */}
              {(searchFilter === "all" || searchFilter === "approvals") && filteredApprovals.length > 0 && (
                <div>
                  <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-[#808988] px-2 mb-2 flex items-center justify-between">
                    <span>Dual-Key Approvals</span>
                    <span className="text-[10px] font-normal lowercase">{filteredApprovals.length} found</span>
                  </div>
                  <div className="space-y-1.5">
                    {filteredApprovals.slice(0, 4).map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => {
                          if (onNavigate) onNavigate("approvals");
                          setShowSearch(false);
                        }}
                        className="w-full flex items-center justify-between p-2.5 rounded-[12px] bg-white hover:bg-[#f5eee1] border border-[#e8dfd5]/80 text-left transition-all cursor-pointer group shadow-2xs"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-8 h-8 rounded-full bg-[#fbe7e0] text-[#a34426] flex items-center justify-center shrink-0">
                            <SolarIcon name="shield-check" size={16} />
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-[#2a2b2f] group-hover:text-[#B45529] transition-colors truncate">
                              {a.title}
                            </div>
                            <div className="text-[10px] text-[#808988] truncate">
                              Status: {a.status} · {a.reason}
                            </div>
                          </div>
                        </div>
                        <span className="text-xs font-mono font-bold text-[#a34426] shrink-0 ml-3">
                          {formatMoney(a.amount, a.currency || reportingCurrency, locale)}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* No Results Empty State */}
              {query && totalResultsCount === 0 && (
                <div className="py-10 text-center text-xs text-[#808988]">
                  <div className="w-12 h-12 rounded-full bg-[#f5eee1] text-[#808988] mx-auto flex items-center justify-center mb-2.5">
                    <SolarIcon name="search" size={24} />
                  </div>
                  <p className="font-semibold text-[#2a2b2f] mb-1">No matching results for &ldquo;{searchQuery}&rdquo;</p>
                  <p className="text-[11px]">Try searching for &ldquo;dinner&rdquo;, &ldquo;rent&rdquo;, &ldquo;japan&rdquo;, or &ldquo;vacuum&rdquo;</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-3 bg-[#f5eee1] border-t border-[#e8dfd5] flex items-center justify-between text-[11px] text-[#808988] px-4">
              <div className="flex items-center gap-1.5">
                <SolarIcon name="sparkles" size={13} className="text-[#B45529]" />
                <span>Dual-Key protected Couple Treasury</span>
              </div>
              <span className="hidden sm:inline">Press ESC to exit</span>
            </div>
          </div>
        </div>,
        document.body
      )}
    </header>
  );
}
