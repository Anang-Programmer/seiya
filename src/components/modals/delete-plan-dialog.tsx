"use client";

import React, { useState } from "react";
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SolarIcon } from "@/components/icons/solar";
import { useApp, PlanItem } from "@/lib/store";
import { formatMoney } from "@/lib/utils";

interface DeletePlanDialogProps {
  plan: PlanItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted?: () => void;
}

export function DeletePlanDialog({ plan, open, onOpenChange, onDeleted }: DeletePlanDialogProps) {
  const { requestDeletePlan, currentUser, partnerAName, partnerBName, locale, reportingCurrency } = useApp();

  const [mode, setMode] = useState<"dual_pin" | "request">("dual_pin");
  const [partnerAPin, setPartnerAPin] = useState("");
  const [partnerBPin, setPartnerBPin] = useState("");
  const [error, setError] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");

  if (!plan) return null;

  const currentPartnerName = currentUser === "partner_a" ? partnerAName : partnerBName;
  const otherPartnerName = currentUser === "partner_a" ? partnerBName : partnerAName;
  const currency = plan.currency || reportingCurrency;

  const handleDualPinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (partnerAPin.length !== 6) {
      setError(`Please enter ${partnerAName}'s 6-digit PIN.`);
      return;
    }
    if (partnerBPin.length !== 6) {
      setError(`Please enter ${partnerBName}'s 6-digit PIN.`);
      return;
    }

    setIsProcessing(true);
    setTimeout(() => {
      const res = requestDeletePlan(plan.id, partnerAPin, partnerBPin);
      setIsProcessing(false);

      if (res.success) {
        setSuccessMsg(`Consensus reached! Goal "${plan.title}" has been dissolved with mutual consent.`);
        setTimeout(() => {
          onOpenChange(false);
          setSuccessMsg("");
          setPartnerAPin("");
          setPartnerBPin("");
          if (onDeleted) onDeleted();
        }, 1200);
      } else {
        setError("Invalid PIN verification. Please check your credentials.");
      }
    }, 800);
  };

  const handleSendRequest = () => {
    setIsProcessing(true);
    setError("");

    setTimeout(() => {
      const res = requestDeletePlan(plan.id);
      setIsProcessing(false);

      if (res.success) {
        setSuccessMsg(
          `Deletion request dispatched to ${otherPartnerName}'s dashboard for partner PIN confirmation.`
        );
        setTimeout(() => {
          onOpenChange(false);
          setSuccessMsg("");
        }, 1500);
      }
    }, 600);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} className="max-w-md">
      <DialogHeader onClose={() => onOpenChange(false)}>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-[#fcf0ee] text-[#a34426] flex items-center justify-center shrink-0">
            <SolarIcon name="trash" size={18} />
          </div>
          <div>
            <DialogTitle className="text-base font-serif font-normal text-[#2a2b2f]">
              Dissolve Goal: {plan.title}
            </DialogTitle>
          </div>
        </div>
        <DialogDescription className="text-xs text-[#515151]">
          Dual-Key Consensus required. Collaborative plans cannot be deleted unilaterally.
        </DialogDescription>
      </DialogHeader>

      <DialogContent className="pt-2 pb-4 space-y-4">
        {successMsg ? (
          <div className="py-8 text-center space-y-3 animate-in fade-in-0">
            <div className="w-12 h-12 rounded-full bg-[#edf3ec] text-[#2d5232] flex items-center justify-center mx-auto">
              <SolarIcon name="check-circle" size={28} />
            </div>
            <h4 className="text-base font-serif text-[#2a2b2f]">Dual-Key Decision Registered</h4>
            <p className="text-xs text-[#515151] max-w-xs mx-auto">{successMsg}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Goal preview banner */}
            <div className="p-3 rounded-[12px] bg-[#f5eee1] flex items-center justify-between">
              <div>
                <span className="text-[11px] text-[#515151] block">Target Goal to Dissolve</span>
                <span className="text-sm font-semibold text-[#2a2b2f]">{plan.title}</span>
              </div>
              <div className="text-right">
                <span className="text-[11px] text-[#515151] block">Target Value</span>
                <span className="text-sm font-mono font-bold text-[#B45529]">
                  {formatMoney(plan.targetAmount, currency, locale)}
                </span>
              </div>
            </div>

            {/* Mode Selector */}
            <div className="grid grid-cols-2 p-1 rounded-full bg-[#ece3d3]/70 border border-[#d1c9bf]/60 text-xs">
              <button
                type="button"
                onClick={() => setMode("dual_pin")}
                className={`py-1.5 px-3 rounded-full font-medium transition-all cursor-pointer ${
                  mode === "dual_pin"
                    ? "bg-[#fef9ef] text-[#2a2b2f] font-semibold shadow-2xs"
                    : "text-[#515151] hover:text-[#2a2b2f]"
                }`}
              >
                In-Person Both PINs
              </button>
              <button
                type="button"
                onClick={() => setMode("request")}
                className={`py-1.5 px-3 rounded-full font-medium transition-all cursor-pointer ${
                  mode === "request"
                    ? "bg-[#fef9ef] text-[#2a2b2f] font-semibold shadow-2xs"
                    : "text-[#515151] hover:text-[#2a2b2f]"
                }`}
              >
                Send Request to Partner
              </button>
            </div>

            {error && (
              <div className="p-2.5 rounded-[10px] bg-[#fcf0ee] text-[#a34426] text-xs flex items-center gap-2 border border-[#a34426]/20">
                <SolarIcon name="danger-triangle" size={16} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {mode === "dual_pin" ? (
              <form onSubmit={handleDualPinSubmit} className="space-y-3.5">
                <div className="text-xs text-[#515151] leading-relaxed">
                  Both partners must verify their identity by entering their respective 6-digit security PINs together.
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-semibold text-[#2a2b2f] block mb-1">
                      {partnerAName}&apos;s PIN (6 digits)
                    </label>
                    <input
                      type="password"
                      maxLength={6}
                      value={partnerAPin}
                      onChange={(e) => setPartnerAPin(e.target.value.replace(/\D/g, ""))}
                      placeholder="123456"
                      className="w-full h-10 px-3 rounded-[10px] border border-[#d1c9bf] bg-[#fef9ef] text-center font-mono text-sm tracking-widest text-[#2a2b2f] focus:outline-none focus:ring-2 focus:ring-[#B45529]/30"
                    />
                    <span className="text-[10px] text-[#808988] block text-center mt-1">Hint: 123456</span>
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-[#2a2b2f] block mb-1">
                      {partnerBName}&apos;s PIN (6 digits)
                    </label>
                    <input
                      type="password"
                      maxLength={6}
                      value={partnerBPin}
                      onChange={(e) => setPartnerBPin(e.target.value.replace(/\D/g, ""))}
                      placeholder="654321"
                      className="w-full h-10 px-3 rounded-[10px] border border-[#d1c9bf] bg-[#fef9ef] text-center font-mono text-sm tracking-widest text-[#2a2b2f] focus:outline-none focus:ring-2 focus:ring-[#B45529]/30"
                    />
                    <span className="text-[10px] text-[#808988] block text-center mt-1">Hint: 654321</span>
                  </div>
                </div>

                <DialogFooter className="pt-2 flex items-center justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onOpenChange(false)}
                    className="text-xs"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    disabled={isProcessing}
                    className="text-xs bg-[#a34426] hover:bg-[#85341c] text-[#fef9ef] border-none"
                  >
                    {isProcessing ? "Verifying..." : "Verify & Dissolve Goal"}
                  </Button>
                </DialogFooter>
              </form>
            ) : (
              <div className="space-y-3.5">
                <div className="p-3.5 rounded-[12px] bg-[#fef9ef] border border-[#d1c9bf]/60 space-y-2">
                  <div className="flex items-start gap-2">
                    <SolarIcon name="users-group-rounded" size={18} className="text-[#B45529] shrink-0 mt-0.5" />
                    <div className="text-xs text-[#2a2b2f]">
                      <p className="font-semibold mb-0.5">Asynchronous Dual-Key Request</p>
                      <p className="text-[11px] text-[#515151] leading-relaxed">
                        A deletion approval card will be sent to <strong>{otherPartnerName}</strong>&apos;s dashboard.
                        The goal will only be dissolved once {otherPartnerName} signs it with their PIN.
                      </p>
                    </div>
                  </div>
                </div>

                <DialogFooter className="pt-2 flex items-center justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onOpenChange(false)}
                    className="text-xs"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={handleSendRequest}
                    disabled={isProcessing}
                    className="text-xs"
                  >
                    {isProcessing ? "Dispatching..." : `Send Request to ${otherPartnerName}`}
                  </Button>
                </DialogFooter>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
