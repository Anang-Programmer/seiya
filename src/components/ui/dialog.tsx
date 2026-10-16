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

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-neutral-900/50 backdrop-blur-sm transition-opacity"
        onClick={() => onOpenChange(false)}
      />
      {/* Dialog box */}
      <div className={cn("relative z-10 w-full max-w-lg bg-[#fef9ef] rounded-[16px] shadow-2xl overflow-hidden animate-in fade-in-0 zoom-in-95 duration-200 border border-[#d1c9bf]/40", className)}>
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
    <div className={cn("p-6 flex items-start justify-between bg-[#fef9ef]", className)}>
      <div className="space-y-1">{children}</div>
      {onClose && (
        <button
          onClick={onClose}
          className="text-[#515151] hover:text-[#2a2b2f] p-1.5 rounded-full hover:bg-[#f5eee1] transition-colors cursor-pointer"
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
  return <div className={cn("p-6 space-y-4 bg-[#fef9ef]", className)}>{children}</div>;
}

export function DialogFooter({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("p-5 sm:p-6 bg-[#f5eee1] flex items-center justify-end gap-3", className)}>{children}</div>;
}
