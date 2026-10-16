"use client";

import React from "react";
import { formatMoney, getTransactionCategoryVisual } from "@/lib/utils";
import { SolarIcon } from "@/components/icons/solar";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogContent,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useApp, Transaction } from "@/lib/store";

interface TransactionDetailDialogProps {
  transaction: Transaction | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAskSeiya?: (prompt: string) => void;
}

export function TransactionDetailDialog({
  transaction,
  open,
  onOpenChange,
  onAskSeiya,
}: TransactionDetailDialogProps) {
  const {
    reportingCurrency,
    locale,
    partnerAName,
    partnerBName,
    contract,
    currentUser,
  } = useApp();

  if (!transaction) return null;

  const visual = getTransactionCategoryVisual(transaction.category, transaction.title);
  const isIncome = transaction.amount > 0;
  const absAmount = Math.abs(transaction.amount);
  const txCurrency = transaction.currency || reportingCurrency;

  const paidByName =
    transaction.paidBy === "partner_a" ? partnerAName : partnerBName;

  const getWalletLabel = (w: string) => {
    if (w === "shared") return "Shared Household Wallet";
    if (w === "personal_a") return `${partnerAName}'s Personal Wallet`;
    if (w === "personal_b") return `${partnerBName}'s Personal Wallet`;
    return w;
  };

  const splitB = transaction.splitRatio?.partnerB ?? contract.splitPartnerB ?? 60;
  const splitA = transaction.splitRatio?.partnerA ?? contract.splitPartnerA ?? 40;
  const shareB = (absAmount * splitB) / 100;
  const shareA = (absAmount * splitA) / 100;

  const handleAskSeiya = () => {
    if (onAskSeiya) {
      const prompt = `Can you break down our transaction "${transaction.title}" of ${formatMoney(
        absAmount,
        txCurrency,
        locale
      )} (${transaction.category}) and check how it fits our budget?`;
      onAskSeiya(prompt);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} className="max-w-md">
      <DialogHeader onClose={() => onOpenChange(false)}>
        <DialogTitle>Transaction Details</DialogTitle>
        <DialogDescription>
          Ledger ID #{transaction.id.toUpperCase()} • Dual-Key Verified
        </DialogDescription>
      </DialogHeader>

      <DialogContent className="space-y-4 max-h-[80vh] overflow-y-auto">
        {/* Main Hero Amount Card */}
        <div className="p-5 rounded-[12px] bg-[#f5eee1] text-center space-y-2 relative overflow-hidden">
          <div
            className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto shadow-xs ${visual.bgClass} ${visual.textClass}`}
          >
            <SolarIcon name={visual.iconName} size={22} />
          </div>

          <h3 className="text-base font-semibold text-[#2a2b2f]">
            {transaction.title}
          </h3>

          <div
            className={`text-3xl font-extrabold font-mono tracking-tight ${
              isIncome ? "text-[#2d5232]" : "text-[#2a2b2f]"
            }`}
          >
            {isIncome ? "+" : "-"}
            {formatMoney(absAmount, txCurrency, locale)}
          </div>

          <div className="flex items-center justify-center gap-2 pt-1 flex-wrap">
            <span
              className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full inline-flex items-center gap-1 ${
                isIncome
                  ? "bg-[#2d5232]/10 text-[#2d5232]"
                  : "bg-[#B45529]/10 text-[#B45529]"
              }`}
            >
              <SolarIcon
                name={isIncome ? "trend-up" : "trend-down"}
                size={12}
              />
              {isIncome ? "Income Received" : "Outgoing Expense"}
            </span>

            <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-[#fef9ef] text-[#515151] border border-[#d1c9bf]/50">
              {transaction.category}
            </span>
          </div>
        </div>

        {/* Transaction Metadata Breakdown */}
        <div className="p-4 rounded-[12px] bg-[#f5eee1] space-y-3 text-xs">
          <div className="flex items-center justify-between pb-2 border-b border-[#d1c9bf]/40">
            <span className="text-[#808988]">Date & Time</span>
            <span className="font-semibold text-[#2a2b2f]">
              {transaction.date}
            </span>
          </div>

          <div className="flex items-center justify-between pb-2 border-b border-[#d1c9bf]/40">
            <span className="text-[#808988]">Source Wallet</span>
            <span className="font-semibold text-[#2a2b2f]">
              {getWalletLabel(transaction.wallet)}
            </span>
          </div>

          <div className="flex items-center justify-between pb-2 border-b border-[#d1c9bf]/40">
            <span className="text-[#808988]">Paid By</span>
            <span className="font-semibold text-[#2a2b2f] flex items-center gap-1.5">
              <span
                className={`w-4 h-4 rounded-full text-[10px] text-white font-bold flex items-center justify-center ${
                  transaction.paidBy === "partner_a"
                    ? "bg-[#B45529]"
                    : "bg-[#3B1D17]"
                }`}
              >
                {paidByName.charAt(0)}
              </span>
              {paidByName}
            </span>
          </div>

          <div className="flex items-center justify-between pb-2 border-b border-[#d1c9bf]/40">
            <span className="text-[#808988]">Settlement Status</span>
            <span className="font-semibold text-[#2d5232] flex items-center gap-1">
              <SolarIcon name="check-circle" size={13} />
              Settled & Confirmed
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[#808988]">Gateway Security</span>
            <span className="font-mono text-[11px] text-[#515151]">
              SHA-256 Dual-Key Verified
            </span>
          </div>
        </div>

        {/* Split Allocation (for Shared Wallet or split transactions) */}
        {transaction.wallet === "shared" && !isIncome && (
          <div className="p-4 rounded-[12px] bg-[#f5eee1] space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-[#2a2b2f] flex items-center gap-1.5">
                <SolarIcon name="chart" size={14} className="text-[#B45529]" />
                Couple Contract Allocation
              </span>
              <span className="text-[11px] font-mono text-[#808988]">
                {splitB}% {partnerBName} / {splitA}% {partnerAName}
              </span>
            </div>

            {/* Split Progress Bar */}
            <div className="w-full h-2 rounded-full bg-[#d1c9bf]/40 overflow-hidden flex">
              <div
                className="h-full bg-[#3B1D17]"
                style={{ width: `${splitB}%` }}
                title={`${partnerBName}: ${splitB}%`}
              />
              <div
                className="h-full bg-[#B45529]"
                style={{ width: `${splitA}%` }}
                title={`${partnerAName}: ${splitA}%`}
              />
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="p-2.5 rounded-[10px] bg-[#fef9ef] border border-[#d1c9bf]/40">
                <span className="text-[11px] text-[#808988] block">
                  {partnerBName}&apos;s Share ({splitB}%)
                </span>
                <span className="text-xs font-mono font-bold text-[#2a2b2f]">
                  {formatMoney(shareB, txCurrency, locale)}
                </span>
              </div>

              <div className="p-2.5 rounded-[10px] bg-[#fef9ef] border border-[#d1c9bf]/40">
                <span className="text-[11px] text-[#808988] block">
                  {partnerAName}&apos;s Share ({splitA}%)
                </span>
                <span className="text-xs font-mono font-bold text-[#2a2b2f]">
                  {formatMoney(shareA, txCurrency, locale)}
                </span>
              </div>
            </div>

            {transaction.partnerBOwesA ? (
              <div className="text-[11px] text-[#B45529] font-medium pt-1 border-t border-[#d1c9bf]/40 flex items-center gap-1">
                <SolarIcon name="info-circle" size={13} />
                <span>
                  {partnerBName} owes {partnerAName}{" "}
                  {formatMoney(transaction.partnerBOwesA, txCurrency, locale)} for this purchase.
                </span>
              </div>
            ) : transaction.partnerAOwesB ? (
              <div className="text-[11px] text-[#B45529] font-medium pt-1 border-t border-[#d1c9bf]/40 flex items-center gap-1">
                <SolarIcon name="info-circle" size={13} />
                <span>
                  {partnerAName} owes {partnerBName}{" "}
                  {formatMoney(transaction.partnerAOwesB, txCurrency, locale)} for this purchase.
                </span>
              </div>
            ) : null}
          </div>
        )}
      </DialogContent>

      <DialogFooter className="flex flex-col sm:flex-row gap-2">
        {onAskSeiya && (
          <Button
            type="button"
            variant="outline"
            onClick={handleAskSeiya}
            className="w-full sm:w-auto flex items-center justify-center gap-1.5 cursor-pointer text-xs"
          >
            <SolarIcon name="chat-round-dots" size={14} className="text-[#B45529]" />
            Ask Seiya About This
          </Button>
        )}
        <Button
          type="button"
          onClick={() => onOpenChange(false)}
          className="w-full sm:w-auto bg-[#B45529] text-[#fef9ef] hover:bg-[#96421c] cursor-pointer text-xs"
        >
          Close
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
