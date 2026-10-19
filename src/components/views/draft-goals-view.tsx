"use client";

import React, { useState } from "react";
// Amounts here are decided on, so they stay visible in privacy mode.
import { formatMoneyAlways as formatMoney } from "@/lib/utils";
import { SolarIcon } from "@/components/icons/solar";
import { SeiyaIcon } from "@/components/icons/seiya-logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PlanCard } from "@/components/cards/domain-cards";
import { useApp, PlanItem } from "@/lib/store";
import { DeletePlanDialog } from "@/components/modals/delete-plan-dialog";
import { AdjustPlanDialog } from "@/components/modals/adjust-plan-dialog";

interface DraftGoalsViewProps {
  onBack: () => void;
  onNavigate?: (tab: any) => void;
}

export function DraftGoalsView({ onBack, onNavigate }: DraftGoalsViewProps) {
  const {
    plans,
    reportingCurrency,
    locale,
    partnerAName,
    partnerBName,
    currentUser,
    setPendingDirectChat,
  } = useApp();

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [planToDelete, setPlanToDelete] = useState<PlanItem | null>(null);
  const [adjustModalOpen, setAdjustModalOpen] = useState(false);
  const [planToAdjust, setPlanToAdjust] = useState<PlanItem | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const partnerName = currentUser === "partner_a" ? partnerBName : partnerAName;
  const draftPlans = plans.filter((p) => p.status === "Draft" || p.status === "Proposed");

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-16">
      {/* Toast Feedback */}
      {toastMessage && (
        <div className="fixed bottom-20 md:bottom-8 right-6 z-50 p-3.5 rounded-[14px] bg-[#edf3ec] text-[#2d5232] text-xs font-semibold flex items-center gap-2.5 border border-[#2d5232]/30 shadow-lg animate-in fade-in-0 slide-in-from-bottom-2">
          <SolarIcon name="check-circle" size={18} className="shrink-0 text-[#2d5232]" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Navigation & Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-1">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#808988] hover:text-[#B45529] transition-colors cursor-pointer group mb-1"
          >
            <SolarIcon name="arrow-left" size={14} className="group-hover:-translate-x-0.5 transition-transform" />
            <span>Back to Active Goals</span>
          </button>
          <div className="flex items-center gap-2.5">
            <h2 className="text-xl sm:text-2xl font-serif font-normal text-[#2a2b2f]">
              Draft Couple Goals
            </h2>
            <Badge variant="neutral">{draftPlans.length} Drafts</Badge>
          </div>
          <p className="text-xs text-[#515151]">
            Planned milestones and draft ideas awaiting proposal, adjustments, or mutual partner activation.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
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
            <span>Add New Goal</span>
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              setPendingDirectChat({ message: "Let's plan a new savings goal together.", mode: "personal" });
              onNavigate?.("seiya");
            }}
            className="text-xs flex items-center gap-1.5 cursor-pointer shadow-2xs"
          >
            <SeiyaIcon size={14} color="#fef9ef" />
            <span>Plan with Seiya</span>
          </Button>
        </div>
      </div>

      {/* Information Banner */}
      <div className="p-4 rounded-[12px] bg-[#f5eee1] border border-[#d1c9bf]/60 flex items-start gap-3 shadow-2xs">
        <div className="p-2 rounded-full bg-[#fef9ef] text-[#B45529] shrink-0">
          <SolarIcon name="shield-check" size={18} />
        </div>
        <div className="text-xs text-[#2a2b2f]">
          <h4 className="font-semibold text-xs text-[#B45529] mb-0.5">
            Draft Activation & Dual-Key Agreement
          </h4>
          <p className="text-[#515151] leading-relaxed">
            Draft goals are non-binding. When you send a draft to {partnerName}, both partners can review the split ratio, funding horizon, and enter their security PIN to activate it.
          </p>
        </div>
      </div>

      {/* Draft Goals Grid */}
      {draftPlans.length === 0 ? (
        <div className="py-16 text-center space-y-3 bg-[#f5eee1]/50 rounded-[16px] border border-dashed border-[#d1c9bf]">
          <div className="w-12 h-12 rounded-full bg-[#fef9ef] text-[#808988] flex items-center justify-center mx-auto">
            <SolarIcon name="check-circle" size={24} />
          </div>
          <h3 className="text-base font-serif text-[#2a2b2f]">No Draft Goals Found</h3>
          <p className="text-xs text-[#808988] max-w-sm mx-auto">
            All your couple goals are actively running. You can brainstorm a new goal with Seiya or create one manually anytime.
          </p>
          <div className="pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onBack}
              className="text-xs text-[#515151] hover:text-[#2a2b2f]"
            >
              Return to Active Goals
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {draftPlans.map((p) => {
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
                onSendToPartner={() => {
                  showToast(`Draft "${p.title}" sent to ${partnerName} for mutual agreement!`);
                }}
                onApprovePlan={() => {
                  showToast(`Goal "${p.title}" activated under couple agreement!`);
                }}
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
          showToast(`Draft goal "${updated.title}" successfully adjusted.`);
          setPlanToAdjust(null);
        }}
      />
    </div>
  );
}
