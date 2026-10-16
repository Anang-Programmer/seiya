"use client";

import React, { useState, useMemo } from "react";
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { SolarIcon, SolarIconName } from "@/components/icons/solar";
import { useApp, PlanItem } from "@/lib/store";
import { SUPPORTED_CURRENCIES } from "@/lib/currency";
import { formatMoney } from "@/lib/utils";

interface CreateGoalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
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

export function CreateGoalDialog({ open, onOpenChange, onGoalCreated }: CreateGoalDialogProps) {
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
  const years = [currentYear.toString(), (currentYear + 1).toString(), (currentYear + 2).toString(), (currentYear + 3).toString(), (currentYear + 5).toString()];

  // Calculated Horizon and Monthly target
  const { durationMonths, monthlyTotal, partnerAAmount, partnerBAmount, activeSplitA, activeSplitB } = useMemo(() => {
    const targetNum = Number(targetAmount) || 0;
    const currentNum = Number(currentAmount) || 0;
    const remaining = Math.max(0, targetNum - currentNum);

    // Calculate approximate duration in months from now
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const targetNum = Number(targetAmount) || 0;
    const currentNum = Number(currentAmount) || 0;
    const targetDateFormatted = `${targetMonth} ${targetYear} (${durationMonths} mos)`;

    const defaultAssumptions = assumptions.trim()
      ? assumptions.trim()
      : `Planned monthly allocation of ${formatMoney(monthlyTotal, currency, locale)}. ${partnerBName} ${activeSplitB}% (${formatMoney(partnerBAmount, currency, locale)}), ${partnerAName} ${activeSplitA}% (${formatMoney(partnerAAmount, currency, locale)}). ${requireDualKey ? "Dual-Key required for milestone releases." : "Autonomous contributions."}`;

    const createdPlan = addPlan({
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

    if (onGoalCreated) {
      onGoalCreated(createdPlan);
    }

    onOpenChange(false);
  };

  const availableCurrencies = Object.values(SUPPORTED_CURRENCIES);

  return (
    <Dialog open={open} onOpenChange={onOpenChange} className="max-w-2xl max-h-[92vh] flex flex-col">
      <DialogHeader onClose={() => onOpenChange(false)} className="border-b border-[#d1c9bf]/30 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-[#faeade] text-[#B45529] flex items-center justify-center shrink-0">
            <SolarIcon name="money-bag" size={18} />
          </div>
          <div>
            <DialogTitle className="text-xl font-serif font-normal text-[#2a2b2f]">
              Add Financial Goal & Couple Plan
            </DialogTitle>
            <DialogDescription className="text-xs text-[#515151]">
              Set a mutual target, monthly contributions, and dual-key funding rules.
            </DialogDescription>
          </div>
        </div>
      </DialogHeader>

      <DialogContent className="space-y-5 overflow-y-auto pr-1">
        <form id="create-goal-form" onSubmit={handleSubmit} className="space-y-5">
          {/* 1. CATEGORY CHIPS SELECTOR */}
          <div>
            <label className="text-xs font-semibold text-[#515151] block mb-2">
              Select Goal Category
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {CATEGORY_PRESETS.map((preset) => {
                const isSelected = category === preset.label;
                return (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => handleSelectPreset(preset)}
                    className={`p-2.5 rounded-[12px] border text-left transition-all cursor-pointer flex items-center gap-2.5 ${
                      isSelected
                        ? "bg-[#faeade] border-[#B45529] text-[#B45529] font-semibold shadow-2xs"
                        : "bg-[#f5eee1] border-[#d1c9bf]/50 text-[#515151] hover:bg-[#ece3d3]"
                    }`}
                  >
                    <SolarIcon name={preset.icon} size={16} className={isSelected ? "text-[#B45529]" : "text-[#808988]"} />
                    <span className="text-xs truncate">{preset.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. GOAL TITLE */}
          <div>
            <label className="text-xs font-semibold text-[#515151] block mb-1">
              Goal Title <span className="text-[#a34426]">*</span>
            </label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Kyoto Vacation Trip, Wedding Reserve..."
              className="bg-white border-[#d1c9bf] text-sm h-10 font-medium"
              required
            />
          </div>

          {/* 3. TARGET AMOUNT, INITIAL SAVINGS & CURRENCY */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <div>
              <label className="text-xs font-semibold text-[#515151] block mb-1">
                Target Amount <span className="text-[#a34426]">*</span>
              </label>
              <div className="relative">
                <Input
                  type="number"
                  min={1}
                  value={targetAmount}
                  onChange={(e) => setTargetAmount(e.target.value)}
                  className="bg-white border-[#d1c9bf] text-sm h-10 font-mono font-bold pr-2"
                  required
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-[#515151] block mb-1">
                Already Saved (Initial)
              </label>
              <Input
                type="number"
                min={0}
                value={currentAmount}
                onChange={(e) => setCurrentAmount(e.target.value)}
                className="bg-white border-[#d1c9bf] text-sm h-10 font-mono font-medium"
                placeholder="0"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-[#515151] block mb-1">
                Target Currency
              </label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full h-10 px-3 rounded-full border border-[#d1c9bf] bg-white text-xs font-mono font-semibold text-[#2a2b2f]"
              >
                {availableCurrencies.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} ({c.symbol})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 4. TARGET DATE & HORIZON ESTIMATOR */}
          <div className="p-4 rounded-[14px] bg-[#f5eee1] border border-[#d1c9bf]/40 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <SolarIcon name="calendar" size={16} className="text-[#B45529]" />
                <span className="text-xs font-bold text-[#2a2b2f]">Target Horizon & Completion</span>
              </div>
              <Badge variant="neutral" className="font-mono text-[11px]">
                {durationMonths} Months Duration
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-semibold text-[#515151] block mb-1">
                  Target Month
                </label>
                <select
                  value={targetMonth}
                  onChange={(e) => setTargetMonth(e.target.value)}
                  className="w-full h-9 px-3 rounded-[10px] border border-[#d1c9bf] bg-white text-xs font-medium text-[#2a2b2f]"
                >
                  {months.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-[#515151] block mb-1">
                  Target Year
                </label>
                <select
                  value={targetYear}
                  onChange={(e) => setTargetYear(e.target.value)}
                  className="w-full h-9 px-3 rounded-[10px] border border-[#d1c9bf] bg-white text-xs font-medium text-[#2a2b2f]"
                >
                  {years.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-[#d1c9bf]/40 text-xs">
              <span className="text-[#515151]">Total Needed Monthly:</span>
              <span className="font-mono font-bold text-sm text-[#B45529]">
                {formatMoney(monthlyTotal, currency, locale)} / month
              </span>
            </div>
          </div>

          {/* 5. FUNDING SOURCE & COUPLE SPLIT */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-[#515151]">
                Contribution Split & Funding Source
              </label>
              <div className="inline-flex items-center gap-1 bg-[#f5eee1] p-0.5 rounded-full text-[11px]">
                <button
                  type="button"
                  onClick={() => setSplitMode("contract")}
                  className={`px-2.5 py-1 rounded-full font-semibold transition-all cursor-pointer ${
                    splitMode === "contract"
                      ? "bg-[#B45529] text-[#fef9ef] shadow-xs"
                      : "text-[#515151] hover:text-[#2a2b2f]"
                  }`}
                >
                  Contract ({contract.splitPartnerA}:{contract.splitPartnerB})
                </button>
                <button
                  type="button"
                  onClick={() => setSplitMode("equal")}
                  className={`px-2.5 py-1 rounded-full font-semibold transition-all cursor-pointer ${
                    splitMode === "equal"
                      ? "bg-[#B45529] text-[#fef9ef] shadow-xs"
                      : "text-[#515151] hover:text-[#2a2b2f]"
                  }`}
                >
                  50 : 50
                </button>
                <button
                  type="button"
                  onClick={() => setSplitMode("custom")}
                  className={`px-2.5 py-1 rounded-full font-semibold transition-all cursor-pointer ${
                    splitMode === "custom"
                      ? "bg-[#B45529] text-[#fef9ef] shadow-xs"
                      : "text-[#515151] hover:text-[#2a2b2f]"
                  }`}
                >
                  Custom
                </button>
              </div>
            </div>

            {/* Custom Split Inputs if selected */}
            {splitMode === "custom" && (
              <div className="grid grid-cols-2 gap-3 p-3 rounded-[12px] bg-[#f5eee1] border border-[#d1c9bf]/40">
                <div>
                  <label className="text-[11px] font-semibold text-[#515151] block mb-1">
                    {partnerAName} (%)
                  </label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={customSplitA}
                    onChange={(e) => {
                      const val = Number(e.target.value) || 0;
                      setCustomSplitA(val);
                      setCustomSplitB(100 - val);
                    }}
                    className="bg-white text-xs h-8 font-mono"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-[#515151] block mb-1">
                    {partnerBName} (%)
                  </label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={customSplitB}
                    onChange={(e) => {
                      const val = Number(e.target.value) || 0;
                      setCustomSplitB(val);
                      setCustomSplitA(100 - val);
                    }}
                    className="bg-white text-xs h-8 font-mono"
                  />
                </div>
              </div>
            )}

            {/* Live Monthly Split Preview Box */}
            <div className="grid grid-cols-2 gap-3 p-3.5 rounded-[14px] bg-[#fef9ef] border border-[#d1c9bf]/60 shadow-2xs">
              <div className="border-r border-[#d1c9bf]/40 pr-2">
                <span className="text-[11px] text-[#515151] block">{partnerAName}&apos;s Share ({activeSplitA}%)</span>
                <span className="font-mono font-bold text-sm text-[#2d5232]">
                  {formatMoney(partnerAAmount, currency, locale)}
                </span>
                <span className="text-[10px] text-[#808988] block">per month</span>
              </div>
              <div className="pl-1">
                <span className="text-[11px] text-[#515151] block">{partnerBName}&apos;s Share ({activeSplitB}%)</span>
                <span className="font-mono font-bold text-sm text-[#B45529]">
                  {formatMoney(partnerBAmount, currency, locale)}
                </span>
                <span className="text-[10px] text-[#808988] block">per month</span>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-[#515151] block mb-1">
                Funding Allocation Source
              </label>
              <select
                value={fundingWallet}
                onChange={(e) => setFundingWallet(e.target.value)}
                className="w-full h-9 px-3 rounded-[10px] border border-[#d1c9bf] bg-white text-xs font-medium text-[#2a2b2f]"
              >
                <option value="Planned shared contributions">Planned shared contributions (Joint Pool)</option>
                <option value="Dedicated goal vault">Dedicated couple goal vault</option>
                <option value="Personal wallets split transfer">Personal wallets regular split transfer</option>
                <option value="External mutual bank reserve">External mutual bank reserve</option>
              </select>
            </div>
          </div>

          {/* 6. SAFEGUARDS & ASSUMPTIONS */}
          <div className="space-y-3 pt-1">
            <div className="flex items-center justify-between p-3 rounded-[12px] bg-[#f5eee1] border border-[#d1c9bf]/40">
              <div className="flex items-center gap-2">
                <SolarIcon name="shield-check" size={17} className="text-[#2d5232]" />
                <div>
                  <span className="text-xs font-semibold text-[#2a2b2f] block leading-tight">
                    Dual-Key Withdrawal Consensus
                  </span>
                  <span className="text-[10px] text-[#808988]">
                    Require both partner signatures before spending from this goal
                  </span>
                </div>
              </div>
              <input
                type="checkbox"
                checked={requireDualKey}
                onChange={(e) => setRequireDualKey(e.target.checked)}
                className="w-4 h-4 accent-[#B45529] cursor-pointer shrink-0"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-[#515151] block mb-1">
                Planning Assumptions & Notes (Optional)
              </label>
              <textarea
                value={assumptions}
                onChange={(e) => setAssumptions(e.target.value)}
                placeholder="e.g. Flight tickets purchased 3 months ahead; hotel paid on arrival. Will re-evaluate if currency fluctuates."
                rows={2}
                className="w-full p-2.5 rounded-[12px] border border-[#d1c9bf] bg-white text-xs text-[#2a2b2f] placeholder-[#808988] outline-none focus:ring-1 focus:ring-[#B45529]"
              />
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#515151]">Initial Status</span>
              <div className="inline-flex items-center gap-1 bg-[#f5eee1] p-0.5 rounded-full text-xs">
                {(["Active", "Proposed", "Draft"] as const).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setInitialStatus(st)}
                    className={`px-3 py-1 rounded-full font-semibold transition-all cursor-pointer ${
                      initialStatus === st
                        ? "bg-[#B45529] text-[#fef9ef] shadow-xs"
                        : "text-[#515151] hover:text-[#2a2b2f]"
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </form>
      </DialogContent>

      <DialogFooter className="border-t border-[#d1c9bf]/30 pt-3 flex items-center justify-between">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onOpenChange(false)}
          className="text-xs text-[#808988] hover:text-[#2a2b2f]"
        >
          Cancel
        </Button>
        <Button
          type="submit"
          form="create-goal-form"
          size="sm"
          className="bg-[#B45529] hover:bg-[#96431e] text-[#fef9ef] text-xs px-5 py-2 rounded-full shadow-xs cursor-pointer flex items-center gap-1.5"
        >
          <SolarIcon name="plus" size={14} />
          <span>Save & Add Goal</span>
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
