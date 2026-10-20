"use client";

import React, { useState } from "react";
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SolarIcon } from "@/components/icons/solar";
import { useApp, AddMoneyWallet } from "@/lib/store";
import { parseAmount } from "@/lib/receipt-text";
// The amount being added is acted on, so it stays visible in privacy mode.
import { formatMoneyAlways as formatMoney } from "@/lib/utils";

const NOTE_SUGGESTIONS = ["Salary", "Starting balance", "Bonus", "Savings transfer"];

// Records money coming in: a salary, a top-up or the starting balance. Wallets
// are simulated, so this is how a couple tells Seiya what they have.
export function AddMoneyDialog() {
  const { addMoneyRequest, closeAddMoney } = useApp();
  return (
    <Dialog open={Boolean(addMoneyRequest)} onOpenChange={(next) => !next && closeAddMoney()} className="max-w-md">
      {/* Keyed per opening, so the form starts empty every time. */}
      {addMoneyRequest && <AddMoneyForm key={addMoneyRequest.id} initialWallet={addMoneyRequest.wallet} />}
    </Dialog>
  );
}

function AddMoneyForm({ initialWallet }: { initialWallet: AddMoneyWallet }) {
  const { closeAddMoney, addMoney, wallets, currentUser, locale } = useApp();
  const [wallet, setWallet] = useState<AddMoneyWallet>(initialWallet);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const myWallet = currentUser === "partner_a" ? wallets.personalA : wallets.personalB;
  const target = wallet === "shared" ? wallets.shared : myWallet;
  const parsed = parseAmount(amount) ?? 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (parsed <= 0) {
      setError("Enter how much money is coming in.");
      return;
    }
    setSaving(true);
    const ok = await addMoney(wallet, parsed, note);
    setSaving(false);
    if (ok) closeAddMoney();
  };

  const walletOption = (value: AddMoneyWallet, label: string, balance: number, currency: string) => (
    <button
      type="button"
      onClick={() => setWallet(value)}
      className={`flex-1 text-left p-3 rounded-[14px] border transition-colors cursor-pointer ${
        wallet === value ? "border-[#B45529] bg-[#faeade]" : "border-[#d1c9bf] bg-[#fef9ef] hover:bg-[#f5eee1]"
      }`}
    >
      <span className="block text-xs font-semibold text-[#2a2b2f]">{label}</span>
      <span className="block text-[11px] text-[#808988] mt-0.5">Now {formatMoney(balance, currency, locale)}</span>
    </button>
  );

  return (
    <>
      <DialogHeader onClose={closeAddMoney}>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-[#edf3ec] text-[#2d5232] flex items-center justify-center shrink-0">
            <SolarIcon name="wallet" size={18} />
          </div>
          <DialogTitle className="text-base font-serif font-normal text-[#2a2b2f]">Add money</DialogTitle>
        </div>
        <DialogDescription className="text-xs text-[#515151]">
          Record money coming in, like a salary or your starting balance. It is recorded as income on the wallet you pick.
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={handleSubmit}>
        <DialogContent className="pt-2 pb-4 space-y-4">
          <div className="space-y-1.5">
            <span className="text-xs font-semibold text-[#2a2b2f] block">Wallet</span>
            <div className="flex gap-2">
              {walletOption("shared", "Shared Wallet", wallets.shared.balance, wallets.shared.currency)}
              {walletOption("mine", "My wallet", myWallet.balance, myWallet.currency)}
            </div>
          </div>

          <label className="space-y-1.5 block">
            <span className="text-xs font-semibold text-[#2a2b2f] block">Amount ({target.currency})</span>
            <Input
              type="text"
              inputMode="decimal"
              value={amount}
              autoFocus
              onChange={(e) => {
                setAmount(e.target.value);
                setError("");
              }}
              placeholder={target.currency === "IDR" ? "e.g. 8.000.000" : "e.g. 1,500"}
              className="font-serif text-lg font-bold bg-[#fef9ef]"
            />
            {parsed > 0 && (
              <span className="text-[11px] text-[#2d5232] block">+ {formatMoney(parsed, target.currency, locale)}</span>
            )}
          </label>

          <label className="space-y-1.5 block">
            <span className="text-xs font-semibold text-[#2a2b2f] block">Note (optional)</span>
            <Input
              value={note}
              maxLength={120}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. October salary"
              className="bg-[#fef9ef]"
            />
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {NOTE_SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => setNote(suggestion)}
                  className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-[#f5eee1] text-[#515151] hover:bg-[#ece3d3] cursor-pointer"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </label>

          {error && <p className="text-xs text-[#a34426]">{error}</p>}
        </DialogContent>

        <DialogFooter className="pt-2 flex items-center justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={closeAddMoney} className="text-xs">
            Cancel
          </Button>
          <Button type="submit" variant="primary" size="sm" disabled={saving || parsed <= 0} className="text-xs">
            {saving ? "Adding…" : "Add money"}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
