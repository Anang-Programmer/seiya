"use client";

import React, { useState } from "react";
import { formatMoney } from "@/lib/utils";
import { SolarIcon } from "@/components/icons/solar";
import { Button } from "@/components/ui/button";
import { useApp, ApprovalRequest } from "@/lib/store";
import { PinAuthDialog } from "@/components/modals/pin-auth-dialog";

interface ApprovalDeckProps {
  onViewAll: () => void;
  onSelectApproval?: (approval: ApprovalRequest) => void;
}

export function ApprovalDeck({ onViewAll, onSelectApproval }: ApprovalDeckProps) {
  const {
    approvals,
    currentUser,
    partnerAName,
    partnerBName,
    reportingCurrency,
    locale,
    approveApprovalRequest,
    declineApprovalRequest,
  } = useApp();

  const partnerName = currentUser === "partner_a" ? partnerBName : partnerAName;

  // ONLY requests initiated by the partner awaiting the current user's approval
  const partnerRequests = approvals
    .filter((a) => a.status === "pending" && a.approver === currentUser)
    .sort((a, b) => {
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return timeB - timeA;
    });

  const [currentIndex, setCurrentIndex] = useState(0);
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [activeItemForPin, setActiveItemForPin] = useState<ApprovalRequest | null>(null);

  const safeIndex = partnerRequests.length > 0 ? currentIndex % partnerRequests.length : 0;
  const currentItem = partnerRequests[safeIndex];

  const handleNext = () => {
    if (partnerRequests.length > 0) {
      setCurrentIndex((prev) => (prev + 1) % partnerRequests.length);
    }
  };

  const handlePrev = () => {
    if (partnerRequests.length > 0) {
      setCurrentIndex((prev) => (prev - 1 + partnerRequests.length) % partnerRequests.length);
    }
  };

  const handleApproveClick = (item: ApprovalRequest) => {
    setActiveItemForPin(item);
    setPinModalOpen(true);
  };

  const handleDeclineClick = (item: ApprovalRequest) => {
    if (confirm(`Decline "${item.title}"?`)) {
      declineApprovalRequest(item.id);
    }
  };

  // If there are no pending requests from the partner
  if (partnerRequests.length === 0) {
    return (
      <div className="p-5 rounded-[12px] bg-[#f5eee1] shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-full bg-[#edf3ec] text-[#2d5232] shrink-0">
            <SolarIcon name="check-circle" size={20} />
          </div>
          <div>
            <h4 className="text-xs font-bold text-[#2d5232]">
              No Pending Requests from {partnerName}
            </h4>
            <p className="text-[11px] text-[#515151] mt-0.5">
              You are all caught up. All shared bills, goals, and expenses have mutual agreement.
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onViewAll}
          className="shrink-0 text-xs font-semibold"
        >
          View History
        </Button>
      </div>
    );
  }

  const currency = currentItem?.currency || reportingCurrency;
  const itemCategory =
    currentItem?.category ||
    (currentItem?.type === "BILL" ? "Bills" : currentItem?.type === "PLAN_DELETE" ? "Plans" : "Expenses");

  return (
    <div className="relative">
      {/* Visual Stack Layers Underneath (Home Card Design) */}
      {partnerRequests.length > 2 && (
        <div
          className="absolute inset-x-3 -bottom-3 h-full rounded-[12px] bg-[#7a3416] opacity-60 shadow-xs pointer-events-none transition-all duration-300"
          style={{ zIndex: 0 }}
        />
      )}
      {partnerRequests.length > 1 && (
        <div
          className="absolute inset-x-1.5 -bottom-1.5 h-full rounded-[12px] bg-[#96421c] opacity-80 shadow-xs pointer-events-none transition-all duration-300"
          style={{ zIndex: 1 }}
        />
      )}

      {/* Main Home Card: Signature Terracotta Partner Approval Banner */}
      <div
        className="relative z-10 p-5 sm:p-6 rounded-[12px] bg-[#B45529] text-[#fef9ef] shadow-md space-y-4 transition-all duration-300"
      >
        {/* Header Row: Partner Name, Status Badges, and Stack Carousel Navigation */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-[#fef9ef]/85 uppercase tracking-wider font-mono">
              Requests from {partnerName}
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#fef9ef]/20 text-[#fef9ef] backdrop-blur-xs">
              Pending Your Signature
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#fef9ef]/20 text-[#fef9ef] backdrop-blur-xs">
              {itemCategory}
            </span>
          </div>

          {/* Carousel Controls if multiple requests */}
          {partnerRequests.length > 1 && (
            <div className="flex items-center gap-1.5 bg-[#fef9ef]/15 px-2.5 py-1 rounded-full text-xs font-mono text-[#fef9ef]">
              <span className="text-[11px] font-semibold">
                {safeIndex + 1} of {partnerRequests.length}
              </span>
              <button
                type="button"
                onClick={handlePrev}
                className="w-5 h-5 rounded-full hover:bg-white/20 flex items-center justify-center transition-colors cursor-pointer"
                title="Previous request"
                aria-label="Previous request"
              >
                <SolarIcon name="arrow-left" size={12} />
              </button>
              <button
                type="button"
                onClick={handleNext}
                className="w-5 h-5 rounded-full hover:bg-white/20 flex items-center justify-center transition-colors cursor-pointer"
                title="Next request"
                aria-label="Next request"
              >
                <SolarIcon name="arrow-right" size={12} />
              </button>
            </div>
          )}
        </div>

        {/* Content Row: Amount, Title & Reason */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div className="space-y-1">
            <div className="text-2xl sm:text-3xl font-bold font-mono text-[#fef9ef]">
              {formatMoney(currentItem.amount, currency, locale)}
            </div>
            <h4 className="text-sm sm:text-base font-semibold text-[#fef9ef]">
              {currentItem.title}
            </h4>
            <p className="text-xs text-[#fef9ef]/90 leading-relaxed max-w-xl">
              {currentItem.reason}
            </p>
          </div>
        </div>

        {/* Footer Actions Row */}
        <div className="flex items-center justify-between pt-3 border-t border-[#fef9ef]/25 flex-wrap gap-3">
          <button
            type="button"
            onClick={onViewAll}
            className="text-xs font-semibold text-[#fef9ef] hover:underline flex items-center gap-1.5 cursor-pointer"
          >
            <span>View All Requests ({partnerRequests.length})</span>
            <SolarIcon name="arrow-right" size={12} />
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleDeclineClick(currentItem)}
              className="px-3.5 py-1.5 text-xs font-semibold rounded-full border border-white/35 text-white hover:bg-white/10 transition-colors cursor-pointer"
            >
              Decline
            </button>
            <Button
              size="md"
              onClick={() => handleApproveClick(currentItem)}
              className="bg-[#fef9ef] text-[#B45529] hover:bg-white hover:text-[#9a4c2b] shadow-xs border-0 font-bold text-xs"
            >
              Approve with PIN
            </Button>
          </div>
        </div>
      </div>

      {/* Security PIN verification for approval */}
      <PinAuthDialog
        open={pinModalOpen}
        onOpenChange={setPinModalOpen}
        title="Dual-Key Authorization"
        description={
          activeItemForPin
            ? `Please enter your 6-digit security PIN to authorize "${activeItemForPin.title}" for ${formatMoney(
                activeItemForPin.amount,
                activeItemForPin.currency || reportingCurrency,
                locale
              )}.`
            : "Please enter your 6-digit security PIN to authorize this request."
        }
        actionLabel="Verify PIN & Authorize"
        onVerify={async (pin) => {
          if (!activeItemForPin) return "This request is no longer available.";
          const result = await approveApprovalRequest(activeItemForPin.id, pin);
          return result.ok ? null : result.message || "Unable to approve this request.";
        }}
        onSuccess={() => setActiveItemForPin(null)}
      />
    </div>
  );
}
