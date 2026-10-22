"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { SolarIcon } from "@/components/icons/solar";

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  className?: string;
}

export function Dialog({ open, onOpenChange, children, className }: DialogProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    if (open) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.body.style.overflow = "unset";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onOpenChange]);

  if (!open || !mounted) return null;

  // Phones get a bottom sheet (thumb-reachable, scrolls when the content is
  // taller than the screen); larger screens keep the centred dialog.
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center sm:p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-neutral-900/50 backdrop-blur-sm transition-opacity"
        onClick={() => onOpenChange(false)}
      />
      {/* Dialog box */}
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "relative z-10 w-full max-w-lg max-h-[92dvh] overflow-y-auto overscroll-contain bg-[#fef9ef] rounded-t-[24px] sm:rounded-[16px] shadow-2xl border border-[#d1c9bf]/40 animate-in fade-in-0 slide-in-from-bottom-8 sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-200",
          className
        )}
      >
        <div className="sm:hidden sticky top-0 z-10 flex justify-center pt-2 -mb-2 pointer-events-none" aria-hidden="true">
          <span className="w-10 h-1 rounded-full bg-[#d1c9bf]" />
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}

export function DialogHeader({
  className,
  children,
  onClose,
}: {
  className?: string;
  children: React.ReactNode;
  onClose?: () => void;
}) {
  return (
    <div className={cn("p-5 sm:p-6 flex items-start justify-between gap-3 bg-[#fef9ef]", className)}>
      <div className="space-y-1 min-w-0">{children}</div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="shrink-0 -mr-1.5 -mt-1 text-[#515151] hover:text-[#2a2b2f] p-2 rounded-full hover:bg-[#f5eee1] transition-colors cursor-pointer"
        >
          <SolarIcon name="close-circle" size={20} />
        </button>
      )}
    </div>
  );
}

export function DialogTitle({ className, children }: { className?: string; children: React.ReactNode }) {
  return <h2 className={cn("text-lg font-serif font-normal text-[#2a2b2f]", className)}>{children}</h2>;
}

export function DialogDescription({ className, children }: { className?: string; children: React.ReactNode }) {
  return <p className={cn("text-xs text-[#515151]", className)}>{children}</p>;
}

export function DialogContent({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("p-5 sm:p-6 space-y-4 bg-[#fef9ef]", className)}>{children}</div>;
}

// Sticks to the bottom of a scrolling sheet so the actions stay in reach, and
// clears the home indicator on phones.
export function DialogFooter({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "sticky bottom-0 z-10 p-5 sm:p-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:pb-6 bg-[#f5eee1] flex items-center justify-end gap-3",
        className
      )}
    >
      {children}
    </div>
  );
}
