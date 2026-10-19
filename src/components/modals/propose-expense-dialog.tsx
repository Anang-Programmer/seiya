"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { SolarIcon, SolarIconName } from "@/components/icons/solar";
import { useApp } from "@/lib/store";
import { convertAmount } from "@/lib/currency";
import { parseAmount } from "@/lib/receipt-text";
// Amounts here are decided on, so they stay visible in privacy mode.
import { formatMoneyAlways as formatMoney } from "@/lib/utils";

interface ProposeExpenseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultTitle?: string;
}

type ExpenseCategory = "Food & Drinks" | "Shopping" | "Bills" | "Transportation" | "Health" | "Social" | "Others";

interface CategoryOption {
  label: ExpenseCategory;
  icon: SolarIconName;
}

const CATEGORY_OPTIONS: CategoryOption[] = [
  { label: "Food & Drinks", icon: "cup" },
  { label: "Shopping", icon: "bag" },
  { label: "Transportation", icon: "car" },
  { label: "Bills", icon: "receipt" },
  { label: "Health", icon: "shield-check" },
  { label: "Social", icon: "heart" },
  { label: "Others", icon: "layers" },
];

// Presets fill the purpose and category only; amounts depend on the wallet's currency.
const PRESET_EXPENSES = [
  { label: "Groceries", title: "Weekly groceries", category: "Food & Drinks" as ExpenseCategory },
  { label: "Date night", title: "Dinner together", category: "Social" as ExpenseCategory },
  { label: "Home", title: "Home supplies", category: "Shopping" as ExpenseCategory },
  { label: "Transport", title: "Transport", category: "Transportation" as ExpenseCategory },
  { label: "Internet", title: "Home internet", category: "Bills" as ExpenseCategory },
];

// Quick "+" chips sized to the currency, so IDR does not get "+25".
function quickAmountSteps(currency: string): number[] {
  if (currency === "IDR") return [10_000, 25_000, 50_000, 100_000, 500_000];
  if (currency === "JPY") return [500, 1_000, 2_500, 5_000, 10_000];
  return [5, 10, 25, 50, 100];
}

