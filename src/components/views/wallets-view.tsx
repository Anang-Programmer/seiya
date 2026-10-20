"use client";

import React, { useState } from "react";
import { formatMoney, formatMoneyConverted, getTransactionCategoryVisual } from "@/lib/utils";
import { SolarIcon } from "@/components/icons/solar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useApp, Transaction } from "@/lib/store";
import { PageHeader } from "@/components/ui/page-header";
import { TransactionDetailDialog } from "@/components/modals/transaction-detail-dialog";

export function WalletsView() {
  const {
    currentUser,
    wallets,
    convertedBalances,
    reportingCurrency,
    locale,
    transactions,
    settlement,
    settleUp,
    partnerAName,
    partnerBName,
    partnerProfile,
  } = useApp();

  const [selectedWalletTab, setSelectedWalletTab] = useState<"shared" | "personal" | "partner">("shared");
  // Settling clears the balance for both partners, so it takes a second, explicit click.
  const [confirmSettle, setConfirmSettle] = useState(false);
  const [isSettling, setIsSettling] = useState(false);
  const settlementCurrency = settlement.currency || wallets.shared.currency;
  const owedAmount = Math.max(settlement.partnerBOwesA, settlement.partnerAOwesB);
  const debtorName = settlement.partnerBOwesA > 0 ? partnerBName : partnerAName;
  const creditorName = settlement.partnerBOwesA > 0 ? partnerAName : partnerBName;
  const handleSettleUp = async () => {
    setIsSettling(true);
    await settleUp();
    setIsSettling(false);
    setConfirmSettle(false);
  };
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [transactionModalOpen, setTransactionModalOpen] = useState(false);

  const isPartnerA = currentUser === "partner_a";
  const myName = isPartnerA ? partnerAName : partnerBName;
  const partnerName = isPartnerA ? partnerBName : partnerAName;
  // Before the partner joins the name is the placeholder "your partner".
  const partnerLabel = partnerName.charAt(0).toUpperCase() + partnerName.slice(1);

  const myWallet = isPartnerA ? wallets.personalA : wallets.personalB;
  const myConverted = isPartnerA ? convertedBalances.personalA : convertedBalances.personalB;
  // Balances follow the currency picked in the header (like the dashboard);
  // the wallet's own amount is shown underneath.
  const shownIn = (walletCurrency: string, rateAvailable: boolean) =>
    walletCurrency !== reportingCurrency && rateAvailable ? reportingCurrency : walletCurrency;

  // Filter transactions for shared vs personal
  const sharedTransactions = transactions.filter((t) => t.wallet === "shared");
  const myPersonalTransactions = transactions.filter(
    (t) => t.wallet === (isPartnerA ? "personal_a" : "personal_b")
  );

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-16">

      {/* 1. SETTLEMENT CARD: Who owes whom (12px, borderless) */}
      <div className="p-5 sm:p-6 rounded-[12px] bg-[#f5eee1] shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="p-3 rounded-full bg-[#fef9ef] text-[#B45529] shrink-0">
            <SolarIcon name="users-group-rounded" size={24} />
          </div>
          <div>
            <span className="text-xs font-bold text-[#808988] uppercase tracking-wider block font-mono">
              Couple Settlement Balance
            </span>
            {settlement.partnerBOwesA > 0 ? (
              <div className="text-lg font-bold text-[#2a2b2f]">
                {partnerBName} owes {partnerAName}{" "}
                <span className="text-[#B45529] font-serif">
                  {formatMoney(settlement.partnerBOwesA, settlementCurrency, locale)}
                </span>
                {settlementCurrency !== reportingCurrency && (
                  <span className="text-xs text-[#808988] font-serif block">
                    ≈ {formatMoneyConverted(settlement.partnerBOwesA, settlementCurrency, reportingCurrency, locale)}
                  </span>
                )}
              </div>
            ) : settlement.partnerAOwesB > 0 ? (
              <div className="text-lg font-bold text-[#2a2b2f]">
                {partnerAName} owes {partnerBName}{" "}
                <span className="text-[#B45529] font-serif">
                  {formatMoney(settlement.partnerAOwesB, settlementCurrency, locale)}
                </span>
                {settlementCurrency !== reportingCurrency && (
                  <span className="text-xs text-[#808988] font-serif block">
                    ≈ {formatMoneyConverted(settlement.partnerAOwesB, settlementCurrency, reportingCurrency, locale)}
                  </span>
                )}
              </div>
            ) : (
              <div className="text-lg font-bold text-[#2d5232]">
                All settled up! No outstanding balances.
              </div>
            )}
            <p className="text-[11px] text-[#515151] mt-0.5">
              Automatically calculated from shared expense split. Simulated ledger settlement only.
            </p>
          </div>
        </div>

        {owedAmount > 0 && !confirmSettle && (
          <Button variant="primary" size="sm" onClick={() => setConfirmSettle(true)} className="shrink-0 text-xs">
            <SolarIcon name="check" size={14} />
            Settle Up Now
          </Button>
        )}
        {owedAmount > 0 && confirmSettle && (
          <div role="alertdialog" aria-label="Confirm settlement" className="w-full sm:w-auto sm:max-w-xs p-3 rounded-[12px] bg-[#fef9ef] border border-[#B45529]/30 space-y-2">
            <p className="text-xs text-[#2a2b2f] leading-snug">
              Mark {formatMoney(owedAmount, settlementCurrency, locale)} from {debtorName} to {creditorName} as paid?
              Only do this after the money has actually been transferred.
            </p>
            <div className="flex items-center justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setConfirmSettle(false)} disabled={isSettling} className="text-xs">
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={handleSettleUp} disabled={isSettling} className="text-xs">
                {isSettling ? "Settling..." : "Yes, it's paid"}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* 2. THREE WALLETS SELECTOR CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
        {/* Shared Wallet */}
        <div
          onClick={() => setSelectedWalletTab("shared")}
          className={`p-5 sm:p-6 rounded-[24px] cursor-pointer transition-all border ${
            selectedWalletTab === "shared"
              ? "ring-2 ring-[#B45529] border-[#e8baa3] shadow-md scale-[1.01]"
              : "border-[#e8baa3]/70 hover:opacity-95 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_4px_16px_-4px_rgba(180,85,41,0.08)]"
          }`}
          style={{
            background: "linear-gradient(145deg, #fdf4ee 0%, #f9ded0 55%, #f4cdbb 100%)",
          }}
        >
          <div className="flex justify-between items-center mb-3.5">
            <div className="flex items-center gap-2.5">
              <img
                src="/dashboard/Profile-Card-Shared.webp"
                alt="Shared pool avatar"
                className="w-9 h-9 sm:w-10 sm:h-10 rounded-full object-cover shrink-0 shadow-2xs border border-[#ecd9c7]"
              />
              <span className="text-xs sm:text-[13px] font-semibold text-[#5e2714] tracking-tight">{wallets.shared.label}</span>
            </div>
            <span className="text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-[#fef9ef]/95 text-[#8f3916] border border-[#e8baa3]/80 shadow-2xs">
              {shownIn(wallets.shared.currency, convertedBalances.shared.available)}
            </span>
          </div>
          <div className="text-2xl font-extrabold text-[#2a2b2f] font-serif">
            {shownIn(wallets.shared.currency, convertedBalances.shared.available) === wallets.shared.currency
              ? formatMoney(wallets.shared.balance, wallets.shared.currency, locale)
              : formatMoney(convertedBalances.shared.amount, reportingCurrency, locale)}
          </div>
          {wallets.shared.currency !== reportingCurrency && (
            <p className="text-[11px] text-[#6b3522] mt-1">
              {formatMoney(wallets.shared.balance, wallets.shared.currency, locale)} in wallet · estimated rate
            </p>
          )}
          <p className="text-[11px] text-[#8c5745] mt-1.5">
            Joint household funds • Dual-Key protected
          </p>
        </div>

        {/* My Personal Wallet */}
        <div
          onClick={() => setSelectedWalletTab("personal")}
          className={`p-5 sm:p-6 rounded-[24px] cursor-pointer transition-all border ${
            selectedWalletTab === "personal"
              ? "ring-2 ring-[#B45529] border-[#e5d0ad] shadow-md scale-[1.01]"
              : "border-[#e5d0ad]/70 hover:opacity-95 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_4px_16px_-4px_rgba(180,85,41,0.06)]"
          }`}
          style={{
            background: "linear-gradient(145deg, #fefbf4 0%, #f7e8ce 55%, #f0dcb8 100%)",
          }}
        >
          <div className="flex justify-between items-center mb-3.5">
            <div className="flex items-center gap-2.5">
              <img
                src={isPartnerA ? "/dashboard/Profile-Card-Man.webp" : "/dashboard/Profile-Card-Women.webp"}
                alt="Your avatar"
                style={{ transform: !isPartnerA ? "scaleX(-1)" : "none" }}
                className="w-9 h-9 sm:w-10 sm:h-10 rounded-full object-cover shrink-0 shadow-2xs border border-[#ecd9c7] transition-transform duration-300"
              />
              <span className="text-xs sm:text-[13px] font-semibold text-[#5a3e1d] tracking-tight">
                Your Balance ({myName})
              </span>
            </div>
            <span className="text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-[#fef9ef]/95 text-[#734a1a] border border-[#e5d0ad]/80 shadow-2xs">
              {shownIn(myWallet.currency, myConverted.available)}
            </span>
          </div>
          <div className="text-2xl font-extrabold text-[#2a2b2f] font-serif">
            {shownIn(myWallet.currency, myConverted.available) === myWallet.currency
              ? formatMoney(myWallet.balance, myWallet.currency, locale)
              : formatMoney(myConverted.amount, reportingCurrency, locale)}
          </div>
          {myWallet.currency !== reportingCurrency && (
            <p className="text-[11px] text-[#634a2e] mt-1">
              {formatMoney(myWallet.balance, myWallet.currency, locale)} in wallet · estimated rate
            </p>
          )}
          <p className="text-[11px] text-[#8a7259] mt-1.5">
            Full itemized records visible to you
          </p>
        </div>

        {/* Partner Personal Wallet (TOTAL ONLY) */}
        <div
          onClick={() => setSelectedWalletTab("partner")}
          className={`p-5 sm:p-6 rounded-[24px] cursor-pointer transition-all border ${
            selectedWalletTab === "partner"
              ? "ring-2 ring-[#B45529] border-[#bcd7be] shadow-md scale-[1.01]"
              : "border-[#bcd7be]/70 hover:opacity-95 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_4px_16px_-4px_rgba(45,82,50,0.06)]"
          }`}
          style={{
            background: "linear-gradient(145deg, #f4f8f4 0%, #dceddd 55%, #cde1ce 100%)",
          }}
        >
          <div className="flex justify-between items-center mb-3.5">
            <div className="flex items-center gap-2.5">
              <img
                src={isPartnerA ? "/dashboard/Profile-Card-Women.webp" : "/dashboard/Profile-Card-Man.webp"}
                alt="Partner avatar"
                style={{ transform: !isPartnerA ? "scaleX(-1)" : "none" }}
                className="w-9 h-9 sm:w-10 sm:h-10 rounded-full object-cover shrink-0 shadow-2xs border border-[#ecd9c7] transition-transform duration-300"
              />
              <span className="text-xs sm:text-[13px] font-semibold text-[#27472c] tracking-tight">
                {partnerProfile ? `${partnerLabel}’s balance` : "Partner balance"}
              </span>
            </div>
            <Badge variant="deny" aria-label="Private wallet">
              <SolarIcon name="lock-keyhole" size={11} />
            </Badge>
          </div>
          <div className="text-2xl font-extrabold text-[#808988] font-serif inline-flex items-center gap-2">
            <SolarIcon name="lock-keyhole" size={20} />
            Private
          </div>
          {/* The partner’s personal wallet is never sent to this browser (RLS). */}
          <p className="text-[11px] text-[#59785e] mt-1.5">
            {partnerProfile ? "Balance and purchases stay private to them" : "Waiting for your partner to join"}
          </p>
        </div>
      </div>

      {/* 3. TRANSACTION DETAILS FOR SELECTED TAB (12px, borderless) */}
      <div className="bg-[#f5eee1] rounded-[12px] shadow-sm p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between pb-3.5">
          <div>
            <h3 className="text-base font-serif font-normal text-[#2a2b2f] capitalize">
              {selectedWalletTab === "shared"
                ? "Shared Wallet Transactions"
                : selectedWalletTab === "personal"
                ? "Your Personal Wallet Transactions"
                : `${partnerLabel}’s wallet`}
            </h3>
            <p className="text-xs text-[#515151]">
              {selectedWalletTab === "partner"
                ? "Personal purchases stay private. You see only the total, and your partner sees only yours."
                : "Synchronized with Dual-Key Gateway."}
            </p>
          </div>
        </div>

        {selectedWalletTab === "partner" ? (
          /* PRIVACY ENFORCEMENT DISPLAY */
          <div className="py-12 text-center space-y-3 bg-[#fef9ef] rounded-[12px] shadow-xs p-6">
            <div className="w-14 h-14 rounded-full bg-[#fbf0eb] text-[#B45529] flex items-center justify-center mx-auto">
              <SolarIcon name="lock-keyhole" size={26} />
            </div>
            <h4 className="text-base font-serif font-normal text-[#2a2b2f]">
              {partnerLabel}’s transactions are private
            </h4>
            <p className="text-xs text-[#515151] max-w-md mx-auto leading-relaxed">
              Their personal balance and purchases are visible only to them, and the same rule protects your
              personal wallet. Spending from the shared wallet is visible to both of you.
            </p>
            <div className="pt-2">
              <span className="inline-flex items-center gap-1.5 text-[11px] text-[#2d5232] bg-[#edf3ec] px-3.5 py-1 rounded-full">
                <SolarIcon name="shield-check" size={12} />
                Protected by Seiya’s privacy rules
              </span>
            </div>
          </div>
        ) : (
          /* NORMAL TRANSACTION LIST */
          <div className="space-y-1">
            {(selectedWalletTab === "shared" ? sharedTransactions : myPersonalTransactions).map((tx) => {
              const visual = getTransactionCategoryVisual(tx.category, tx.title);
              return (
                <div
                  key={tx.id}
                  onClick={() => {
                    setSelectedTransaction(tx);
                    setTransactionModalOpen(true);
                  }}
                  className="p-3.5 rounded-[12px] hover:bg-[#ece3d3]/70 transition-colors flex items-center justify-between cursor-pointer group"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${visual.bgClass} ${visual.textClass} group-hover:scale-105 transition-transform shadow-2xs`}>
                      <SolarIcon name={visual.iconName} size={16} />
                    </div>
                    <div>
                      <h4 className="text-xs sm:text-sm font-semibold text-[#2a2b2f] group-hover:text-[#B45529] transition-colors">{tx.title}</h4>
                      <span className="text-[11px] text-[#808988]">
                        {tx.date} • Paid by {tx.paidBy === "partner_a" ? partnerAName : partnerBName}
                      </span>
                    </div>
                  </div>
                  <div className="text-right flex items-center gap-2">
                    <div className="text-right">
                      <div
                        className={`text-xs sm:text-sm font-bold font-serif ${
                          tx.amount > 0 ? "text-[#2d5232]" : "text-[#2a2b2f]"
                        }`}
                      >
                        {formatMoney(tx.amount, tx.currency || "USD", locale)}
                      </div>
                      {(tx.currency || "USD") !== reportingCurrency && (
                        <span className="text-[10px] text-[#808988] font-serif block">
                          ≈ {formatMoneyConverted(tx.amount, tx.currency || "USD", reportingCurrency, locale)}
                        </span>
                      )}
                    </div>
                    <SolarIcon
                      name="arrow-right"
                      size={14}
                      className="text-[#808988] opacity-40 group-hover:opacity-100 group-hover:text-[#B45529] transition-all shrink-0"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Transaction Detail Dialog */}
      <TransactionDetailDialog
        transaction={selectedTransaction}
        open={transactionModalOpen}
        onOpenChange={setTransactionModalOpen}
      />
    </div>
  );
}
