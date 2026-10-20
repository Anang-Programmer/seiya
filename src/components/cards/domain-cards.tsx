"use client";

import React, { useState } from "react";
// Amounts here are decided on, so they stay visible in privacy mode.
import { formatMoneyAlways as formatMoney, formatMoneyConvertedAlways as formatMoneyConverted, cn } from "@/lib/utils";
import { SolarIcon } from "@/components/icons/solar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useApp } from "@/lib/store";
import { PinAuthDialog } from "@/components/modals/pin-auth-dialog";

// 1. ACTION CARD: ALLOW, NEED_APPROVAL, HOLD, DENY
export interface ActionCardProps {
  outcome: "ALLOW" | "NEED_APPROVAL" | "HOLD" | "DENY";
  title: string;
  amount?: number;
  currency?: string;
  category?: string;
  wallet?: string;
  reason: string;
  details?: {
    currency?: string;
    split?: string;
    settlementText?: string;
    paidBy?: string;
    holdUntil?: string;
    waitingFor?: string;
    safeAlternative?: string;
    txId?: string;
    heldId?: string;
    approvalId?: string;
  };
  onEdit?: () => void;
  onUndo?: () => void;
  onContinueHeld?: () => void;
  onRemindTomorrow?: () => void;
}

export function ActionCard({
  outcome,
  title,
  amount,
  currency,
  category,
  wallet,
  reason,
  details,
  onEdit,
  onUndo,
}: ActionCardProps) {
  const { undoTransaction, continueHeldPurchase, cancelHeldPurchase, reportingCurrency, locale } = useApp();
  const [undone, setUndone] = useState(false);
  const activeCurrency = currency || details?.currency || reportingCurrency;

  const config = {
    ALLOW: {
      badge: "Approved",
      badgeVariant: "allow" as const,
      iconName: "check-circle" as const,
      iconColor: "text-[#2d5232] bg-[#edf3ec]",
      borderColor: "bg-[#edf3ec]/80",
    },
    NEED_APPROVAL: {
      badge: "Needs Approval",
      badgeVariant: "need_approval" as const,
      iconName: "users-group-rounded" as const,
      iconColor: "text-[#B45529] bg-[#fbf0eb]",
      borderColor: "bg-[#fbf0eb]/90",
    },
    HOLD: {
      badge: "On Hold",
      badgeVariant: "hold" as const,
      iconName: "clock-circle" as const,
      iconColor: "text-[#C98A4F] bg-[#fcf5e8]",
      borderColor: "bg-[#fcf5e8]/90",
    },
    DENY: {
      badge: "Declined",
      badgeVariant: "deny" as const,
      iconName: "close-circle" as const,
      iconColor: "text-[#9e382b] bg-[#fcf0ee]",
      borderColor: "bg-[#fcf0ee]/90",
    },
  }[outcome];

  return (
    <div className={cn("p-5 rounded-[12px] transition-all my-3 shadow-xs", config.borderColor)}>
      {/* Top Header */}
      <div className="flex items-center justify-between gap-3 mb-2.5">
        <div className="flex items-center gap-2.5">
          <div className={cn("p-2 rounded-full", config.iconColor)}>
            <SolarIcon name={config.iconName} size={18} />
          </div>
          <div>
            <h4 className="text-sm font-serif font-normal text-[#2a2b2f] leading-tight">{title}</h4>
            {category && <span className="text-[11px] text-[#515151]">{category}</span>}
          </div>
        </div>
        <Badge variant={config.badgeVariant}>
          <SolarIcon name="shield-check" size={12} className="opacity-70" />
          {config.badge}
        </Badge>
      </div>

      {/* Amount Display */}
      {amount !== undefined && (
        <div className="my-2.5 flex items-baseline gap-2 flex-wrap">
          <span className="text-xl font-bold font-serif text-[#2a2b2f]">{formatMoney(amount, activeCurrency, locale)}</span>
          {activeCurrency !== reportingCurrency && (
            <span className="text-xs font-serif text-[#808988]">
              (≈ {formatMoneyConverted(amount, activeCurrency, reportingCurrency, locale)})
            </span>
          )}
          {wallet && <span className="text-xs text-[#515151]">from {wallet}</span>}
        </div>
      )}

      {/* Reason explanation */}
      <p className="text-xs text-[#333333] leading-relaxed mb-3 bg-[#fef9ef]/90 p-3 rounded-[12px]">
        {reason}
      </p>

      {/* Outcome specific details */}
      {outcome === "ALLOW" && (
        <div className="space-y-1.5 text-xs text-[#333333] mb-3 pt-2">
          {details?.split && (
            <div className="flex justify-between">
              <span className="text-[#515151]">Contract Split:</span>
              <span className="font-semibold text-[#2a2b2f]">{details.split}</span>
            </div>
          )}
          {details?.settlementText && (
            <div className="flex justify-between">
              <span className="text-[#515151]">Settlement:</span>
              <span className="font-semibold text-[#B45529]">{details.settlementText}</span>
            </div>
          )}
        </div>
      )}

      {outcome === "HOLD" && (
        <div className="space-y-1 text-xs mb-3 p-3 rounded-[12px] bg-[#fcf5e8] text-[#C98A4F]">
          <div className="flex items-center gap-1.5 font-semibold">
            <SolarIcon name="clock-circle" size={14} />
            <span>Safeguard cooling-off active</span>
          </div>
          <p className="text-[11px] opacity-90">
            Held until: <strong>{details?.holdUntil || "Tomorrow, 08:00"}</strong>. To purchase now, a second explicit confirmation is required.
          </p>
        </div>
      )}

      {outcome === "DENY" && details?.safeAlternative && (
        <div className="text-xs mb-3 p-3 rounded-[12px] bg-[#fcf0ee] text-[#9e382b]">
          <span className="font-semibold block mb-0.5">Safe alternative:</span>
          <p className="text-[11px] opacity-90">{details.safeAlternative}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        {outcome === "ALLOW" && details?.txId && (
          <>
            <Button
              variant="outline"
              size="sm"
              disabled={undone}
              onClick={async () => {
                if (details.txId && (await undoTransaction(details.txId))) {
                  setUndone(true);
                }
              }}
              className="text-xs"
            >
              <SolarIcon name="undo" size={14} />
              {undone ? "Undone" : "Undo"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onEdit}
              className="text-xs text-[#515151]"
            >
              <SolarIcon name="edit" size={14} />
              Edit
            </Button>
          </>
        )}

        {outcome === "HOLD" && details?.heldId && (
          <>
            <Button
              variant="primary"
              size="sm"
              onClick={() => continueHeldPurchase(details.heldId!)}
              className="text-xs"
            >
              Continue anyway (Rerun Gateway)
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => cancelHeldPurchase(details.heldId!)}
              className="text-xs"
            >
              Cancel purchase
            </Button>
          </>
        )}

        {outcome === "NEED_APPROVAL" && (
          <div className="flex items-center gap-2 text-xs text-[#B45529] font-medium">
            <SolarIcon name="clock-circle" size={14} />
            <span>Waiting for partner passkey approval (24h expiry)</span>
          </div>
        )}
      </div>
    </div>
  );
}

// 2. PLAN CARD: Draft, Proposed, Active, Needs review, Paused, Completed, Archived
export interface PlanCardProps {
  title: string;
  targetAmount: number;
  currency?: string;
  currentAmount?: number;
  horizon: string;
  monthlyTarget: number;
  split: string;
  fundingWallet?: string;
  assumptions: string;
  status: "Draft" | "Proposed" | "Active" | "Needs review" | "Paused" | "Completed" | "Archived";
  onSendToPartner?: () => void;
  onApprovePlan?: () => void;
  onAdjust?: () => void;
  onDelete?: () => void;
}

export function PlanCard({
  title,
  targetAmount,
  currency,
  currentAmount = 0,
  horizon,
  monthlyTarget,
  split,
  fundingWallet = "Shared savings",
  assumptions,
  status,
  onSendToPartner,
  onApprovePlan,
  onAdjust,
  onDelete,
}: PlanCardProps) {
  const { reportingCurrency, locale, verifySecurityPin } = useApp();
  const planCurrency = currency || reportingCurrency;
  const [activeStatus, setActiveStatus] = useState(status);
  const [showPinModal, setShowPinModal] = useState(false);
  const progressPercent = Math.min(100, Math.round((currentAmount / targetAmount) * 100));

  const statusVariant = {
    Draft: "draft" as const,
    Proposed: "pending" as const,
    Active: "active" as const,
    "Needs review": "hold" as const,
    Paused: "neutral" as const,
    Completed: "allow" as const,
    Archived: "neutral" as const,
  }[activeStatus];

  return (
    <div className="p-5 sm:p-6 rounded-[12px] bg-[#f5eee1] shadow-xs my-3 hover:shadow-sm transition-all">
      <div className="flex items-center justify-between gap-3 mb-3.5">
        <div className="flex items-center gap-2.5">
          <div className="p-2.5 rounded-full bg-[#fef9ef] text-[#B45529]">
            <SolarIcon name="money-bag" size={20} />
          </div>
          <div>
            <h4 className="text-base font-serif font-normal text-[#2a2b2f]">{title}</h4>
            <span className="text-xs text-[#515151]">Horizon: {horizon}</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {activeStatus !== "Active" && (
            <Badge variant={statusVariant}>{activeStatus}</Badge>
          )}
          {onDelete && (
            <button
              onClick={onDelete}
              className="p-1 rounded-full text-[#808988] hover:text-[#a34426] hover:bg-[#fcf0ee] transition-colors cursor-pointer"
              title="Dissolve goal (Requires dual PIN consensus)"
              aria-label="Delete goal"
            >
              <SolarIcon name="trash" size={15} />
            </button>
          )}
        </div>
      </div>

      {/* Progress & Target */}
      <div className="bg-[#fef9ef] rounded-[12px] p-4 mb-3.5">
        <div className="flex justify-between items-baseline mb-1.5">
          <span className="text-xs text-[#515151]">Target Goal:</span>
          <div className="text-right">
            <span className="text-lg font-bold font-serif text-[#2a2b2f] block">
              {formatMoney(targetAmount, planCurrency, locale)}
            </span>
            {planCurrency !== reportingCurrency && (
              <span className="text-[11px] text-[#808988] font-serif block">
                ≈ {formatMoneyConverted(targetAmount, planCurrency, reportingCurrency, locale)}
              </span>
            )}
          </div>
        </div>
        {currentAmount > 0 && (
          <div className="space-y-1.5 mb-2.5">
            <div className="flex justify-between text-xs text-[#333333]">
              <span className="font-serif">Saved: {formatMoney(currentAmount, planCurrency, locale)}</span>
              <span className="font-bold font-serif text-[#B45529]">{progressPercent}%</span>
            </div>
            <div className="w-full h-2 rounded-full bg-[#f5eee1] overflow-hidden">
              <div
                className="h-full bg-[#B45529] rounded-full transition-all"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2 text-xs pt-2.5">
          <div>
            <span className="text-[#515151] block text-[11px]">Monthly Target</span>
            <span className="font-semibold font-serif text-[#2a2b2f]">{formatMoney(monthlyTarget, planCurrency, locale)}/mo</span>
          </div>
          <div>
            <span className="text-[#515151] block text-[11px]">Funding</span>
            <span className="font-semibold text-[#2a2b2f]">{fundingWallet}</span>
          </div>
        </div>
      </div>

      {/* Split & Assumptions */}
      <div className="space-y-2 mb-4 text-xs">
        <div className="flex justify-between items-center text-[#2a2b2f] bg-[#fef9ef] p-3 rounded-[12px]">
          <span className="text-[#515151]">Split:</span>
          <span className="font-semibold text-[#B45529]">{split}</span>
        </div>
        {typeof assumptions === "string" && assumptions.trim() && (
          <div className="text-[11px] text-[#515151] bg-[#fef9ef] p-3 rounded-[12px]">
            <span className="font-medium text-[#2a2b2f] block mb-0.5">Assumptions & Rules:</span>
            {assumptions}
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap items-center gap-2 pt-2">
        {activeStatus === "Draft" && (
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              setActiveStatus("Proposed");
              if (onSendToPartner) onSendToPartner();
            }}
          >
            Send to partner
          </Button>
        )}
        {activeStatus === "Proposed" && (
          <Button
            variant="primary"
            size="sm"
            onClick={() => setShowPinModal(true)}
          >
            Approve & Activate
          </Button>
        )}
        {activeStatus === "Active" && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setActiveStatus("Paused")}
          >
            Pause plan
          </Button>
        )}
        {activeStatus === "Paused" && (
          <Button
            variant="primary"
            size="sm"
            onClick={() => setShowPinModal(true)}
          >
            Resume plan
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={onAdjust}>
          Adjust plan
        </Button>
      </div>

      {/* Security PIN verification for Goal Approval */}
      <PinAuthDialog
        open={showPinModal}
        onOpenChange={setShowPinModal}
        title="Approve & Activate Goal"
        description="Dual-Key signature requires 6-digit security PIN confirmation to activate this milestone."
        actionLabel="Verify PIN & Activate"
        onVerify={verifySecurityPin}
        onSuccess={() => {
          setActiveStatus("Active");
          if (onApprovePlan) onApprovePlan();
        }}
      />
    </div>
  );
}

// 3. CLARIFICATION CARD
export function ClarificationCard({
  question,
  options,
  onSelect,
}: {
  question: string;
  options: string[];
  onSelect: (option: string) => void;
}) {
  return (
    <div className="p-5 rounded-[12px] bg-[#f5eee1] shadow-xs my-3">
      <div className="flex items-center gap-2 mb-2 text-[#B45529]">
        <SolarIcon name="chat-round-dots" size={18} />
        <span className="text-xs font-bold uppercase tracking-wider font-mono">Quick Clarification</span>
      </div>
      <p className="text-sm font-semibold text-[#2a2b2f] mb-3">{question}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <button
            key={opt}
            onClick={() => onSelect(opt)}
            className="px-4 py-1.5 rounded-full bg-[#fef9ef] text-[#2a2b2f] text-xs font-semibold hover:text-[#B45529] transition-all cursor-pointer shadow-xs active:scale-95"
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}
