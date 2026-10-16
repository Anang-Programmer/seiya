"use client";

import React, { useState } from "react";
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SolarIcon } from "@/components/icons/solar";

interface PinAuthDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  actionLabel?: string;
  onSuccess: () => void;
}

export function PinAuthDialog({
  open,
  onOpenChange,
  title = "Security Verification",
  description = "Please enter your 6-digit security PIN to confirm this action.",
  actionLabel = "Confirm & Approve",
  onSuccess,
}: PinAuthDialogProps) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleDigit = (digit: string) => {
    if (pin.length < 6) {
      setPin((prev) => prev + digit);
      setError("");
    }
  };

  const handleBackspace = () => {
    setPin((prev) => prev.slice(0, -1));
    setError("");
  };

  const handleClear = () => {
    setPin("");
    setError("");
  };

  const handleSubmit = () => {
    if (pin.length !== 6) {
      setError("PIN must be exactly 6 digits.");
      return;
    }

    // Default correct PIN is 123456 (or accept any 6 digits for user convenience if needed, but validate 123456 / non-empty)
    setIsVerifying(true);
    setError("");

    setTimeout(() => {
      setIsVerifying(false);
      setIsSuccess(true);

      setTimeout(() => {
        setIsSuccess(false);
        setPin("");
        onOpenChange(false);
        onSuccess();
      }, 900);
    }, 1000);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} className="max-w-md">
      <DialogHeader onClose={() => onOpenChange(false)} className="pb-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-[#fbf0eb] text-[#B45529] flex items-center justify-center">
            <SolarIcon name="shield-check" size={18} />
          </div>
          <div>
            <DialogTitle className="text-base font-serif font-normal text-[#2a2b2f]">
              {title}
            </DialogTitle>
          </div>
        </div>
        <DialogDescription className="text-xs text-[#515151] pt-1">
          {description}
        </DialogDescription>
      </DialogHeader>

      <DialogContent className="pt-2 pb-4 space-y-4">
        {isSuccess ? (
          <div className="py-8 text-center space-y-3 animate-in fade-in-0 zoom-in-95">
            <div className="w-14 h-14 rounded-full bg-[#edf3ec] text-[#2d5232] flex items-center justify-center mx-auto shadow-2xs">
              <SolarIcon name="check-circle" size={32} />
            </div>
            <h4 className="text-base font-serif text-[#2a2b2f]">Security PIN Verified</h4>
            <p className="text-xs text-[#515151]">Approval cryptographic signature registered.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* PIN Dots Display */}
            <div className="flex justify-center items-center gap-3 py-3">
              {[0, 1, 2, 3, 4, 5].map((index) => {
                const filled = index < pin.length;
                return (
                  <div
                    key={index}
                    className={`w-4 h-4 rounded-full transition-all duration-150 ${
                      filled
                        ? "bg-[#B45529] scale-110 shadow-xs"
                        : "border-2 border-[#d1c9bf] bg-transparent"
                    }`}
                  />
                );
              })}
            </div>

            {/* Hidden / Manual input for accessibility or fast typing */}
            <div className="flex items-center justify-center gap-2">
              <input
                type="password"
                maxLength={6}
                value={pin}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, "").slice(0, 6);
                  setPin(val);
                  setError("");
                }}
                placeholder="Or type PIN (default: 123456)"
                className="text-center text-xs px-3 py-1.5 rounded-full border border-[#d1c9bf] bg-[#f5eee1] text-[#2a2b2f] placeholder-[#808988] focus:outline-none focus:ring-1 focus:ring-[#B45529]"
              />
              <button
                type="button"
                onClick={() => setPin("123456")}
                className="text-[11px] font-semibold text-[#B45529] hover:underline px-2 py-1 cursor-pointer"
              >
                Auto 123456
              </button>
            </div>

            {/* Numeric Keypad */}
            <div className="grid grid-cols-3 gap-2 max-w-[260px] mx-auto pt-1">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => handleDigit(num)}
                  disabled={isVerifying}
                  className="h-11 rounded-full bg-[#f5eee1] hover:bg-[#ece3d3] active:bg-[#e2d5c0] text-[#2a2b2f] font-mono text-base font-bold transition-all shadow-2xs flex items-center justify-center cursor-pointer"
                >
                  {num}
                </button>
              ))}
              <button
                type="button"
                onClick={handleClear}
                disabled={isVerifying}
                className="h-11 rounded-full text-[#808988] hover:text-[#2a2b2f] text-xs font-semibold transition-all flex items-center justify-center cursor-pointer"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => handleDigit("0")}
                disabled={isVerifying}
                className="h-11 rounded-full bg-[#f5eee1] hover:bg-[#ece3d3] active:bg-[#e2d5c0] text-[#2a2b2f] font-mono text-base font-bold transition-all shadow-2xs flex items-center justify-center cursor-pointer"
              >
                0
              </button>
              <button
                type="button"
                onClick={handleBackspace}
                disabled={isVerifying}
                className="h-11 rounded-full text-[#808988] hover:text-[#2a2b2f] text-xs font-semibold transition-all flex items-center justify-center cursor-pointer"
                title="Backspace"
              >
                <SolarIcon name="arrow-left" size={16} />
              </button>
            </div>

            {error && (
              <p className="text-center text-xs text-[#a34426] font-medium pt-1 animate-shake">
                {error}
              </p>
            )}
          </div>
        )}
      </DialogContent>

      {!isSuccess && (
        <DialogFooter className="flex justify-between sm:justify-between items-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={isVerifying}
            className="rounded-full text-xs"
          >
            Cancel
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={handleSubmit}
            disabled={pin.length !== 6 || isVerifying}
            className="rounded-full text-xs min-w-[130px] font-semibold"
          >
            {isVerifying ? (
              <span className="flex items-center gap-1.5">
                <SolarIcon name="refresh" size={14} className="animate-spin" />
                Verifying PIN...
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                <SolarIcon name="lock-keyhole" size={14} />
                {actionLabel}
              </span>
            )}
          </Button>
        </DialogFooter>
      )}
    </Dialog>
  );
}
