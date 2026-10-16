"use client";

import React, { useState, useRef, useEffect } from "react";
import { formatMoney } from "@/lib/utils";
import { SolarIcon } from "@/components/icons/solar";
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useApp, ApprovalRequest } from "@/lib/store";

interface ApprovalDialogProps {
  request: ApprovalRequest | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ApprovalDialog({ request, open, onOpenChange }: ApprovalDialogProps) {
  const { currentUser, approveRequest, declineRequest, reportingCurrency, locale, partnerAName, partnerBName } = useApp();
  const [pin, setPin] = useState("");
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const [authSuccess, setAuthSuccess] = useState(false);
  const [countdown, setCountdown] = useState(10);
  const [errorMessage, setErrorMessage] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (authSuccess && videoRef.current) {
      videoRef.current.play().catch(() => {});
    }
  }, [authSuccess]);

  // 10s countdown before auto-closing
  useEffect(() => {
    if (!authSuccess) return;

    setCountdown(10);
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setAuthSuccess(false);
          setPin("");
          onOpenChange(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [authSuccess, onOpenChange]);

  if (!request) return null;

  const isRequester = request.requester === currentUser;
  const reqCurrency = request.currency || reportingCurrency;
  const requesterName = request.requester === "partner_a" ? partnerAName : partnerBName;
  const approverName = request.approver === "partner_a" ? partnerAName : partnerBName;

  const handleApprove = () => {
    if (isRequester) {
      setErrorMessage("Dual-Key Security Rule: A requester cannot approve their own financial request.");
      return;
    }

    if (!pin || pin.length !== 6) {
      setErrorMessage("Security PIN required: Please enter your 6-digit security PIN to authorize this transaction.");
      return;
    }

    setIsAuthorizing(true);
    setErrorMessage("");

    // Simulate gateway passkey / biometric verification delay
    setTimeout(() => {
      setIsAuthorizing(false);
      setAuthSuccess(true);
      approveRequest(request.id);
    }, 1400);
  };

  const handleDecline = () => {
    declineRequest(request.id);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader onClose={() => onOpenChange(false)}>
        <DialogTitle>Partner Approval Required</DialogTitle>
        <DialogDescription>
          Financial action pending secondary partner signature.
        </DialogDescription>
      </DialogHeader>

      <DialogContent>
        {authSuccess ? (
          <div className="py-5 text-center space-y-3 animate-in fade-in-0 zoom-in-95 duration-200">
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
                onClick={() => {
                  setAuthSuccess(false);
                  setPin("");
                  onOpenChange(false);
                }}
                className="text-xs text-[#808988] hover:text-[#B45529] transition-colors cursor-pointer"
              >
                Close now
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Request Summary Box */}
            <div className="p-4 rounded-[12px] bg-[#f5eee1] space-y-3">
              <div className="flex justify-between items-baseline">
                <span className="text-xs text-[#515151]">Action</span>
                <span className="text-sm font-semibold text-[#2a2b2f]">{request.title}</span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className="text-xs text-[#515151]">Amount</span>
                <span className="text-xl font-mono font-semibold text-[#2a2b2f]">
                  {formatMoney(request.amount, reqCurrency, locale)}
                </span>
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
                    Dual-Key protocol prevents self-approval. Switch persona to <strong>{approverName}</strong> to sign and approve.
                  </span>
                </div>
              </div>
            )}

            {/* Passkey Mock PIN */}
            {!isRequester && (
              <div className="pt-2">
                <label className="text-xs font-semibold text-[#2a2b2f] block mb-1.5">
                  Confirm with Passkey / Security PIN
                </label>
                <div className="flex gap-2">
                  <input
                    type="password"
                    maxLength={6}
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    placeholder="Enter 6-digit PIN (default: 123456)"
                    className="flex-1 px-3.5 py-2 rounded-full border border-[#d1c9bf] bg-[#fef9ef] text-sm text-[#2a2b2f] focus:outline-none focus:ring-2 focus:ring-[#B45529]/20"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setPin("123456")}
                    className="text-xs rounded-full"
                  >
                    Quick Fill
                  </Button>
                </div>
              </div>
            )}

            {errorMessage && (
              <p className="text-xs text-[#a34426] font-medium">{errorMessage}</p>
            )}
          </div>
        )}
      </DialogContent>

      {!authSuccess && (
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={handleDecline} disabled={isAuthorizing} className="rounded-full">
            Decline
          </Button>
          <Button
            variant="primary"
            size="md"
            disabled={isRequester || isAuthorizing}
            onClick={handleApprove}
            className="min-w-[130px] rounded-full"
          >
            {isAuthorizing ? (
              <span className="flex items-center gap-1.5">
                <SolarIcon name="refresh" size={14} className="animate-spin" />
                Verifying...
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                <SolarIcon name="shield-check" size={16} />
                Approve & Sign
              </span>
            )}
          </Button>
        </DialogFooter>
      )}
    </Dialog>
  );
}