export function ProposeExpenseDialog({ open, onOpenChange, defaultTitle = "" }: ProposeExpenseDialogProps) {
  const {
    currentUser,
    partnerAName,
    partnerBName,
    reportingCurrency,
    locale,
    contract,
    wallets,
    proposeExpense,
  } = useApp();

  const activeProposer = currentUser === "partner_a" ? partnerAName : partnerBName;
  const partnerApprover = currentUser === "partner_a" ? partnerBName : partnerAName;
  // You can spend from the shared wallet or your own; your partner's wallet is theirs.
  const myWalletKey = currentUser === "partner_a" ? "personal_a" : "personal_b";
  const myWallet = currentUser === "partner_a" ? wallets.personalA : wallets.personalB;

  // Form State
  const [title, setTitle] = useState(defaultTitle);
  const [amount, setAmount] = useState<string>("");
  const [category, setCategory] = useState<ExpenseCategory>("Shopping");
  const [wallet, setWallet] = useState<"shared" | "personal_a" | "personal_b">("shared");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [urgency, setUrgency] = useState<"routine" | "planned" | "urgent" | "emergency">("routine");
  // The chosen file's name is noted on the request so your partner knows a
  // receipt or quote exists (the file itself stays on this device).
  const [receiptFileName, setReceiptFileName] = useState<string | null>(null);
  const receiptAttached = Boolean(receiptFileName);
  const receiptInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [successResult, setSuccessResult] = useState<{
    outcome: "NEED_APPROVAL" | "ALLOW" | "HOLD";
    id: string;
    reason: string;
  } | null>(null);

  useEffect(() => {
    if (open) {
      setTitle(defaultTitle || "");
      setAmount("");
      setCategory("Shopping");
      setWallet("shared");
      setNotes("");
      setUrgency("routine");
      setReceiptFileName(null);
      setError("");
      setSuccessResult(null);
    }
  }, [open, defaultTitle, reportingCurrency]);

  // Accepts "150.000", "150,000" and "12.50" alike.
  const numAmount = parseAmount(amount) ?? 0;

  // The ledger records the expense in the funding wallet's own currency.
  const currency =
    (wallet === "shared" ? wallets.shared.currency : myWallet.currency) || reportingCurrency || "IDR";

  // Shared expenses are always split by the ratio in Seiya's Promise; the
  // settlement ledger applies that ratio, so the preview shows the same one.
  const splitBreakdown = useMemo(() => {
    const ratioA = contract.splitPartnerA;
    const ratioB = contract.splitPartnerB;
    return { ratioA, ratioB, shareA: (numAmount * ratioA) / 100, shareB: (numAmount * ratioB) / 100 };
  }, [numAmount, contract.splitPartnerA, contract.splitPartnerB]);

  // Policy evaluation preview
  const policyPreview = useMemo(() => {
    if (wallet !== "shared") {
      return {
        requiresApproval: false,
        badge: "Personal Wallet",
        badgeVariant: "secondary" as const,
        description: `Funded privately from ${activeProposer}'s wallet. No partner sign-off necessary.`,
      };
    }

    const amountInThresholdCurrency = convertAmount(numAmount, currency, contract.thresholdCurrency || currency);
    const exceeds = contract.approveEverySharedPurchase || amountInThresholdCurrency >= contract.approvalThreshold;
    if (exceeds) {
      return {
        requiresApproval: true,
        badge: "Dual-Key Required",
        badgeVariant: "need_approval" as const,
        description: `Exceeds the agreed ${formatMoney(contract.approvalThreshold, contract.thresholdCurrency, locale)} limit. Requires ${partnerApprover}'s cryptographic PIN signature.`,
      };
    }

    return {
      requiresApproval: false,
      badge: "Pre-Approved",
      badgeVariant: "allow" as const,
      description: `Within the shared micro-spending threshold (${formatMoney(contract.approvalThreshold, contract.thresholdCurrency, locale)}). Can be logged directly.`,
    };
  }, [wallet, numAmount, currency, contract.approvalThreshold, contract.thresholdCurrency, contract.approveEverySharedPurchase, activeProposer, partnerApprover, locale]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setError("");

    if (!title.trim()) {
      setError("Please specify the expense purpose or merchant name.");
      return;
    }

    if (numAmount <= 0) {
      setError("Please specify a valid expense amount greater than 0.");
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await proposeExpense({
        title: title.trim(),
        amount: numAmount,
        currency,
        category,
        wallet,
        splitRatio: {
          partnerA: splitBreakdown.ratioA,
          partnerB: splitBreakdown.ratioB,
        },
        notes: [notes.trim(), receiptFileName ? `Receipt: ${receiptFileName}` : ""].filter(Boolean).join(" • "),
        urgency,
        receiptName: receiptFileName ?? undefined,
      });
      setSuccessResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to submit this expense. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApplyPreset = (preset: typeof PRESET_EXPENSES[0]) => {
    setTitle(preset.title);
    setCategory(preset.category);
    setError("");
  };

  const walletLabel =
    wallet === "shared" ? "Shared wallet" : `${activeProposer}'s wallet`;

  const handleAddAmount = (addVal: number) => {
    // Functional update so quick repeated taps all add up.
    setAmount((prev) => ((parseAmount(prev) ?? 0) + addVal).toString());
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} className="max-w-xl max-h-[92vh] flex flex-col">
      <DialogHeader onClose={() => onOpenChange(false)} className="pb-3 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-[#fbf0eb] text-[#B45529] flex items-center justify-center shrink-0">
            <SolarIcon name="bag" size={18} />
          </div>
          <div>
            <DialogTitle className="text-base font-serif font-normal text-[#2a2b2f]">
              Propose Couple Expense
            </DialogTitle>
            <DialogDescription className="text-xs text-[#515151]">
              Submit an itemized expense with cost-sharing ratio and Dual-Key governance.
            </DialogDescription>
          </div>
        </div>
      </DialogHeader>

      <DialogContent className="overflow-y-auto pr-2 pb-4 space-y-4 flex-1">
        {successResult ? (
          <div className="py-6 text-center space-y-4 animate-in fade-in-0 zoom-in-95">
            {successResult.outcome === "NEED_APPROVAL" ? (
              <div className="w-14 h-14 rounded-full bg-[#fbf0eb] text-[#B45529] flex items-center justify-center mx-auto shadow-2xs">
                <SolarIcon name="shield-check" size={32} />
              </div>
            ) : successResult.outcome === "HOLD" ? (
              <div className="w-14 h-14 rounded-full bg-[#fcf5e8] text-[#C98A4F] flex items-center justify-center mx-auto shadow-2xs">
                <SolarIcon name="clock-circle" size={32} />
              </div>
            ) : (
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
                  src="/other/ApprovedSeiya.webm"
                  autoPlay
                  loop
                  muted
                  playsInline
                  preload="auto"
                  className="w-full h-full object-contain pointer-events-none"
                />
              </div>
            )}

            <div className="space-y-1">
              <h3 className="text-lg font-serif text-[#2a2b2f]">
                {successResult.outcome === "NEED_APPROVAL"
                  ? "Expense Proposal Routed to Partner"
                  : successResult.outcome === "HOLD"
                  ? "Expense Held by Safeguard"
                  : "Expense Recorded Successfully"}
              </h3>
              <p className="text-xs text-[#515151] max-w-sm mx-auto leading-relaxed">
                {successResult.outcome === "NEED_APPROVAL"
                  ? `Your proposal for "${title}" has been sent to ${partnerApprover}. They can review details and sign via the Approvals deck.`
                  : successResult.outcome === "HOLD"
                  ? `Late-night cooling-off guard triggered. This proposal will be held until morning.`
                  : `Transaction executed and recorded directly to the shared ledger.`}
              </p>
            </div>

            {/* Summary card */}
            <div className="p-3.5 rounded-[12px] bg-[#f5eee1] text-xs text-left space-y-2 max-w-sm mx-auto border border-[#d1c9bf]/40">
              <div className="flex justify-between items-center">
                <span className="text-[#808988]">Item</span>
                <span className="font-semibold text-[#2a2b2f]">{title}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[#808988]">Total Amount</span>
                <span className="font-serif font-bold text-[#B45529] text-sm">
                  {formatMoney(numAmount, currency, locale)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[#808988]">Wallet</span>
                <span className="font-medium text-[#2a2b2f]">{walletLabel}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[#808988]">Proposer</span>
                <span className="font-medium text-[#2a2b2f]">{activeProposer}</span>
              </div>
            </div>

            <Button
              variant="primary"
              size="md"
              onClick={() => onOpenChange(false)}
              className="rounded-full px-8 mx-auto"
            >
              Done
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 rounded-[12px] bg-[#fcf0ee] text-[#a34426] text-xs flex items-center gap-2 border border-[#a34426]/20">
                <SolarIcon name="danger-triangle" size={16} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* 1. Quick Presets */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-[#808988] uppercase tracking-wider block">
                Quick Suggestions
              </label>
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
                {PRESET_EXPENSES.map((preset) => (
                  <button
                    key={preset.title}
                    type="button"
                    onClick={() => handleApplyPreset(preset)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#f5eee1] hover:bg-[#ece3d3] text-[11px] text-[#2a2b2f] font-medium border border-[#d1c9bf]/40 shrink-0 transition-all cursor-pointer"
                  >
                    <span>{preset.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* 2. Expense Purpose / Title */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-[#2a2b2f] block">
                Expense Purpose / Merchant <span className="text-[#a34426]">*</span>
              </label>
              <Input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Weekly groceries, train tickets, a new sofa"
                className="w-full text-xs"
              />
            </div>

            {/* 3. Amount & Currency */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div className="sm:col-span-2 space-y-1">
                <label className="text-xs font-semibold text-[#2a2b2f] block">
                  Amount <span className="text-[#a34426]">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder={currency === "IDR" ? "e.g. 150.000" : "e.g. 25.00"}
                    className="w-full px-3.5 py-2 rounded-full border border-[#d1c9bf] bg-[#fef9ef] text-[#2a2b2f] font-serif text-lg font-bold focus:outline-none focus:ring-2 focus:ring-[#B45529]/20"
                  />
                  {/* Quick increment chips */}
                  <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                    {quickAmountSteps(currency).map((val) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => handleAddAmount(val)}
                        className="px-2 py-0.5 rounded-full bg-[#f5eee1] hover:bg-[#ece3d3] text-[10px] font-serif font-bold text-[#808988] hover:text-[#B45529] border border-[#d1c9bf]/40 cursor-pointer"
                      >
                        +{val.toLocaleString(locale)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#2a2b2f] block">
                  Currency
                </label>
                {/* Read-only: the funding wallet decides the currency the ledger records */}
                <div
                  className="w-full h-10 px-3 rounded-full border border-[#d1c9bf] bg-[#f5eee1] text-xs font-semibold text-[#2a2b2f] flex items-center"
                  title="Expenses are recorded in the funding wallet's currency"
                >
                  {currency}
                </div>
                <span className="text-[10px] text-[#808988] block px-1">Follows the wallet</span>
              </div>
            </div>

            {/* 4. Category Selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[#2a2b2f] block">
                Category
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {CATEGORY_OPTIONS.map((cat) => {
                  const isSelected = category === cat.label;
                  return (
                    <button
                      key={cat.label}
                      type="button"
                      onClick={() => setCategory(cat.label)}
                      className={`flex items-center gap-1.5 p-2 rounded-[12px] border text-xs font-medium transition-all cursor-pointer ${
                        isSelected
                          ? "bg-[#faeade] border-[#B45529] text-[#B45529] shadow-2xs font-semibold"
                          : "bg-[#f5eee1] border-[#d1c9bf]/50 text-[#515151] hover:bg-[#ece3d3]"
                      }`}
                    >
                      <SolarIcon name={cat.icon} size={15} className="shrink-0" />
                      <span className="truncate">{cat.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 5. Source Wallet & Balance */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[#2a2b2f] block">
                Funding Wallet
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setWallet("shared")}
                  className={`p-2.5 rounded-[12px] border text-left transition-all cursor-pointer ${
                    wallet === "shared"
                      ? "bg-[#faeade] border-[#B45529] shadow-2xs"
                      : "bg-[#f5eee1] border-[#d1c9bf]/50 hover:bg-[#ece3d3]"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#2a2b2f]">Shared Wallet</span>
                    {wallet === "shared" && <SolarIcon name="check" size={14} className="text-[#B45529]" />}
                  </div>
                  <span className="text-[11px] font-serif font-bold text-[#808988] block mt-0.5">
                    {formatMoney(wallets.shared.balance, wallets.shared.currency, locale)}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setWallet(myWalletKey)}
                  className={`p-2.5 rounded-[12px] border text-left transition-all cursor-pointer ${
                    wallet === myWalletKey
                      ? "bg-[#faeade] border-[#B45529] shadow-2xs"
                      : "bg-[#f5eee1] border-[#d1c9bf]/50 hover:bg-[#ece3d3]"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#2a2b2f]">My wallet ({activeProposer})</span>
                    {wallet === myWalletKey && <SolarIcon name="check" size={14} className="text-[#B45529]" />}
                  </div>
                  <span className="text-[11px] font-serif font-bold text-[#808988] block mt-0.5">
                    {formatMoney(myWallet.balance, myWallet.currency, locale)}
                  </span>
                </button>
              </div>
            </div>

            {/* 6. Split & Contribution Model (when Shared Wallet) */}
            {wallet === "shared" && (
              <div className="p-3 rounded-[12px] bg-[#f5eee1] space-y-2.5 border border-[#d1c9bf]/40">
                <div className="flex justify-between items-center gap-2">
                  <label className="text-xs font-semibold text-[#2a2b2f]">
                    Cost Split
                  </label>
                  <span className="text-[11px] text-[#808988] text-right">
                    {partnerAName} {splitBreakdown.ratioA}% · {partnerBName} {splitBreakdown.ratioB}%
                  </span>
                </div>
                <p className="text-[11px] text-[#808988] leading-snug">
                  Follows the split in your Seiya&apos;s Promise. Change it there to apply it to every shared expense.
                </p>

                {/* Real-time share breakdown */}
                <div className="flex justify-between items-center text-xs pt-1 border-t border-[#d1c9bf]/40">
                  <span className="text-[#515151]">Calculated Shares:</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[#2a2b2f]">
                      {partnerAName}: <strong className="font-serif text-[#B45529]">{formatMoney(splitBreakdown.shareA, currency, locale)}</strong>
                    </span>
                    <span className="text-[#808988]">•</span>
                    <span className="text-[#2a2b2f]">
                      {partnerBName}: <strong className="font-serif text-[#B45529]">{formatMoney(splitBreakdown.shareB, currency, locale)}</strong>
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* 7. Detailed Justification / Notes */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-[#2a2b2f] block">
                Detailed Purpose & Notes
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Provide context for your partner (e.g., replacement for worn gear, annual membership, split discount)..."
                className="w-full px-3.5 py-2 rounded-[12px] border border-[#d1c9bf] bg-[#fef9ef] text-xs text-[#2a2b2f] focus:outline-none focus:ring-2 focus:ring-[#B45529]/20 resize-none"
              />
            </div>

            {/* 8. Urgency Level & Receipt Attachment */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#2a2b2f] block">
                  Priority / Urgency
                </label>
                <select
                  value={urgency}
                  onChange={(e) => setUrgency(e.target.value as any)}
                  className="w-full h-9 px-3 rounded-full border border-[#d1c9bf] bg-[#fef9ef] text-xs text-[#2a2b2f] focus:outline-none"
                >
                  <option value="routine">Routine Expense</option>
                  <option value="planned">Planned Milestone Goal</option>
                  <option value="urgent">Time-Sensitive Purchase</option>
                  <option value="emergency">Urgent / Essential</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#2a2b2f] block">
                  Receipt / Quote
                </label>
                <input
                  ref={receiptInputRef}
                  type="file"
                  accept="image/*,application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) setReceiptFileName(file.name.slice(0, 120));
                    e.target.value = "";
                  }}
                />
                <button
                  type="button"
                  onClick={() => (receiptAttached ? setReceiptFileName(null) : receiptInputRef.current?.click())}
                  className={`w-full h-9 px-3 rounded-full border text-xs font-medium flex items-center justify-between transition-all cursor-pointer ${
                    receiptAttached
                      ? "bg-[#edf3ec] border-[#2d5232] text-[#2d5232]"
                      : "bg-[#fef9ef] border-[#d1c9bf] text-[#808988] hover:text-[#2a2b2f]"
                  }`}
                >
                  <span className="flex items-center gap-1.5 truncate">
                    <SolarIcon name="paperclip" size={13} />
                    {receiptAttached ? receiptFileName : "Attach Receipt/Quote"}
                  </span>
                  <span className="text-[10px] underline font-semibold">
                    {receiptAttached ? "Remove" : "Attach"}
                  </span>
                </button>
              </div>
            </div>

            {/* 9. Live Dual-Key Safeguard Policy Preview */}
            <div className={`p-3 rounded-[12px] text-xs space-y-1 border ${
              policyPreview.requiresApproval
                ? "bg-[#faeade]/70 border-[#B45529]/40 text-[#2a2b2f]"
                : "bg-[#edf3ec]/70 border-[#2d5232]/30 text-[#2a2b2f]"
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 font-bold">
                  <SolarIcon
                    name={policyPreview.requiresApproval ? "shield-check" : "check-circle"}
                    size={15}
                    className={policyPreview.requiresApproval ? "text-[#B45529]" : "text-[#2d5232]"}
                  />
                  <span>Dual-Key Policy Safeguard</span>
                </div>
                <Badge variant={policyPreview.badgeVariant} className="text-[10px] px-2 py-0.5">
                  {policyPreview.badge}
                </Badge>
              </div>
              <p className="text-[11px] leading-relaxed text-[#515151]">
                {policyPreview.description}
              </p>
            </div>

            {/* Footer Buttons */}
            <div className="pt-2 flex justify-between items-center">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onOpenChange(false)}
                className="rounded-full text-xs"
              >
                Cancel
              </Button>

              <Button
                type="submit"
                variant="primary"
                size="md"
                disabled={isSubmitting}
                className="rounded-full px-6 min-w-[150px]"
              >
                <SolarIcon name="shield-check" size={16} />
                <span>
                  {isSubmitting
                    ? "Checking rules..."
                    : policyPreview.requiresApproval
                    ? "Propose to Partner"
                    : "Record Expense"}
                </span>
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
