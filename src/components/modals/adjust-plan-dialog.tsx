"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogContent,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { SolarIcon } from "@/components/icons/solar";
import { useApp, PlanItem } from "@/lib/store";
import { SUPPORTED_CURRENCIES } from "@/lib/currency";
import { formatMoney } from "@/lib/utils";

interface AdjustPlanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan: PlanItem | null;
  onPlanAdjusted?: (updated: PlanItem) => void;
}

export function AdjustPlanDialog({
  open,
  onOpenChange,
  plan,
  onPlanAdjusted,
}: AdjustPlanDialogProps) {
  const {
    reportingCurrency,
    locale,
    partnerAName,
    partnerBName,
    contract,
    updatePlan,
  } = useApp();

  const [title, setTitle] = useState("");
  const [targetAmount, setTargetAmount] = useState<number | string>(0);
  const [currentAmount, setCurrentAmount] = useState<number | string>(0);
  const [currency, setCurrency] = useState(reportingCurrency || "USD");

  const currentYear = new Date().getFullYear();
  const [targetMonth, setTargetMonth] = useState("Dec");
  const [targetYear, setTargetYear] = useState((currentYear + 1).toString());

  const [walletFunding, setWalletFunding] = useState("Planned shared contributions");
  const [splitMode, setSplitMode] = useState<"contract" | "equal" | "custom">("contract");
  const [customSplitA, setCustomSplitA] = useState(contract.splitPartnerA);
  const [customSplitB, setCustomSplitB] = useState(contract.splitPartnerB);
  const [status, setStatus] = useState<PlanItem["status"]>("Active");
  const [assumptions, setAssumptions] = useState("");

  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const years = [
    currentYear.toString(),
    (currentYear + 1).toString(),
    (currentYear + 2).toString(),
    (currentYear + 3).toString(),
    (currentYear + 5).toString(),
  ];

  // Populate form when plan opens
  useEffect(() => {
    if (plan) {
      setTitle(plan.title);
      setTargetAmount(plan.targetAmount);
      setCurrentAmount(plan.currentAmount);
      setCurrency(plan.currency || reportingCurrency);
      setWalletFunding(plan.walletFunding || "Planned shared contributions");
      setStatus(plan.status);
      setAssumptions(plan.assumptions || "");

      // Parse targetDate if format like "Jul 2027" or "Dec 2026"
      if (plan.targetDate) {
        const parts = plan.targetDate.split(" ");
        if (parts.length >= 2) {
          const m = parts[0].replace(/[^A-Za-z]/g, "");
          const y = parts[1].replace(/[^0-9]/g, "");
          if (months.includes(m)) setTargetMonth(m);
          if (years.includes(y)) setTargetYear(y);
        }
      }

      // Check split
      const totalSplit = plan.splitRecommendation.partnerA + plan.splitRecommendation.partnerB;
      if (totalSplit > 0) {
        const pctA = Math.round((plan.splitRecommendation.partnerA / totalSplit) * 100);
        const pctB = 100 - pctA;
        if (pctA === 50 && pctB === 50) {
          setSplitMode("equal");
        } else if (pctA === contract.splitPartnerA && pctB === contract.splitPartnerB) {
          setSplitMode("contract");
        } else {
          setSplitMode("custom");
          setCustomSplitA(pctA);
          setCustomSplitB(pctB);
        }
      }
    }
  }, [plan, reportingCurrency, contract]);

  // Dynamic calculations
  const { durationMonths, monthlyTotal, partnerAAmount, partnerBAmount, activeSplitA, activeSplitB } = useMemo(() => {
    const targetNum = Number(targetAmount) || 0;
    const currentNum = Number(currentAmount) || 0;
    const remaining = Math.max(0, targetNum - currentNum);

    const now = new Date();
    const monthIndex = months.indexOf(targetMonth);
    const targetDateObj = new Date(Number(targetYear), monthIndex >= 0 ? monthIndex : 11, 1);
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

  const handleSave = () => {
    if (!plan || !title.trim()) return;

    const formattedTargetDate = `${targetMonth} ${targetYear} (${durationMonths} months)`;

    const updatedData: Partial<PlanItem> = {
      title: title.trim(),
      targetAmount: Number(targetAmount) || 0,
      currentAmount: Number(currentAmount) || 0,
      currency,
      targetDate: formattedTargetDate,
      recommendedMonthly: monthlyTotal,
      splitRecommendation: {
        partnerB: partnerBAmount,
        partnerA: partnerAAmount,
      },
      walletFunding,
      status,
      assumptions:
        assumptions.trim() ||
        `Planned monthly contribution of ${formatMoney(monthlyTotal, currency, locale)}. ${partnerBName} ${activeSplitB}% (${formatMoney(partnerBAmount, currency, locale)}), ${partnerAName} ${activeSplitA}% (${formatMoney(partnerAAmount, currency, locale)}).`,
    };

    updatePlan(plan.id, updatedData);

    if (onPlanAdjusted) {
      onPlanAdjusted({
        ...plan,
        ...updatedData,
      } as PlanItem);
    }

    onOpenChange(false);
  };

  if (!plan) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-[#fef9ef] text-[#2a2b2f] border border-[#d1c9bf]/60 p-5 sm:p-7 shadow-xl rounded-[18px]">
        <DialogHeader className="mb-4">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-2 rounded-full bg-[#f5eee1] text-[#B45529]">
              <SolarIcon name="edit" size={20} />
            </div>
            <div>
              <DialogTitle className="text-lg sm:text-xl font-serif font-normal text-[#2a2b2f]">
                Adjust Couple Goal
              </DialogTitle>
              <DialogDescription className="text-xs text-[#515151]">
                Modify targets, timeline, contribution splits, or status for this financial milestone.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-5">
          {/* 1. Goal Title & Status */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2 space-y-1.5">
              <label className="text-xs font-semibold text-[#333333]">Goal Title</label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Kyoto Vacation Trip"
                className="bg-[#fef9ef] border-[#d1c9bf]"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[#333333]">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as PlanItem["status"])}
                className="w-full h-10 px-3 rounded-[10px] text-xs font-medium bg-[#fef9ef] border border-[#d1c9bf] text-[#2a2b2f] focus:outline-none focus:ring-2 focus:ring-[#B45529]/20"
              >
                <option value="Active">Active</option>
                <option value="Draft">Draft</option>
                <option value="Paused">Paused</option>
                <option value="Needs review">Needs review</option>
                <option value="Completed">Completed</option>
              </select>
            </div>
          </div>

          {/* 2. Target Amount & Currency */}
          <div className="p-4 rounded-[14px] bg-[#f5eee1] border border-[#d1c9bf]/50 space-y-3">
            <h4 className="text-xs font-serif font-semibold text-[#2a2b2f]">Target & Savings Progress</h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-[#515151]">Target Amount</label>
                <Input
                  type="number"
                  value={targetAmount}
                  onChange={(e) => setTargetAmount(e.target.value)}
                  className="font-serif bg-[#fef9ef] border-[#d1c9bf]"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-[#515151]">Saved so far</label>
                <Input
                  type="number"
                  value={currentAmount}
                  onChange={(e) => setCurrentAmount(e.target.value)}
                  className="font-serif bg-[#fef9ef] border-[#d1c9bf]"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-[#515151]">Currency</label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-full h-10 px-3 rounded-[10px] text-xs font-medium bg-[#fef9ef] border border-[#d1c9bf] text-[#2a2b2f] focus:outline-none focus:ring-2 focus:ring-[#B45529]/20 font-serif"
                >
                  {Object.values(SUPPORTED_CURRENCIES).map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code} ({c.symbol})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* 3. Horizon Timeline */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-[#333333]">Target Horizon</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <span className="text-[11px] text-[#515151]">Month</span>
                <select
                  value={targetMonth}
                  onChange={(e) => setTargetMonth(e.target.value)}
                  className="w-full h-10 px-3 rounded-[10px] text-xs font-medium bg-[#fef9ef] border border-[#d1c9bf] text-[#2a2b2f] focus:outline-none focus:ring-2 focus:ring-[#B45529]/20"
                >
                  {months.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <span className="text-[11px] text-[#515151]">Year</span>
                <select
                  value={targetYear}
                  onChange={(e) => setTargetYear(e.target.value)}
                  className="w-full h-10 px-3 rounded-[10px] text-xs font-medium bg-[#fef9ef] border border-[#d1c9bf] text-[#2a2b2f] focus:outline-none focus:ring-2 focus:ring-[#B45529]/20 font-serif"
                >
                  {years.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-span-2 sm:col-span-1 p-2.5 rounded-[10px] bg-[#f5eee1] border border-[#d1c9bf]/60 flex flex-col justify-center">
                <span className="text-[10px] text-[#808988] uppercase tracking-wider font-semibold">Duration</span>
                <span className="text-xs font-serif font-bold text-[#B45529]">
                  {durationMonths} months away
                </span>
              </div>
            </div>
          </div>

          {/* 4. Split Ratio Allocation */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-[#333333]">Monthly Split Strategy</label>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setSplitMode("contract")}
                  className={`px-2.5 py-1 text-[11px] font-semibold rounded-full transition-all cursor-pointer ${
                    splitMode === "contract"
                      ? "bg-[#B45529] text-[#fef9ef]"
                      : "bg-[#f5eee1] text-[#515151] hover:bg-[#faeade]"
                  }`}
                >
                  Contract ({contract.splitPartnerB}/{contract.splitPartnerA})
                </button>
                <button
                  type="button"
                  onClick={() => setSplitMode("equal")}
                  className={`px-2.5 py-1 text-[11px] font-semibold rounded-full transition-all cursor-pointer ${
                    splitMode === "equal"
                      ? "bg-[#B45529] text-[#fef9ef]"
                      : "bg-[#f5eee1] text-[#515151] hover:bg-[#faeade]"
                  }`}
                >
                  Equal (50/50)
                </button>
                <button
                  type="button"
                  onClick={() => setSplitMode("custom")}
                  className={`px-2.5 py-1 text-[11px] font-semibold rounded-full transition-all cursor-pointer ${
                    splitMode === "custom"
                      ? "bg-[#B45529] text-[#fef9ef]"
                      : "bg-[#f5eee1] text-[#515151] hover:bg-[#faeade]"
                  }`}
                >
                  Custom
                </button>
              </div>
            </div>

            {splitMode === "custom" && (
              <div className="p-3 rounded-[10px] bg-[#f5eee1] border border-[#d1c9bf]/50 grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-[#515151]">
                    {partnerBName} (%)
                  </label>
                  <Input
                    type="number"
                    value={customSplitB}
                    onChange={(e) => {
                      const val = Math.max(0, Math.min(100, Number(e.target.value) || 0));
                      setCustomSplitB(val);
                      setCustomSplitA(100 - val);
                    }}
                    className="font-serif bg-[#fef9ef]"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-[#515151]">
                    {partnerAName} (%)
                  </label>
                  <Input
                    type="number"
                    value={customSplitA}
                    onChange={(e) => {
                      const val = Math.max(0, Math.min(100, Number(e.target.value) || 0));
                      setCustomSplitA(val);
                      setCustomSplitB(100 - val);
                    }}
                    className="font-serif bg-[#fef9ef]"
                  />
                </div>
              </div>
            )}

            {/* Calculated Monthly Split Preview */}
            <div className="p-3.5 rounded-[12px] bg-[#f5eee1] border border-[#d1c9bf]/60 flex items-center justify-between flex-wrap gap-2 text-xs">
              <div>
                <span className="text-[#808988] block text-[10px] uppercase font-semibold">Total Monthly Target</span>
                <span className="font-serif text-sm font-bold text-[#2a2b2f]">
                  {formatMoney(monthlyTotal, currency, locale)}/mo
                </span>
              </div>
              <div className="text-right">
                <span className="text-[#808988] block text-[10px] uppercase font-semibold">Split Breakdown</span>
                <span className="font-serif font-semibold text-[#B45529]">
                  {partnerBName} {formatMoney(partnerBAmount, currency, locale)} • {partnerAName} {formatMoney(partnerAAmount, currency, locale)}
                </span>
              </div>
            </div>
          </div>

          {/* 5. Funding Wallet & Assumptions */}
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[#333333]">Funding Wallet</label>
              <Input
                value={walletFunding}
                onChange={(e) => setWalletFunding(e.target.value)}
                placeholder="e.g. Planned shared contributions"
                className="bg-[#fef9ef] border-[#d1c9bf]"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[#333333]">Assumptions & Rules</label>
              <Input
                value={assumptions}
                onChange={(e) => setAssumptions(e.target.value)}
                placeholder="e.g. Planned monthly contribution of USD 600. No auto-debit."
                className="bg-[#fef9ef] border-[#d1c9bf]"
              />
            </div>
          </div>
        </div>

        <DialogFooter className="mt-6 flex items-center justify-between gap-3 border-t border-[#d1c9bf]/60 pt-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="text-xs text-[#515151]"
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSave}
            disabled={!title.trim()}
            className="text-xs px-5 shadow-xs"
          >
            Save Adjustments
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
