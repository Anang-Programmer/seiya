"use client";

import React, { useState, useMemo } from "react";
import { SolarIcon, SolarIconName } from "@/components/icons/solar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useApp, PlanItem } from "@/lib/store";
import { SUPPORTED_CURRENCIES } from "@/lib/currency";
import { formatMoney, formatMoneyConverted } from "@/lib/utils";

interface AddGoalViewProps {
  onBack: () => void;
  onGoalCreated?: (plan: PlanItem) => void;
}

const CATEGORY_PRESETS: { label: string; icon: SolarIconName; defaultTitle: string }[] = [
  { label: "Travel", icon: "plane", defaultTitle: "Kyoto Vacation Trip" },
  { label: "Home & Living", icon: "home", defaultTitle: "Down Payment for First Home" },
  { label: "Safety Net", icon: "shield-check", defaultTitle: "Emergency Reserve (6 Months)" },
  { label: "Wedding & Life", icon: "heart", defaultTitle: "Wedding Celebration Fund" },
  { label: "Mobility", icon: "car", defaultTitle: "Couple City Vehicle" },
  { label: "Investment", icon: "chart", defaultTitle: "Long-Term Growth Portfolio" },
];

export function AddGoalView({ onBack, onGoalCreated }: AddGoalViewProps) {
  const {
    reportingCurrency,
    locale,
    partnerAName,
    partnerBName,
    contract,
    addPlan,
  } = useApp();

  // Form State
  const [title, setTitle] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [category, setCategory] = useState("Travel");
  const [targetAmount, setTargetAmount] = useState<number | string>(10000);
  const [currentAmount, setCurrentAmount] = useState<number | string>(1500);
  const [currency, setCurrency] = useState(reportingCurrency || "USD");

  // Horizon State: Month & Year
  const currentYear = new Date().getFullYear();
  const [targetMonth, setTargetMonth] = useState("Dec");
  const [targetYear, setTargetYear] = useState((currentYear + 1).toString());

  // Funding & Split State
  const [fundingWallet, setFundingWallet] = useState("Planned shared contributions");
  const [splitMode, setSplitMode] = useState<"contract" | "equal" | "custom">("contract");
  const [customSplitA, setCustomSplitA] = useState(contract.splitPartnerA);
  const [customSplitB, setCustomSplitB] = useState(contract.splitPartnerB);

  // Assumptions & Rules
  const [assumptions, setAssumptions] = useState("");
  const [requireDualKey, setRequireDualKey] = useState(true);
  const [initialStatus, setInitialStatus] = useState<"Active" | "Proposed" | "Draft">("Active");

  // Month options
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const years = [
    currentYear.toString(),
    (currentYear + 1).toString(),
    (currentYear + 2).toString(),
    (currentYear + 3).toString(),
    (currentYear + 5).toString(),
  ];

  // Calculated Horizon and Monthly target
  const { durationMonths, monthlyTotal, partnerAAmount, partnerBAmount, activeSplitA, activeSplitB } = useMemo(() => {
    const targetNum = Number(targetAmount) || 0;
    const currentNum = Number(currentAmount) || 0;
    const remaining = Math.max(0, targetNum - currentNum);

    const now = new Date();
    const monthIndex = months.indexOf(targetMonth);
    const targetDateObj = new Date(Number(targetYear), monthIndex, 1);
    const diffMonths = Math.max(
      1,
      (targetDateObj.getFullYear() - now.getFullYear()) * 12 + (targetDateObj.getMonth() - now.getMonth())
    );

    const monthly = Math.round(remaining / diffMonths);

    let splitA = contract.splitPartnerA;
    let splitB = contract.splitPartnerB;
    if (splitMode === "equal") {
      splitA = 50;
      splitB = 50;
    } else if (splitMode === "custom") {
      splitA = Number(customSplitA) || 50;
      splitB = Number(customSplitB) || 50;
    }

    const aAmt = Math.round((monthly * splitA) / 100);
    const bAmt = monthly - aAmt;

    return {
      durationMonths: diffMonths,
      monthlyTotal: monthly,
      partnerAAmount: aAmt,
      partnerBAmount: bAmt,
      activeSplitA: splitA,
      activeSplitB: splitB,
    };
  }, [targetAmount, currentAmount, targetMonth, targetYear, splitMode, customSplitA, customSplitB, contract]);

  const handleSelectPreset = (preset: { label: string; defaultTitle: string }) => {
    setCategory(preset.label);
    if (!title || CATEGORY_PRESETS.some((p) => p.defaultTitle === title)) {
      setTitle(preset.defaultTitle);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || isSaving) return;

    const targetNum = Number(targetAmount) || 0;
    const currentNum = Number(currentAmount) || 0;
    const targetDateFormatted = `${targetMonth} ${targetYear} (${durationMonths} mos)`;

    const defaultAssumptions = assumptions.trim()
      ? assumptions.trim()
      : `Planned monthly allocation of ${formatMoney(monthlyTotal, currency, locale)}. ${partnerBName} ${activeSplitB}% (${formatMoney(partnerBAmount, currency, locale)}), ${partnerAName} ${activeSplitA}% (${formatMoney(partnerAAmount, currency, locale)}). ${requireDualKey ? "Dual-Key required for milestone releases." : "Autonomous contributions."}`;

    setIsSaving(true);
    const createdPlan = await addPlan({
      title: title.trim(),
      category,
      targetAmount: targetNum,
      currentAmount: currentNum,
      currency,
      targetDate: targetDateFormatted,
      recommendedMonthly: monthlyTotal,
      splitRecommendation: {
        partnerA: partnerAAmount,
        partnerB: partnerBAmount,
      },
      walletFunding: fundingWallet,
      status: initialStatus,
      assumptions: defaultAssumptions,
    });

    setIsSaving(false);
    // On failure the store surfaces the error; keep the form open for a retry.
    if (!createdPlan) return;

    if (onGoalCreated) {
      onGoalCreated(createdPlan);
    }

    onBack();
  };

  const availableCurrencies = Object.values(SUPPORTED_CURRENCIES);

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-24">
      {/* Top Breadcrumb & Navigation */}
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white hover:bg-[#f5eee1] border border-[#d1c9bf]/60 text-xs font-semibold text-[#515151] hover:text-[#2a2b2f] transition-all cursor-pointer shadow-2xs group"
        >
          <SolarIcon name="arrow-left" size={14} className="text-[#B45529] group-hover:-translate-x-0.5 transition-transform" />
          <span>Back to Couple Goals</span>
        </button>

        <span className="text-xs text-[#808988]">Dual-Key Collaborative Goal Planner</span>
      </div>

      {/* Main Form Card */}
      <div className="bg-white rounded-[24px] border border-[#e8dfd5] shadow-[0_4px_24px_-4px_rgba(42,43,47,0.06)] overflow-hidden">
        {/* Header Banner */}
        <div className="p-6 sm:p-8 bg-[#fdf9f4] border-b border-[#e8dfd5]/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-[#faeade] text-[#B45529] flex items-center justify-center shrink-0 shadow-2xs">
              <SolarIcon name="money-bag" size={24} />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-serif text-[#2a2b2f] tracking-tight font-normal">
                Create New Couple Goal & Plan
              </h2>
              <p className="text-xs sm:text-sm text-[#808988] mt-1 leading-relaxed">
                Set transparent financial milestones, agree on automated split contributions, and configure dual-key withdrawals.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-center">
            <span className="text-xs font-semibold text-[#808988]">Initial Status:</span>
            <select
              value={initialStatus}
              onChange={(e) => setInitialStatus(e.target.value as any)}
              className="text-xs font-semibold rounded-full border border-[#d1c9bf] bg-white px-3 py-1.5 text-[#2a2b2f]"
            >
              <option value="Active">🟢 Active (Commit now)</option>
              <option value="Proposed">🟡 Proposed (Awaiting review)</option>
              <option value="Draft">⚪ Draft (Private notes)</option>
            </select>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-8">
          {/* 1. CATEGORY CHIPS SELECTOR */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-[#808988] block mb-3">
              1. Select Goal Category
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5">
              {CATEGORY_PRESETS.map((preset) => {
                const isSelected = category === preset.label;
                return (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => handleSelectPreset(preset)}
                    className={`p-3 rounded-[16px] border text-left transition-all cursor-pointer flex flex-col gap-2 ${
                      isSelected
                        ? "bg-[#faeade] border-[#B45529] text-[#B45529] font-bold shadow-xs scale-102"
                        : "bg-[#fef9ef] border-[#d1c9bf]/50 text-[#515151] hover:bg-[#f5eee1]"
                    }`}
                  >
                    <div className="w-7 h-7 rounded-full bg-white/80 flex items-center justify-center">
                      <SolarIcon name={preset.icon} size={16} className={isSelected ? "text-[#B45529]" : "text-[#808988]"} />
                    </div>
                    <span className="text-xs font-medium leading-tight">{preset.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. GOAL TITLE */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-[#808988] block mb-2">
              2. Goal Title <span className="text-[#a34426]">*</span>
            </label>
            <Input
              type="text"
              required
              placeholder="e.g. Kyoto Vacation Trip, Down Payment for First House..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="h-12 text-sm bg-[#fef9ef] border-[#d1c9bf] focus-visible:ring-[#B45529]"
            />
          </div>

          {/* 3. TARGET AMOUNT & CURRENCY & CURRENT SAVED */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-[#808988] block mb-2">
              3. Target Financial Horizon
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="text-xs font-semibold text-[#515151] block mb-1.5">
                  Target Amount <span className="text-[#a34426]">*</span>
                </label>
                <div className="relative">
                  <Input
                    type="number"
                    min="1"
                    step="1"
                    required
                    value={targetAmount}
                    onChange={(e) => setTargetAmount(e.target.value)}
                    className="h-11 text-sm font-mono font-bold bg-[#fef9ef] border-[#d1c9bf]"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-[#515151] block mb-1.5">
                  Already Saved (Initial Seed)
                </label>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={currentAmount}
                  onChange={(e) => setCurrentAmount(e.target.value)}
                  className="h-11 text-sm font-mono font-bold bg-[#fef9ef] border-[#d1c9bf]"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-[#515151] block mb-1.5">
                  Target Currency
                </label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-full h-11 px-3.5 rounded-[12px] border border-[#d1c9bf] bg-[#fef9ef] text-sm font-mono font-semibold text-[#2a2b2f]"
                >
                  {availableCurrencies.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code} ({c.symbol})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* 4. TARGET HORIZON & COMPLETION TIMELINE */}
          <div className="p-5 sm:p-6 rounded-[20px] bg-[#f5eee1] border border-[#d1c9bf]/60 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <SolarIcon name="calendar" size={18} className="text-[#B45529]" />
                <span className="text-sm font-bold text-[#2a2b2f]">Target Horizon & Completion</span>
              </div>
              <Badge variant="neutral" className="font-mono text-xs px-3 py-1">
                {durationMonths} Months Duration
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-[#515151] block mb-1 font-semibold">Target Month</label>
                <select
                  value={targetMonth}
                  onChange={(e) => setTargetMonth(e.target.value)}
                  className="w-full h-10 px-3 rounded-full border border-[#d1c9bf] bg-white text-xs font-semibold text-[#2a2b2f]"
                >
                  {months.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-[#515151] block mb-1 font-semibold">Target Year</label>
                <select
                  value={targetYear}
                  onChange={(e) => setTargetYear(e.target.value)}
                  className="w-full h-10 px-3 rounded-full border border-[#d1c9bf] bg-white text-xs font-semibold text-[#2a2b2f]"
                >
                  {years.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="pt-3 border-t border-[#d1c9bf]/40 flex items-center justify-between text-xs sm:text-sm">
              <span className="text-[#515151]">Total Needed Monthly (Combined):</span>
              <div className="text-right">
                <span className="font-serif font-extrabold text-base text-[#B45529] block">
                  {formatMoney(monthlyTotal, currency, locale)} / month
                </span>
                {currency !== reportingCurrency && (
                  <span className="text-[11px] font-serif text-[#808988] block">
                    ≈ {formatMoneyConverted(monthlyTotal, currency, reportingCurrency, locale)} / mo ({reportingCurrency})
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* 5. COUPLE SPLIT CONTRIBUTION */}
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <label className="text-xs font-bold uppercase tracking-wider text-[#808988]">
                4. Couple Contribution Split
              </label>

              {/* Split Mode Selector */}
              <div className="flex items-center gap-1 p-1 rounded-full bg-[#f5eee1] border border-[#d1c9bf]/60">
                <button
                  type="button"
                  onClick={() => setSplitMode("contract")}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                    splitMode === "contract" ? "bg-[#B45529] text-white shadow-2xs" : "text-[#515151] hover:text-[#2a2b2f]"
                  }`}
                >
                  Contract ({contract.splitPartnerA}:{contract.splitPartnerB})
                </button>
                <button
                  type="button"
                  onClick={() => setSplitMode("equal")}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                    splitMode === "equal" ? "bg-[#B45529] text-white shadow-2xs" : "text-[#515151] hover:text-[#2a2b2f]"
                  }`}
                >
                  50 : 50
                </button>
                <button
                  type="button"
                  onClick={() => setSplitMode("custom")}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                    splitMode === "custom" ? "bg-[#B45529] text-white shadow-2xs" : "text-[#515151] hover:text-[#2a2b2f]"
                  }`}
                >
                  Custom
                </button>
              </div>
            </div>

            {splitMode === "custom" && (
              <div className="p-4 rounded-[16px] bg-[#fdf9f4] border border-[#d1c9bf]/50 grid grid-cols-2 gap-4 animate-in fade-in-0">
                <div>
                  <label className="text-xs font-semibold text-[#515151] block mb-1">
                    {partnerAName} Split (%)
                  </label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={customSplitA}
                    onChange={(e) => {
                      const val = Number(e.target.value) || 0;
                      setCustomSplitA(val);
                      setCustomSplitB(100 - val);
                    }}
                    className="h-10 text-xs font-mono font-bold bg-white"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-[#515151] block mb-1">
                    {partnerBName} Split (%)
                  </label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={customSplitB}
                    onChange={(e) => {
                      const val = Number(e.target.value) || 0;
                      setCustomSplitB(val);
                      setCustomSplitA(100 - val);
                    }}
                    className="h-10 text-xs font-mono font-bold bg-white"
                  />
                </div>
              </div>
            )}

            {/* Live Monthly Breakdown preview cards */}
            <div className="grid grid-cols-2 gap-3.5">
              <div className="p-4 rounded-[16px] bg-[#fdfaf5] border border-[#d1c9bf]/60 flex flex-col justify-between">
                <div>
                  <span className="text-xs text-[#808988] block font-medium">{partnerAName}&apos;s Share ({activeSplitA}%)</span>
                  <span className="text-lg sm:text-xl font-bold font-serif text-[#2d5232] block mt-1">
                    {formatMoney(partnerAAmount, currency, locale)}
                  </span>
                  {currency !== reportingCurrency && (
                    <span className="text-[11px] font-serif text-[#808988] block mt-0.5">
                      ≈ {formatMoneyConverted(partnerAAmount, currency, reportingCurrency, locale)}
                    </span>
                  )}
                </div>
                <span className="text-[11px] text-[#808988] mt-2 block">per month</span>
              </div>

              <div className="p-4 rounded-[16px] bg-[#fdfaf5] border border-[#d1c9bf]/60 flex flex-col justify-between">
                <div>
                  <span className="text-xs text-[#808988] block font-medium">{partnerBName}&apos;s Share ({activeSplitB}%)</span>
                  <span className="text-lg sm:text-xl font-bold font-serif text-[#B45529] block mt-1">
                    {formatMoney(partnerBAmount, currency, locale)}
                  </span>
                  {currency !== reportingCurrency && (
                    <span className="text-[11px] font-serif text-[#808988] block mt-0.5">
                      ≈ {formatMoneyConverted(partnerBAmount, currency, reportingCurrency, locale)}
                    </span>
                  )}
                </div>
                <span className="text-[11px] text-[#808988] mt-2 block">per month</span>
              </div>
            </div>
          </div>

          {/* 6. FUNDING SOURCE & MULTISIG POLICY */}
          <div className="space-y-4">
            <label className="text-xs font-bold uppercase tracking-wider text-[#808988] block">
              5. Funding Source & Governance
            </label>

            <div>
              <label className="text-xs font-semibold text-[#515151] block mb-1.5">
                Funding Allocation Source
              </label>
              <select
                value={fundingWallet}
                onChange={(e) => setFundingWallet(e.target.value)}
                className="w-full h-11 px-3.5 rounded-[12px] border border-[#d1c9bf] bg-[#fef9ef] text-xs font-medium text-[#2a2b2f]"
              >
                <option value="Planned shared contributions (Joint Pool)">
                  Planned shared contributions (Joint Shared Vault)
                </option>
                <option value="Auto-split from individual wallets">
                  Auto-split from individual wallets ({partnerAName} & {partnerBName})
                </option>
                <option value="External savings allocation">
                  External high-yield savings allocation
                </option>
              </select>
            </div>

            <div className="p-4 rounded-[16px] bg-[#fdf9f4] border border-[#d1c9bf]/60 space-y-3">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={requireDualKey}
                  onChange={(e) => setRequireDualKey(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded text-[#B45529] focus:ring-[#B45529]"
                />
                <div>
                  <span className="text-xs font-bold text-[#2a2b2f] block">
                    Dual-Key Withdrawal Consensus
                  </span>
                  <span className="text-xs text-[#515151] block mt-0.5">
                    Any withdrawal or redemption of this goal requires mutual cryptographic approval from both partners.
                  </span>
                </div>
              </label>
            </div>
          </div>

          {/* 7. NOTES & ASSUMPTIONS */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-[#808988] block mb-2">
              6. Planning Assumptions / Notes (Optional)
            </label>
            <textarea
              rows={3}
              placeholder="e.g. Flight tickets to be booked by June; target includes $2,000 buffer for hotel reservations..."
              value={assumptions}
              onChange={(e) => setAssumptions(e.target.value)}
              className="w-full p-3.5 rounded-[14px] border border-[#d1c9bf] bg-[#fef9ef] text-xs text-[#2a2b2f] focus:outline-none focus:ring-2 focus:ring-[#B45529]/20"
            />
          </div>

          {/* Action Buttons */}
          <div className="pt-4 border-t border-[#e8dfd5] flex items-center justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={onBack}
              className="text-xs px-5 h-11 cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              className="text-xs px-6 h-11 flex items-center gap-2 cursor-pointer shadow-sm"
            >
              <SolarIcon name="check-circle" size={16} />
              <span>Save & Launch Couple Goal</span>
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
