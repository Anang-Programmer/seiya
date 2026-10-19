"use client";

import React, { useState, useRef, useEffect } from "react";
import { formatMoney, formatMoneyConverted } from "@/lib/utils";
import { SolarIcon } from "@/components/icons/solar";
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useApp, ApprovalRequest } from "@/lib/store";

interface ApprovalDialogProps {
  request: ApprovalRequest | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ApprovalStep = "details" | "pin" | "approved";

export function ApprovalDialog({ request, open, onOpenChange }: ApprovalDialogProps) {
  const { currentUser, approveRequest, declineRequest, reportingCurrency, locale, partnerAName, partnerBName } = useApp();
  const [step, setStep] = useState<ApprovalStep>("details");
  const [pin, setPin] = useState("");
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const [countdown, setCountdown] = useState(10);
  const [errorMessage, setErrorMessage] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);

  // Reset to details whenever the modal is closed or opened with a new request
  useEffect(() => {
    if (!open) {
      setStep("details");
      setPin("");
      setErrorMessage("");
      setIsAuthorizing(false);
    }
  }, [open]);

  // Autoplay mascot video on approval step
  useEffect(() => {
    if (step === "approved" && videoRef.current) {
      videoRef.current.play().catch(() => {});
    }
  }, [step]);

  // 10s countdown timer before auto-closing the celebration modal
  useEffect(() => {
    if (step !== "approved") return;

    setCountdown(10);
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setStep("details");
          setPin("");
          onOpenChange(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [step, onOpenChange]);

  if (!request) return null;

  const isRequester = request.requester === currentUser;
  const reqCurrency = request.currency || reportingCurrency;
  const requesterName = request.requester === "partner_a" ? partnerAName : partnerBName;
  const approverName = request.approver === "partner_a" ? partnerAName : partnerBName;

  const handleProceedToPin = () => {
    if (isRequester) {
      setErrorMessage("Dual-Key Security Rule: A requester cannot approve their own financial request.");
      return;
    }
    setErrorMessage("");
    setPin("");
    setStep("pin");
  };

  const handleDigit = (digit: string) => {
    if (pin.length < 6) {
      setPin((prev) => prev + digit);
      setErrorMessage("");
    }
  };

  const handleBackspace = () => {
    setPin((prev) => prev.slice(0, -1));
    setErrorMessage("");
  };

  const handleClear = () => {
    setPin("");
    setErrorMessage("");
  };

  const handleVerifyPin = () => {
    if (pin.length !== 6) {
      setErrorMessage("Security PIN required: Please enter all 6 digits.");
      return;
    }

    setIsAuthorizing(true);
    setErrorMessage("");

    // Gateway passkey cryptographic verification delay
    setTimeout(() => {
      setIsAuthorizing(false);
      approveRequest(request.id);
      setStep("approved");
    }, 1200);
  };

  const handleDecline = () => {
    declineRequest(request.id);
    onOpenChange(false);
  };

  const handleCloseCelebration = () => {
    setStep("details");
    setPin("");
    onOpenChange(false);
  };

  // Step 2: Dedicated PIN Entry Modal (Separate modal before approval)
  if (step === "pin") {
    return (
      <Dialog open={open} onOpenChange={onOpenChange} className="max-w-md">
        <DialogHeader onClose={() => onOpenChange(false)} className="pb-2">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-[#fbf0eb] text-[#B45529] flex items-center justify-center shrink-0">
              <SolarIcon name="lock-keyhole" size={18} />
            </div>
            <div>
              <DialogTitle className="text-base font-serif font-normal text-[#2a2b2f]">
                Security PIN Verification
              </DialogTitle>
              <DialogDescription className="text-xs text-[#515151]">
                Enter your 6-digit partner PIN to sign and authorize.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <DialogContent className="pt-2 pb-4 space-y-4">
          {/* Action Context Chip */}
          <div className="px-3.5 py-2.5 rounded-[12px] bg-[#f5eee1] flex items-center justify-between text-xs border border-[#d1c9bf]/40">
            <div className="truncate max-w-[210px]">
              <span className="text-[10px] uppercase tracking-wider text-[#808988] block">Authorizing Action</span>
              <span className="font-medium text-[#2a2b2f] truncate block">{request.title}</span>
            </div>
            <div className="text-right shrink-0">
              <span className="text-[10px] uppercase tracking-wider text-[#808988] block">Amount</span>
              <span className="font-serif font-bold text-[#B45529] text-sm block">
                {formatMoney(request.amount, reqCurrency, locale)}
              </span>
              {reqCurrency !== reportingCurrency && request.amount > 0 && (
                <span className="text-[10px] font-serif text-[#808988] block">
                  ≈ {formatMoneyConverted(request.amount, reqCurrency, reportingCurrency, locale)}
                </span>
              )}
            </div>
          </div>

          {/* 6-Digit PIN Indicators */}
          <div className="flex justify-center items-center gap-3 py-2">
            {[0, 1, 2, 3, 4, 5].map((idx) => {
              const filled = idx < pin.length;
              return (
                <div
                  key={idx}
                  className={`w-3.5 h-3.5 rounded-full transition-all duration-150 ${
                    filled
                      ? "bg-[#B45529] scale-110 shadow-xs"
                      : "border-2 border-[#d1c9bf] bg-transparent"
                  }`}
                />
              );
            })}
          </div>

          {/* Input & Quick Fill */}
          <div className="flex items-center justify-center gap-2">
            <input
              type="password"
              maxLength={6}
              value={pin}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, "").slice(0, 6);
                setPin(val);
                setErrorMessage("");
              }}
              placeholder="Or type PIN (default: 123456)"
              className="text-center text-xs px-3 py-1.5 rounded-full border border-[#d1c9bf] bg-[#fef9ef] text-[#2a2b2f] placeholder-[#808988] focus:outline-none focus:ring-1 focus:ring-[#B45529]"
            />
            <button
              type="button"
              onClick={() => {
                setPin("123456");
                setErrorMessage("");
              }}
              className="text-[11px] font-semibold text-[#B45529] hover:underline px-2 py-1 cursor-pointer"
            >
              Auto 123456
            </button>
          </div>

          {/* Numeric Keypad with Lora font-serif digits */}
          <div className="grid grid-cols-3 gap-2 max-w-[250px] mx-auto pt-1">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => handleDigit(num)}
                disabled={isAuthorizing}
                className="h-10 rounded-full bg-[#f5eee1] hover:bg-[#ece3d3] active:bg-[#e2d5c0] text-[#2a2b2f] font-serif text-base font-bold transition-all shadow-2xs flex items-center justify-center cursor-pointer"
              >
                {num}
              </button>
            ))}
            <button
              type="button"
              onClick={handleClear}
              disabled={isAuthorizing}
              className="h-10 rounded-full text-[#808988] hover:text-[#2a2b2f] text-xs font-semibold transition-all flex items-center justify-center cursor-pointer"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => handleDigit("0")}
              disabled={isAuthorizing}
              className="h-10 rounded-full bg-[#f5eee1] hover:bg-[#ece3d3] active:bg-[#e2d5c0] text-[#2a2b2f] font-serif text-base font-bold transition-all shadow-2xs flex items-center justify-center cursor-pointer"
            >
              0
            </button>
            <button
              type="button"
              onClick={handleBackspace}
              disabled={isAuthorizing}
              className="h-10 rounded-full text-[#808988] hover:text-[#2a2b2f] text-xs font-semibold transition-all flex items-center justify-center cursor-pointer"
              title="Backspace"
            >
              <SolarIcon name="arrow-left" size={16} />
            </button>
          </div>

          {errorMessage && (
            <p className="text-center text-xs text-[#a34426] font-medium pt-1 animate-shake">
              {errorMessage}
            </p>
          )}
        </DialogContent>

        <DialogFooter className="flex justify-between sm:justify-between items-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setStep("details");
              setErrorMessage("");
            }}
            disabled={isAuthorizing}
            className="rounded-full text-xs"
          >
            Back to Details
          </Button>

          <Button
            variant="primary"
            size="md"
            disabled={pin.length !== 6 || isAuthorizing}
            onClick={handleVerifyPin}
            className="min-w-[140px] rounded-full"
          >
            {isAuthorizing ? (
              <span className="flex items-center gap-1.5">
                <SolarIcon name="refresh" size={14} className="animate-spin" />
                Signing...
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                <SolarIcon name="shield-check" size={16} />
                Authorize & Sign
              </span>
            )}
          </Button>
        </DialogFooter>
      </Dialog>
    );
  }

  // Step 3: Approval Celebration Modal
  if (step === "approved") {
    return (
      <Dialog open={open} onOpenChange={onOpenChange} className="max-w-md">
        <DialogHeader onClose={handleCloseCelebration}>
          <DialogTitle className="text-center font-serif font-normal text-lg">Signature Verified</DialogTitle>
          <DialogDescription className="text-center text-xs">
            Dual-Key authorization confirmed.
          </DialogDescription>
        </DialogHeader>

        <DialogContent className="py-5 text-center space-y-3 animate-in fade-in-0 zoom-in-95 duration-200">
          <div
            style={{
              width: 210,
              height: 180,
              maskImage:
                "radial-gradient(ellipse 49% 45% at 50% 50%, #000 68%, rgba(0,0,0,0.85) 80%, rgba(0,0,0,0.4) 90%, transparent 98%)",
              WebkitMaskImage:
                "radial-gradient(ellipse 49% 45% at 50% 50%, #000 68%, rgba(0,0,0,0.85) 80%, rgba(0,0,0,0.4) 90%, transparent 98%)",
            }}
            className="relative overflow-hidden shrink-0 select-none mx-auto flex items-center justify-center my-0"
          >
            <video
              ref={videoRef}
              src="/other/ApprovedSeiya.webm"
              autoPlay
              loop
              muted
              playsInline
              preload="auto"
              className="w-full h-full object-contain pointer-events-none"
            />
          </div>
          <h4 className="text-lg font-serif font-normal text-[#2a2b2f]">Dual-Key Signature Confirmed!</h4>
          <p className="text-xs text-[#515151] max-w-xs mx-auto leading-relaxed">
            Transaction successfully executed via Dual-Key Gateway. Balances updated.
          </p>
          <div className="pt-2 flex flex-col items-center gap-1.5">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#f5eee1] border border-[#d1c9bf]/60 text-xs text-[#515151]">
              <SolarIcon name="clock-circle" size={14} className="text-[#B45529]" />
              <span>Auto-closing in</span>
              <span className="font-serif font-bold text-[#B45529]">
                {countdown}s
              </span>
            </div>
            <button
              type="button"
              onClick={handleCloseCelebration}
              className="text-xs text-[#808988] hover:text-[#B45529] transition-colors cursor-pointer"
            >
              Close now
            </button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Step 1: Review Details Modal (Completely clean, no inline PIN input)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader onClose={() => onOpenChange(false)}>
        <DialogTitle>Partner Approval Required</DialogTitle>
        <DialogDescription>
          Financial action pending secondary partner signature.
        </DialogDescription>
      </DialogHeader>

      <DialogContent>
        <div className="space-y-4">
          {/* Request Summary Box */}
          <div className="p-4 rounded-[12px] bg-[#f5eee1] space-y-3">
            <div className="flex justify-between items-baseline">
              <span className="text-xs text-[#515151]">Action</span>
              <span className="text-sm font-semibold text-[#2a2b2f]">{request.title}</span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-xs text-[#515151]">Amount</span>
              <div className="text-right">
                <span className="text-xl font-serif font-semibold text-[#2a2b2f] block">
                  {formatMoney(request.amount, reqCurrency, locale)}
                </span>
                {reqCurrency !== reportingCurrency && request.amount > 0 && (
                  <span className="text-xs font-serif text-[#808988] block">
                    ≈ {formatMoneyConverted(request.amount, reqCurrency, reportingCurrency, locale)}
                  </span>
                )}
              </div>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-xs text-[#515151]">Source Wallet</span>
              <span className="text-xs font-semibold text-[#2a2b2f] capitalize">{request.wallet.replace("_", " ")}</span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-xs text-[#515151]">Requested By</span>
              <span className="text-xs font-semibold text-[#2a2b2f] capitalize">{requesterName}</span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-xs text-[#515151]">Expires In</span>
              <span className="text-xs font-semibold text-[#B45529]">~{request.expiresInHours} hours</span>
            </div>
          </div>

          {/* Why approval is required */}
          <div className="p-3.5 rounded-[12px] bg-[#B45529]/10 text-[#333333] text-xs space-y-1">
            <div className="flex items-center gap-1.5 font-semibold text-[#B45529]">
              <SolarIcon name="info-circle" size={14} />
              <span>Why is approval required?</span>
            </div>
            <p className="text-[11px] leading-relaxed opacity-95">{request.reason}</p>
          </div>

          {/* Requester self-approval block warning */}
          {isRequester && (
            <div className="p-3.5 rounded-[12px] bg-amber-50/80 text-amber-900 text-xs flex items-start gap-2">
              <SolarIcon name="danger-triangle" size={16} className="text-amber-700 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold block">You created this request</span>
                <span className="text-[11px] text-amber-800">
                  Dual-Key protocol prevents self-approval. <strong>{approverName}</strong> signs this from their own account.
                </span>
              </div>
            </div>
          )}

          {errorMessage && (
            <p className="text-xs text-[#a34426] font-medium">{errorMessage}</p>
          )}
        </div>
      </DialogContent>

      <DialogFooter>
        <Button variant="ghost" size="sm" onClick={handleDecline} className="rounded-full">
          Decline
        </Button>
        <Button
          variant="primary"
          size="md"
          disabled={isRequester}
          onClick={handleProceedToPin}
          className="min-w-[130px] rounded-full"
        >
          <span className="flex items-center gap-1.5">
            <SolarIcon name="shield-check" size={16} />
            Approve & Sign
          </span>
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
