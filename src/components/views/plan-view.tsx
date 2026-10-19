"use client";

import React, { useState } from "react";
import { formatMoney, convertAmount } from "@/lib/utils";
import { SUPPORTED_CURRENCIES } from "@/lib/currency";
import { parseAmount } from "@/lib/receipt-text";
import { SolarIcon } from "@/components/icons/solar";
import { SeiyaIcon } from "@/components/icons/seiya-logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PlanCard } from "@/components/cards/domain-cards";
import { useApp, PlanItem } from "@/lib/store";
import { PageHeader } from "@/components/ui/page-header";
import { CreateGoalDialog } from "@/components/modals/create-goal-dialog";
import { DeletePlanDialog } from "@/components/modals/delete-plan-dialog";
import { AdjustPlanDialog } from "@/components/modals/adjust-plan-dialog";

export function PlanView({ onNavigate }: { onNavigate?: (tab: any) => void }) {
  const { plans, wallets, bills, reportingCurrency, locale, partnerAName, partnerBName, setPendingDirectChat } = useApp();

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [planToDelete, setPlanToDelete] = useState<PlanItem | null>(null);
  const [adjustModalOpen, setAdjustModalOpen] = useState(false);
  const [planToAdjust, setPlanToAdjust] = useState<PlanItem | null>(null);

  const activePlans = plans.filter((p) => p.status === "Active");
  const draftPlans = plans.filter((p) => p.status === "Draft" || p.status === "Proposed");

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Affordability check state
  const [purchaseItem, setPurchaseItem] = useState("");
  const [purchaseAmountText, setPurchaseAmountText] = useState("");
  // Follows the household currency until the user picks another one.
  const [pickedCurrency, setPickedCurrency] = useState<string | null>(null);
  const purchaseCurrency = pickedCurrency ?? wallets.shared.currency ?? reportingCurrency;
  const [affordabilityResult, setAffordabilityResult] = useState<any>(null);
  const [affordabilityError, setAffordabilityError] = useState("");

  const handleRunAffordabilityCheck = () => {
    const purchaseAmount = parseAmount(purchaseAmountText) ?? 0;
    if (!purchaseItem.trim() || purchaseAmount <= 0) {
      setAffordabilityError("Enter what you want to buy and its price.");
      setAffordabilityResult(null);
      return;
    }
    setAffordabilityError("");
    const priceInShared = convertAmount(purchaseAmount, purchaseCurrency, wallets.shared.currency);
    const totalBills = bills.reduce(
      (acc, b) =>
        acc + (b.status !== "paid" ? convertAmount(b.amount, b.currency || wallets.shared.currency, wallets.shared.currency) : 0),
      0
    );
    const sharedBal = wallets.shared.balance;
    const remainingBuffer = sharedBal - totalBills - priceInShared;
    const safeBuffer = convertAmount(1000, "USD", wallets.shared.currency);

    setAffordabilityResult({
      price: purchaseAmount,
      currency: purchaseCurrency,
      sharedBal,
      totalBills,
      remainingBuffer,
      isAffordable: remainingBuffer > safeBuffer,
    });
  };

  return (
    <div className="space-y-8 max-w-5xl mx-auto pb-16">
      {/* 1. ACTIVE GOALS & PLANS */}
      <div>
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2.5">
          <div className="flex items-center gap-2">
            <h3 className="text-base sm:text-lg font-serif font-normal text-[#2a2b2f]">Active Couple Goals</h3>
            <Badge variant="neutral">{activePlans.length} Goals</Badge>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (onNavigate) {
                  onNavigate("draft_goals");
                }
              }}
              className="text-xs border-[#d1c9bf] hover:bg-[#faeade]/60 text-[#2a2b2f] font-semibold flex items-center gap-1.5 cursor-pointer shadow-2xs"
            >
              <SolarIcon name="edit" size={14} className="text-[#808988]" />
              <span>Draft Goals ({draftPlans.length})</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (onNavigate) {
                  onNavigate("add_goal");
                }
              }}
              className="text-xs border-[#B45529]/40 hover:bg-[#faeade] text-[#B45529] font-semibold flex items-center gap-1.5 cursor-pointer shadow-2xs"
            >
              <SolarIcon name="plus" size={14} className="text-[#B45529]" />
              <span>Add Goal Manually</span>
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setPendingDirectChat({ message: "Help us plan a new savings goal. Please ask me what it is for, the amount and the target date.", mode: "personal" });
                onNavigate?.("seiya");
              }}
              className="text-xs flex items-center gap-1.5 cursor-pointer shadow-2xs"
            >
              <SeiyaIcon size={14} color="#fef9ef" />
              <span>Create with Seiya</span>
            </Button>
          </div>
        </div>

        {activePlans.length === 0 ? (
          <div className="py-12 text-center space-y-3 bg-[#f5eee1]/60 rounded-[12px] border border-dashed border-[#d1c9bf]">
            <div className="w-10 h-10 rounded-full bg-[#fef9ef] text-[#808988] flex items-center justify-center mx-auto">
              <SolarIcon name="money-bag" size={20} />
            </div>
            <p className="text-xs text-[#515151]">No active couple goals currently active.</p>
            {draftPlans.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onNavigate && onNavigate("draft_goals")}
                className="text-xs border-[#B45529]/40 text-[#B45529] hover:bg-[#faeade]"
              >
                View {draftPlans.length} Draft Goal{draftPlans.length > 1 ? "s" : ""}
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {activePlans.map((p) => {
              const planCurr = p.currency || reportingCurrency;
              return (
                <PlanCard
                  key={p.id}
                  title={p.title}
                  targetAmount={p.targetAmount}
                  currency={planCurr}
                  currentAmount={p.currentAmount}
                  horizon={p.targetDate}
                  monthlyTarget={p.recommendedMonthly}
                  split={`${partnerBName} ${formatMoney(p.splitRecommendation.partnerB, planCurr, locale)} • ${partnerAName} ${formatMoney(p.splitRecommendation.partnerA, planCurr, locale)}`}
                  fundingWallet={p.walletFunding}
                  assumptions={p.assumptions}
                  status={p.status}
                  onAdjust={() => {
                    setPlanToAdjust(p);
                    setAdjustModalOpen(true);
                  }}
                  onDelete={() => {
                    setPlanToDelete(p);
                    setDeleteModalOpen(true);
                  }}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* 2. INTERACTIVE PURCHASE AFFORDABILITY CALCULATOR */}
      <div className="p-6 sm:p-8 rounded-[12px] bg-[#f5eee1] shadow-xs space-y-5">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-full bg-[#fef9ef] text-[#B45529]">
            <SolarIcon name="card" size={20} />
          </div>
          <div>
            <h3 className="text-sm font-serif font-normal text-[#2a2b2f]">Purchase Affordability Checker</h3>
            <p className="text-xs text-[#515151]">
              Check if an upcoming large purchase impacts shared reserves or bills before buying.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
          <div className="sm:col-span-4">
            <label className="text-xs font-semibold text-[#333333] block mb-1">Item Name</label>
            <Input
              value={purchaseItem}
              onChange={(e) => setPurchaseItem(e.target.value)}
              placeholder="e.g. New laptop"
              maxLength={80}
            />
          </div>
          <div className="sm:col-span-3">
            <label className="text-xs font-semibold text-[#333333] block mb-1">Price</label>
            <Input
              type="text"
              inputMode="decimal"
              value={purchaseAmountText}
              onChange={(e) => setPurchaseAmountText(e.target.value)}
              placeholder={purchaseCurrency === "IDR" ? "e.g. 15.000.000" : "e.g. 1,200"}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-semibold text-[#333333] block mb-1">Currency</label>
            <select
              value={purchaseCurrency}
              onChange={(e) => setPickedCurrency(e.target.value)}
              className="w-full h-11 px-4 rounded-full border border-[#d1c9bf] bg-[#fef9ef] text-xs font-mono font-bold text-[#2a2b2f] focus:outline-none focus:ring-2 focus:ring-[#B45529]/30"
            >
              {Object.keys(SUPPORTED_CURRENCIES).map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-3">
            <Button
              variant="primary"
              size="md"
              onClick={handleRunAffordabilityCheck}
              className="w-full h-11 text-xs"
            >
              Check Affordability
            </Button>
          </div>
        </div>

        {affordabilityError && <p className="text-xs text-[#a34426]">{affordabilityError}</p>}

        {/* Calculation Result */}
        {affordabilityResult && (
          <div className="mt-4 p-5 sm:p-6 rounded-[12px] bg-[#fef9ef] space-y-3.5 animate-in fade-in-0">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold font-mono uppercase tracking-wider text-[#808988]">
                Seiya Affordability Assessment
              </span>
              <Badge variant={affordabilityResult.isAffordable ? "allow" : "hold"}>
                {affordabilityResult.isAffordable ? "Safe to proceed" : "Cushion at risk"}
              </Badge>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-3.5 bg-[#f5eee1] rounded-[12px]">
                <span className="text-[#808988] block text-[11px]">Purchase Price</span>
                <span className="font-bold text-[#2a2b2f] font-serif">
                  {formatMoney(affordabilityResult.price, affordabilityResult.currency, locale)}
                </span>
              </div>
              <div className="p-3.5 bg-[#f5eee1] rounded-[12px]">
                <span className="text-[#808988] block text-[11px]">Shared Wallet Balance</span>
                <span className="font-bold text-[#B45529] font-serif">
                  {formatMoney(affordabilityResult.sharedBal, wallets.shared.currency, locale)}
                </span>
              </div>
              <div className="p-3.5 bg-[#f5eee1] rounded-[12px]">
                <span className="text-[#808988] block text-[11px]">Upcoming Bills</span>
                <span className="font-bold text-[#a34426] font-serif">
                  {formatMoney(affordabilityResult.totalBills, wallets.shared.currency, locale)}
                </span>
              </div>
              <div className="p-3.5 bg-[#f5eee1] rounded-[12px]">
                <span className="text-[#808988] block text-[11px]">Post-Purchase Cushion</span>
                <span
                  className={`font-bold font-serif ${
                    affordabilityResult.remainingBuffer > 0 ? "text-[#2d5232]" : "text-[#a34426]"
                  }`}
                >
                  {formatMoney(affordabilityResult.remainingBuffer, wallets.shared.currency, locale)}
                </span>
              </div>
            </div>

            <p className="text-xs text-[#515151] leading-relaxed pt-1">
              {affordabilityResult.isAffordable
                ? "This purchase fits within your shared reserves and covers all scheduled bills for this month without tapping into emergency savings."
                : "This purchase leaves your remaining shared balance below your recommended safety cushion after accounting for scheduled bills. Consider deferring or splitting proportionally."}
            </p>
          </div>
        )}
      </div>


      {/* Toast Feedback */}
      {toastMessage && (
        <div className="fixed bottom-20 md:bottom-8 right-6 z-50 p-3.5 rounded-[14px] bg-[#edf3ec] text-[#2d5232] text-xs font-semibold flex items-center gap-2.5 border border-[#2d5232]/30 shadow-lg animate-in fade-in-0 slide-in-from-bottom-2">
          <SolarIcon name="check-circle" size={18} className="shrink-0 text-[#2d5232]" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Dual-Key Consensus Delete Goal Dialog */}
      <DeletePlanDialog
        plan={planToDelete}
        open={deleteModalOpen}
        onOpenChange={setDeleteModalOpen}
        onDeleted={() => {
          showToast("Goal successfully dissolved with dual-key consensus.");
          setPlanToDelete(null);
        }}
      />

      {/* Adjust Goal Dialog */}
      <AdjustPlanDialog
        open={adjustModalOpen}
        onOpenChange={setAdjustModalOpen}
        plan={planToAdjust}
        onPlanAdjusted={(updated) => {
          showToast(`Goal "${updated.title}" successfully adjusted.`);
          setPlanToAdjust(null);
        }}
      />
    </div>
  );
}
