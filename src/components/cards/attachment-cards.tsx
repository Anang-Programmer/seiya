"use client";

import React, { useState } from "react";
import { SolarIcon } from "@/components/icons/solar";
import { formatMoney } from "@/lib/utils";
import type { ScannedReceipt, StatementTransaction } from "@/lib/api";

// Cards Seiya shows in the chat after the user attaches a bank statement (📎)
// or a receipt photo (🖼). Nothing is saved until the user confirms on the card.

type WalletChoice = "shared" | "personal";
type CardStatus = "idle" | "busy" | "done" | "error";

const CARD = "mt-2 w-full max-w-md rounded-[18px] border border-[#e5dcd0] bg-white p-4 shadow-2xs text-xs sm:text-sm text-[#2a2b2f]";
const BUTTON =
  "inline-flex items-center justify-center gap-1.5 h-9 px-4 rounded-full bg-[#B4562A] hover:bg-[#9c4820] text-white font-semibold text-xs transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed";
const INPUT =
  "w-full rounded-[10px] border border-[#e5dcd0] bg-[#fefcf6] px-2.5 py-1.5 text-xs sm:text-sm text-[#2a2b2f] focus:outline-none focus:border-[#B4562A]";

function WalletPicker({
  value,
  onChange,
  disabled,
  partnerName,
}: {
  value: WalletChoice;
  onChange: (value: WalletChoice) => void;
  disabled?: boolean;
  partnerName: string;
}) {
  return (
    <div className="inline-flex p-0.5 rounded-full bg-[#f5eee1] text-[11px] font-semibold">
      {([
        ["shared", `Shared with ${partnerName}`],
        ["personal", "My personal"],
      ] as const).map(([key, label]) => (
        <button
          key={key}
          type="button"
          disabled={disabled}
          onClick={() => onChange(key)}
          className={`px-3 py-1 rounded-full transition-colors cursor-pointer ${
            value === key ? "bg-white text-[#B4562A] shadow-2xs" : "text-[#808988] hover:text-[#2a2b2f]"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function ResultLine({ status, text }: { status: CardStatus; text: string }) {
  if (!text || status === "idle" || status === "busy") return null;
  return (
    <p className={`mt-3 flex items-start gap-1.5 text-xs ${status === "error" ? "text-[#a34426]" : "text-[#2d5232]"}`}>
      <SolarIcon name={status === "error" ? "danger-triangle" : "check-circle"} size={14} className="shrink-0 mt-px" />
      <span>{text}</span>
    </p>
  );
}

// ---------------------------------------------------------------------------
// 📎 Bank statement preview
// ---------------------------------------------------------------------------

export function StatementPreviewCard({
  fileName,
  transactions,
  locale,
  partnerName,
  onImport,
}: {
  fileName: string;
  transactions: StatementTransaction[];
  locale: string;
  partnerName: string;
  onImport: (walletType: WalletChoice) => Promise<string>;
}) {
  const [wallet, setWallet] = useState<WalletChoice>("shared");
  const [status, setStatus] = useState<CardStatus>("idle");
  const [result, setResult] = useState("");

  const currency = transactions[0]?.currency || "IDR";
  const spent = transactions.filter((t) => t.type === "expense").reduce((sum, t) => sum + t.amount, 0);
  const received = transactions.filter((t) => t.type === "income").reduce((sum, t) => sum + t.amount, 0);
  const preview = transactions.slice(0, 5);

  const handleImport = async () => {
    setStatus("busy");
    try {
      setResult(await onImport(wallet));
      setStatus("done");
    } catch (error) {
      setResult(error instanceof Error && error.message ? error.message : "Import failed. Please try again.");
      setStatus("error");
    }
  };

  return (
    <div className={CARD}>
      <div className="flex items-center gap-2 font-semibold text-[#B4562A]">
        <SolarIcon name="paperclip" size={16} />
        <span className="truncate">{fileName}</span>
      </div>
      <p className="mt-1 text-[#515151]">
        {transactions.length} transaction{transactions.length === 1 ? "" : "s"} found · spent{" "}
        <strong>{formatMoney(spent, currency, locale)}</strong>
        {received > 0 && (
          <>
            {" "}· received <strong>{formatMoney(received, currency, locale)}</strong>
          </>
        )}
      </p>

      <ul className="mt-3 divide-y divide-[#f0ebe3]">
        {preview.map((t, i) => (
          <li key={`${t.date}-${i}`} className="py-1.5 flex items-center justify-between gap-3">
            <span className="min-w-0">
              <span className="block truncate">{t.title}</span>
              <span className="text-[10px] text-[#808988]">
                {t.date} · {t.category}
              </span>
            </span>
            <span className={`shrink-0 font-semibold ${t.type === "income" ? "text-[#2d5232]" : ""}`}>
              {t.type === "income" ? "+" : "−"}
              {formatMoney(t.amount, t.currency || currency, locale)}
            </span>
          </li>
        ))}
      </ul>
      {transactions.length > preview.length && (
        <p className="text-[11px] text-[#808988] mt-1">+{transactions.length - preview.length} more</p>
      )}

      {status !== "done" && (
        <div className="mt-3 space-y-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] text-[#808988]">Import into</span>
            <WalletPicker value={wallet} onChange={setWallet} disabled={status === "busy"} partnerName={partnerName} />
          </div>
          <button type="button" className={BUTTON} disabled={status === "busy"} onClick={() => void handleImport()}>
            {status === "busy" ? "Importing…" : `Import ${transactions.length} transaction${transactions.length === 1 ? "" : "s"}`}
          </button>
        </div>
      )}
      <ResultLine status={status} text={result} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 🖼 Receipt photo draft
// ---------------------------------------------------------------------------

const EXPENSE_CATEGORIES: ScannedReceipt["category"][] = [
  "Food & Drinks",
  "Shopping",
  "Bills",
  "Transportation",
  "Health",
  "Social",
  "Others",
];

export interface ReceiptConfirmation {
  title: string;
  amount: number;
  currency: string;
  category: ScannedReceipt["category"];
  wallet: WalletChoice;
  date: string | null;
}

export function ReceiptDraftCard({
  receipt,
  fallbackCurrency,
  partnerName,
  onRecord,
}: {
  receipt: ScannedReceipt;
  fallbackCurrency: string;
  partnerName: string;
  onRecord: (draft: ReceiptConfirmation) => Promise<string>;
}) {
  const currency = receipt.currency || fallbackCurrency;
  const [title, setTitle] = useState(receipt.merchant ?? "");
  const [amount, setAmount] = useState(receipt.total !== null ? String(receipt.total) : "");
  const [category, setCategory] = useState<ScannedReceipt["category"]>(receipt.category);
  const [wallet, setWallet] = useState<WalletChoice>("shared");
  const [status, setStatus] = useState<CardStatus>("idle");
  const [result, setResult] = useState("");

  const parsedAmount = Number(amount);
  const valid = title.trim().length > 0 && Number.isFinite(parsedAmount) && parsedAmount > 0;
  const locked = status === "busy" || status === "done";

  const handleRecord = async () => {
    if (!valid) return;
    setStatus("busy");
    try {
      setResult(
        await onRecord({
          title: title.trim(),
          amount: parsedAmount,
          currency,
          category,
          wallet,
          date: receipt.date,
        })
      );
      setStatus("done");
    } catch (error) {
      setResult(error instanceof Error && error.message ? error.message : "Couldn't record this expense. Please try again.");
      setStatus("error");
    }
  };

  return (
    <div className={CARD}>
      <div className="flex items-center gap-2 font-semibold text-[#B4562A]">
        <SolarIcon name="receipt" size={16} />
        <span>Receipt draft</span>
        {receipt.date && <span className="ml-auto text-[11px] font-normal text-[#808988]">{receipt.date}</span>}
      </div>
      <p className="mt-1 text-[11px] text-[#808988]">Check the details, then record it. Nothing is saved until you confirm.</p>

      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <label className="space-y-1 sm:col-span-2">
          <span className="text-[11px] text-[#808988]">Merchant</span>
          <input className={INPUT} value={title} maxLength={80} disabled={locked} onChange={(e) => setTitle(e.target.value)} placeholder="Where did you buy it?" />
        </label>
        <label className="space-y-1">
          <span className="text-[11px] text-[#808988]">Total ({currency})</span>
          <input
            className={INPUT}
            type="number"
            min={0}
            step="any"
            inputMode="decimal"
            value={amount}
            disabled={locked}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>
        <label className="space-y-1">
          <span className="text-[11px] text-[#808988]">Category</span>
          <select className={INPUT} value={category} disabled={locked} onChange={(e) => setCategory(e.target.value as ScannedReceipt["category"])}>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      </div>

      {status !== "done" && (
        <div className="mt-3 space-y-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] text-[#808988]">Paid from</span>
            <WalletPicker value={wallet} onChange={setWallet} disabled={locked} partnerName={partnerName} />
          </div>
          <button type="button" className={BUTTON} disabled={!valid || locked} onClick={() => void handleRecord()}>
            {status === "busy" ? "Recording…" : "Record expense"}
          </button>
        </div>
      )}
      <ResultLine status={status} text={result} />
    </div>
  );
}

