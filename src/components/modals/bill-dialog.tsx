"use client";

import React, { useState, useEffect } from "react";
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SolarIcon } from "@/components/icons/solar";
import { useApp, BillItem } from "@/lib/store";
import { parseAmount } from "@/lib/receipt-text";

interface BillDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  billToEdit?: BillItem | null;
}

const CATEGORY_OPTIONS = [
  { label: "Utilities & Electricity", icon: "bolt" },
  { label: "Subscription & Streaming", icon: "play-circle" },
  { label: "Rent & Housing", icon: "home" },
  { label: "Internet & Phone", icon: "wifi" },
  { label: "Insurance & Health", icon: "shield-check" },
  { label: "Other Recurring", icon: "calendar" },
];

// Local calendar date as YYYY-MM-DD (toISOString would shift it to UTC).
function isoDay(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function daysFromToday(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return isoDay(d);
}

export function BillDialog({ open, onOpenChange, billToEdit }: BillDialogProps) {
  const { addBill, editBill, household, wallets, currentUser, partnerAName, partnerBName } = useApp();
  // Bills are paid from the shared wallet, and the database only accepts the
  // household's base currency for them.
  const currency = household?.baseCurrency || wallets.shared.currency || "IDR";

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("Utilities & Electricity");
  const [amount, setAmount] = useState<string>("");
  const [dueDate, setDueDate] = useState(daysFromToday(14));
  const [isRecurring, setIsRecurring] = useState(true);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (billToEdit) {
      setTitle(billToEdit.title);
      setCategory(billToEdit.category || "Utilities & Electricity");
      setAmount(billToEdit.amount.toString());
      // dueDate is a display string; daysRemaining gives the exact day back.
      setDueDate(daysFromToday(billToEdit.daysRemaining));
      setIsRecurring(billToEdit.isRecurring !== false);
      setNotes(billToEdit.notes || "");
    } else {
      setTitle("");
      setCategory("Utilities & Electricity");
      setAmount("");
      setDueDate(daysFromToday(14));
      setIsRecurring(true);
      setNotes("");
    }
    setError("");
    setSuccessMsg("");
  }, [billToEdit, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;
    setError("");

    if (!title.trim()) {
      setError("Please enter a bill or obligation title.");
      return;
    }

    const numAmount = parseAmount(amount) ?? NaN;
    if (isNaN(numAmount) || numAmount <= 0) {
      setError("Please enter a valid amount greater than 0.");
      return;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
      setError("Please pick the next due date.");
      return;
    }
    if (!billToEdit && dueDate < daysFromToday(0)) {
      setError("The next due date can't be in the past.");
      return;
    }

    setIsSaving(true);
    let ok: boolean;
    if (billToEdit) {
      ok = await editBill(billToEdit.id, {
        title: title.trim(),
        category,
        amount: numAmount,
        currency,
        dueDate: dueDate.trim() || "Monthly",
        wallet: "shared",
        isRecurring,
        notes: notes.trim(),
      });
      if (ok) setSuccessMsg("Bill updated successfully!");
    } else {
      ok = await addBill({
        title: title.trim(),
        category,
        amount: numAmount,
        currency,
        dueDate: dueDate.trim() || "Monthly",
        wallet: "shared",
        status: "upcoming",
        isRecurring,
        notes: notes.trim(),
        paidBy: currentUser,
      });
      if (ok) setSuccessMsg("New bill reminder added! Requires partner confirmation when settled.");
    }
    setIsSaving(false);

    if (!ok) {
      setError("We couldn't save this bill. Please try again.");
      return;
    }

    setTimeout(() => {
      onOpenChange(false);
      setSuccessMsg("");
    }, 700);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} className="max-w-md">
      <DialogHeader onClose={() => onOpenChange(false)}>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-[#fbf0eb] text-[#B45529] flex items-center justify-center shrink-0">
            <SolarIcon name="calendar" size={18} />
          </div>
          <div>
            <DialogTitle className="text-base font-serif font-normal text-[#2a2b2f]">
              {billToEdit ? "Edit Monthly Bill" : "Add Bills Reminder"}
            </DialogTitle>
          </div>
        </div>
        <DialogDescription className="text-xs text-[#515151]">
          {billToEdit
            ? "Update recurring obligation details or payment schedule."
            : "Register a recurring shared or individual bill. When paid, your partner must manually ACC it."}
        </DialogDescription>
      </DialogHeader>

      <DialogContent className="pt-2 pb-4">
        {successMsg ? (
          <div className="py-4 text-center space-y-3 animate-in fade-in-0">
            <div
              style={{
                width: 200,
                height: 170,
                maskImage:
                  "radial-gradient(ellipse 49% 45% at 50% 50%, #000 68%, rgba(0,0,0,0.85) 80%, rgba(0,0,0,0.4) 90%, transparent 98%)",
                WebkitMaskImage:
                  "radial-gradient(ellipse 49% 45% at 50% 50%, #000 68%, rgba(0,0,0,0.85) 80%, rgba(0,0,0,0.4) 90%, transparent 98%)",
              }}
              className="relative overflow-hidden shrink-0 select-none mx-auto flex items-center justify-center my-0"
            >
              <video
                src="/videos/ApprovedSeiya.webm"
                autoPlay
                loop
                muted
                playsInline
                preload="auto"
                className="w-full h-full object-contain pointer-events-none"
              />
            </div>
            <h4 className="text-base font-serif text-[#2a2b2f]">
              {billToEdit ? "Bill Updated" : "Bill Reminder Registered"}
            </h4>
            <p className="text-xs text-[#515151]">{successMsg}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-2.5 rounded-[10px] bg-[#fcf0ee] text-[#a34426] text-xs flex items-center gap-2 border border-[#a34426]/20">
                <SolarIcon name="danger-triangle" size={16} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Title */}
            <div>
              <label className="text-xs font-semibold text-[#2a2b2f] block mb-1">
                Bill Title *
              </label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Electricity & AC, Netflix Family, WiFi"
                className="text-xs bg-[#fef9ef]"
              />
            </div>

            {/* Category Presets */}
            <div>
              <label className="text-xs font-semibold text-[#2a2b2f] block mb-1.5">
                Category
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                {CATEGORY_OPTIONS.map((cat) => (
                  <button
                    type="button"
                    key={cat.label}
                    onClick={() => setCategory(cat.label)}
                    className={`px-2.5 py-1.5 rounded-[10px] text-[11px] font-medium flex items-center gap-1.5 border transition-all text-left cursor-pointer ${
                      category === cat.label
                        ? "bg-[#B45529] text-[#fef9ef] border-[#B45529] shadow-2xs font-semibold"
                        : "bg-[#fef9ef] text-[#515151] border-[#d1c9bf]/60 hover:border-[#B45529]/40 hover:text-[#2a2b2f]"
                    }`}
                  >
                    <SolarIcon name={cat.icon as any} size={14} className="shrink-0" />
                    <span className="truncate">{cat.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Amount & Currency */}
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <label className="text-xs font-semibold text-[#2a2b2f] block mb-1">
                  Amount *
                </label>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder={currency === "IDR" ? "e.g. 350.000" : "e.g. 45.00"}
                  className="text-xs font-mono font-bold bg-[#fef9ef]"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-[#2a2b2f] block mb-1">
                  Currency
                </label>
                {/* Fixed to the household currency the shared wallet pays in */}
                <div className="w-full h-9 px-3 rounded-full border border-[#d1c9bf] bg-[#f5eee1] text-xs font-mono font-bold text-[#2a2b2f] flex items-center">
                  {currency}
                </div>
              </div>
            </div>

            {/* Due Date & Wallet */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-semibold text-[#2a2b2f] block mb-1">
                  {isRecurring ? "Next Due Date" : "Due Date"}
                </label>
                <Input
                  type="date"
                  value={dueDate}
                  min={billToEdit ? undefined : daysFromToday(0)}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="text-xs bg-[#fef9ef]"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-[#2a2b2f] block mb-1">
                  Paid From
                </label>
                <div className="w-full h-9 px-3 rounded-full border border-[#d1c9bf] bg-[#f5eee1] text-xs font-medium text-[#2a2b2f] flex items-center">
                  Shared wallet
                </div>
              </div>
            </div>

            {/* Recurring Toggle & Dual-Key notice */}
            <div className="p-3 rounded-[12px] bg-[#fef9ef] border border-[#d1c9bf]/60 space-y-2">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-xs font-medium text-[#2a2b2f]">Repeats every month on this date</span>
                <input
                  type="checkbox"
                  checked={isRecurring}
                  onChange={(e) => setIsRecurring(e.target.checked)}
                  className="w-4 h-4 rounded text-[#B45529] accent-[#B45529] cursor-pointer"
                />
              </label>
              <div className="text-[11px] text-[#515151] flex items-start gap-1.5 pt-1.5 border-t border-[#d1c9bf]/40 leading-snug">
                <SolarIcon name="shield-check" size={14} className="text-[#B45529] shrink-0 mt-0.5" />
                <span>
                  <strong>Dual-Key Confirmation Rule:</strong> When you mark this bill as paid, an approval request will be dispatched for{" "}
                  <strong>{currentUser === "partner_a" ? partnerBName : partnerAName}</strong> to confirm before closing.
                </span>
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
                disabled={isSaving}
                className="text-xs"
              >
                {isSaving ? "Saving..." : billToEdit ? "Save Changes" : "Create Bill Reminder"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
