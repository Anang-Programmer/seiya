"use client";

import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { SolarIcon, SolarIconName } from "@/components/icons/solar";
import { Badge } from "@/components/ui/badge";
import { useApp } from "@/lib/store";
import { SUPPORTED_CURRENCIES } from "@/lib/currency";
import { formatMoney, getTransactionCategoryVisual } from "@/lib/utils";

export interface TabHeaderConfig {
  title: string;
  shortTitle?: string;
  /** One or two words, used on phones where the header is narrow. */
  mobileTitle?: string;
  iconName?: SolarIconName;
  description?: string;
}

const TAB_HEADER_CONFIG: Record<string, TabHeaderConfig> = {
  home: {
    mobileTitle: "Home",
    title: "Dashboard",
    shortTitle: "Dashboard",
    iconName: "home",
    description: "Your balance, your partner's and the shared wallet, plus this month's income and spending.",
  },
  plan: {
    mobileTitle: "Plan",
    title: "Financial Planning & Couple Goals",
    shortTitle: "Financial Planning",
    iconName: "chart",
    description: "Set shared goals, track progress, and agree on them together.",
  },
  add_goal: {
    mobileTitle: "New Goal",
    title: "Add New Couple Goal",
    shortTitle: "New Goal",
    iconName: "money-bag",
    description: "Create a shared goal: target, deadline and who contributes what.",
  },
  draft_goals: {
    mobileTitle: "Draft Goals",
    title: "Draft Couple Goals",
    shortTitle: "Draft Goals",
    iconName: "edit",
    description: "Goals still being planned. Propose or revise them until you both agree.",
  },
  approvals: {
    mobileTitle: "Approvals",
    title: "Dual-Key Approvals Center",
    shortTitle: "Dual-Key Approvals",
    iconName: "shield-check",
    description: "Shared spending above your limit needs approval from both of you.",
  },
  wallets: {
    mobileTitle: "Wallets",
    title: "Wallets & Multi-Currency Balances",
    shortTitle: "Wallets & Balances",
    iconName: "wallet",
    description: "All your balances in one place, in any currency, with privacy kept.",
  },
  bills: {
    mobileTitle: "Bills",
    title: "Upcoming Bills & Deadlines",
    shortTitle: "Upcoming Bills",
    iconName: "receipt",
    description: "Upcoming bills, due dates and price changes, so nothing gets missed.",
  },
  waiting_list: {
    mobileTitle: "Waiting List",
    title: "Waiting List & Cooling-Off Holds",
    shortTitle: "Cooling-Off Holds",
    iconName: "clock-circle",
    description: "Late-night or large purchases wait here before they go through.",
  },
  activity: {
    mobileTitle: "Activity",
    title: "Activity & Decision Audit Trail",
    shortTitle: "Activity & Audit",
    iconName: "calendar",
    description: "A record of every approval, hold and rule change.",
  },
  settings: {
    mobileTitle: "Contract",
    title: "Couple Contract & Settings",
    shortTitle: "Couple Contract",
    iconName: "settings",
    description: "Your shared rules: approval limits, splits, currency and privacy.",
  },
  profile: {
    mobileTitle: "Profile",
    title: "Partner Profile & Couple Contract",
    shortTitle: "Profile & Contract",
    iconName: "user",
    description: "Your profile, approval rules, expense split and privacy.",
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
    contractMeta,
    approvals,
    bills,
    heldPurchases,
    transactions,
    plans,
    locale,
    hideAmounts,
    toggleHideAmounts,
  } = useApp();

  const [showNotifications, setShowNotifications] = useState(false);
  const [showCurrencyMenu, setShowCurrencyMenu] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFilter, setSearchFilter] = useState<"all" | "transactions" | "bills" | "plans" | "approvals">("all");
  const [mounted, setMounted] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const currencyMenuRef = useRef<HTMLDivElement>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);

  // Tapping anywhere outside an open menu closes it (phones have no hover-out).
  useEffect(() => {
    if (!showCurrencyMenu && !showNotifications) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (showCurrencyMenu && !currencyMenuRef.current?.contains(target)) setShowCurrencyMenu(false);
      if (showNotifications && !notificationsRef.current?.contains(target)) setShowNotifications(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [showCurrencyMenu, showNotifications]);

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
    <header className={`sticky top-0 z-30 shrink-0 px-3.5 sm:px-8 ${isHome ? "pt-[calc(0.625rem+env(safe-area-inset-top))] pb-1.5 sm:pt-4 sm:pb-2" : "pt-[calc(0.75rem+env(safe-area-inset-top))] pb-2.5 sm:pt-7 sm:pb-5"} flex flex-col justify-center transition-[background-color,border-color,box-shadow] duration-200 ${headerBgClass}`}>
      <div className="w-full max-w-7xl mx-auto flex items-center justify-between gap-2 sm:gap-3">
        {/* Left: Page Title */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            {currentConfig.iconName && (
              <div className="hidden sm:flex w-10 h-10 rounded-full bg-[#f5eee1] items-center justify-center shrink-0 shadow-2xs">
                <SolarIcon
                  name={currentConfig.iconName}
                  size={18}
                  className="text-[#B45529]"
                />
              </div>
            )}
            <div className="min-w-0 flex items-center gap-1.5">
              <h1 className="text-[22px] leading-tight sm:text-2xl font-serif text-[#2a2b2f] tracking-tight font-normal truncate">
                {/* Short title on phones and tablets (the sidebar narrows the header there). */}
                <span className="sm:hidden">{currentConfig.mobileTitle || currentConfig.shortTitle || currentConfig.title}</span>
                <span className="hidden sm:inline xl:hidden">{currentConfig.shortTitle || currentConfig.title}</span>
                <span className="hidden xl:inline">{currentConfig.title}</span>
              </h1>

              {currentConfig.description && (
                <button
                  type="button"
                  onClick={() => setShowInfo((prev) => !prev)}
                  aria-label={showInfo ? "Sembunyikan penjelasan" : "Lihat penjelasan halaman"}
                  title={showInfo ? "Tutup penjelasan" : "Lihat penjelasan halaman"}
                  className={`w-7 h-7 sm:w-6 sm:h-6 rounded-full flex items-center justify-center transition-all cursor-pointer shadow-2xs shrink-0 ${
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
            className="w-8 h-8 lg:w-auto lg:px-3 lg:py-1.5 rounded-full bg-[#f5eee1] hover:bg-[#ece3d3] border border-[#d1c9bf]/60 text-xs font-semibold text-[#515151] hover:text-[#2a2b2f] flex items-center justify-center lg:gap-2 transition-all cursor-pointer shadow-2xs group shrink-0"
            title="Search (⌘K)"
            aria-label="Search"
          >
            <SolarIcon name="search" size={14} className="text-[#808988] group-hover:text-[#B45529] transition-colors shrink-0" />
            <span className="hidden lg:inline text-xs font-medium text-[#808988] group-hover:text-[#2a2b2f]">Search...</span>
            <kbd className="hidden lg:inline-flex items-center px-1.5 py-0.5 text-[9px] font-mono font-bold text-[#808988] bg-[#fef9ef] border border-[#d1c9bf]/70 rounded shadow-2xs">
              ⌘K
            </kbd>
          </button>

          {/* Privacy: show / hide every money amount (remembered on this device) */}
          <button
            type="button"
            onClick={toggleHideAmounts}
            aria-pressed={hideAmounts}
            aria-label={hideAmounts ? "Show amounts" : "Hide amounts"}
            title={hideAmounts ? "Show amounts" : "Hide amounts"}
            className={`w-8 h-8 rounded-full border flex items-center justify-center transition-all cursor-pointer shrink-0 shadow-2xs ${
              hideAmounts
                ? "bg-[#B45529] border-[#B45529] text-white hover:bg-[#9c4820]"
                : "bg-[#f5eee1] border-[#d1c9bf]/40 text-[#515151] hover:bg-[#ece3d3] hover:text-[#B45529]"
            }`}
          >
            <SolarIcon name={hideAmounts ? "eye-closed" : "eye"} size={16} />
          </button>

          {/* Reporting Currency Selector Dropdown */}
          <div className="relative" ref={currencyMenuRef}>
            <button
              onClick={() => setShowCurrencyMenu(!showCurrencyMenu)}
              className="h-8 flex items-center gap-1 px-2.5 sm:px-3 rounded-full bg-[#f5eee1] hover:bg-[#ece3d3] text-xs font-semibold text-[#2a2b2f] transition-all cursor-pointer shrink-0 border border-[#d1c9bf]/40"
              title="Change Couple Reporting Currency"
              aria-label={`Reporting currency: ${reportingCurrency}`}
              aria-expanded={showCurrencyMenu}
            >
              <SolarIcon name="refresh" size={12} className="hidden sm:block text-[#B45529]" />
              <span className="font-mono text-[11px] font-bold">{reportingCurrency}</span>
              <SolarIcon name="arrow-down" size={10} className="text-[#808988]" />
            </button>

            {showCurrencyMenu && (
              <div className="absolute right-0 mt-2 w-56 bg-[#fef9ef] rounded-[12px] shadow-xl border border-[#e8dfd5] p-2 z-50 animate-in fade-in-0 zoom-in-95">
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
                      className={`w-full flex items-center justify-between px-3 py-2.5 sm:py-1.5 rounded-full text-xs transition-colors cursor-pointer ${
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
          <div className="relative" ref={notificationsRef}>
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
              <div className="fixed left-3 right-3 top-[calc(3.75rem+env(safe-area-inset-top))] sm:absolute sm:left-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-96 bg-[#fef9ef] rounded-[16px] sm:rounded-[12px] shadow-xl border border-[#e8dfd5] p-4 z-50 animate-in fade-in-0 zoom-in-95">
                <div className="flex items-center justify-between pb-3">
                  <span className="text-sm font-serif font-normal text-[#2a2b2f]">Notifications</span>
                  <span className="text-xs text-[#808988] font-mono">{unreadNotificationsCount} active</span>
                </div>
                <div className="space-y-1.5 max-h-80 overflow-y-auto">
                  {unreadNotificationsCount === 0 && (
                    <p className="py-3 text-xs text-[#808988] text-center">
                      You&apos;re all caught up. Requests, bills due soon and contract changes show up here.
                    </p>
                  )}
                  {contractMeta.pendingNeedsMyApproval && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowNotifications(false);
                        onNavigate?.("settings");
                      }}
                      className="w-full text-left py-2.5 text-xs cursor-pointer hover:bg-[#f5eee1] rounded-[8px] px-1 -mx-1"
                    >
                      <div className="flex items-center justify-between text-[#2a2b2f] font-semibold mb-0.5">
                        <span>Couple Contract change to review</span>
                        <span className="text-[10px] text-[#B45529] font-semibold">Needs you</span>
                      </div>
                      <p className="text-[#515151] text-[11px]">Your partner proposed new rules. Open the contract to review and sign.</p>
                    </button>
                  )}
                  {approvals.filter(a => a.status === "pending" && a.approver === currentUser).map(a => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => {
                        setShowNotifications(false);
                        onNavigate?.("approvals");
                      }}
                      className="w-full text-left py-2.5 text-xs cursor-pointer hover:bg-[#f5eee1] rounded-[8px] px-1 -mx-1"
                    >
                      <div className="flex items-center justify-between gap-2 text-[#2a2b2f] font-semibold mb-0.5">
                        <span className="min-w-0">Approval: {a.title}</span>
                        <span className="text-[10px] text-[#B45529] font-semibold shrink-0">Pending</span>
                      </div>
                      <p className="text-[#515151] text-[11px]">{a.reason}</p>
                    </button>
                  ))}
                  {/* Held purchases are part of the count, so they are listed too. */}
                  {heldPurchases.filter((h) => h.status === "held").map((h) => (
                    <button
                      key={h.id}
                      type="button"
                      onClick={() => {
                        setShowNotifications(false);
                        onNavigate?.("waiting_list");
                      }}
                      className="w-full text-left py-2.5 text-xs cursor-pointer hover:bg-[#f5eee1] rounded-[8px] px-1 -mx-1"
                    >
                      <div className="flex items-center justify-between gap-2 text-[#2a2b2f] font-semibold mb-0.5">
                        <span className="truncate">On hold: {h.title}</span>
                        <span className="text-[10px] text-[#C98A4F] font-semibold shrink-0">Waiting List</span>
                      </div>
                      <p className="text-[#515151] text-[11px]">Cooling-off until {h.holdUntil}.</p>
                    </button>
                  ))}
                  {bills.filter(b => b.status !== "paid" && b.daysRemaining <= 3).map(b => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => {
                        setShowNotifications(false);
                        onNavigate?.("bills");
                      }}
                      className="w-full text-left py-2.5 text-xs cursor-pointer hover:bg-[#f5eee1] rounded-[8px] px-1 -mx-1"
                    >
                      <div className="flex items-center justify-between gap-2 text-[#2a2b2f] font-semibold mb-0.5">
                        <span className="min-w-0">Upcoming Bill: {b.title}</span>
                        <span className="text-[10px] text-[#a34426] font-semibold shrink-0">
                          {b.daysRemaining < 0 ? "Overdue" : b.daysRemaining === 0 ? "Due today" : `Due in ${b.daysRemaining} day${b.daysRemaining === 1 ? "" : "s"}`}
                        </span>
                      </div>
                      <p className="text-[#515151] text-[11px]">{b.anomaly?.message || `Due ${b.dueDate}`}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Expandable Explanation Info Box (every page, Home included) */}
      {showInfo && currentConfig.description && (
        <div
          role="note"
          className="w-full max-w-7xl mx-auto mt-3 animate-in fade-in-0 slide-in-from-top-1 relative z-10"
        >
          {/* Sized to its text and unblurred so the illustration on the right stays visible */}
          <div className="w-fit max-w-full sm:max-w-xl px-3.5 py-2 rounded-[12px] bg-white/20 border border-white/60 text-xs sm:text-[13px] text-[#2a2b2f] leading-relaxed">
            {currentConfig.description}
          </div>
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
