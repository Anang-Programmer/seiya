"use client";

import React, { useEffect, useState } from "react";
import { formatMoney, formatMoneyConverted } from "@/lib/utils";
import { SolarIcon } from "@/components/icons/solar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useApp } from "@/lib/store";
import { PageHeader } from "@/components/ui/page-header";

/** "07:59:12" until the hold ends; null once it has ended (or has no end time). */
function remainingText(holdUntilAt: string | undefined, now: number): string | null {
  const end = holdUntilAt ? new Date(holdUntilAt).getTime() : NaN;
  if (Number.isNaN(end) || end <= now) return null;
  const total = Math.ceil((end - now) / 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
}

export function WaitingListView() {
  const { heldPurchases, continueHeldPurchase, cancelHeldPurchase, reportingCurrency, locale, partnerAName, partnerBName } = useApp();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-16">

      {/* Explanatory Box */}
      <div className="p-5 rounded-[12px] bg-[#fcf5e8] shadow-xs text-xs text-[#C98A4F] space-y-1.5">
        <div className="flex items-center gap-2 font-bold">
          <SolarIcon name="shield-check" size={16} className="text-[#C98A4F]" />
          <span>Non-Judgmental Safeguard Principle</span>
        </div>
        <p className="leading-relaxed opacity-90 text-[11px]">
          Seiya does not assume emotional impulsiveness. The cooling-off period simply gives both partners time to reflect on high-value promotional items. Choosing to continue reruns all Dual-Key Gateway contract checks.
        </p>
      </div>

      {/* Held items list */}
      <div className="space-y-3.5">
        {heldPurchases.filter((h) => h.status === "held").length === 0 ? (
          <div className="text-center py-12 bg-[#f5eee1] rounded-[12px] shadow-xs p-8 space-y-2">
            <div className="w-12 h-12 rounded-full bg-[#fef9ef] text-[#808988] flex items-center justify-center mx-auto">
              <SolarIcon name="check-circle" size={24} />
            </div>
            <h4 className="text-sm font-serif font-normal text-[#2a2b2f]">Waiting List is empty</h4>
            <p className="text-xs text-[#515151] max-w-sm mx-auto">
              No purchases are currently on cooling-off hold.
            </p>
          </div>
        ) : (
          heldPurchases
            .filter((h) => h.status === "held")
            .map((item) => {
              const requesterDisplayName = item.requester === "partner_a" ? partnerAName : partnerBName;
              const itemCurrency = item.currency || reportingCurrency;
              const remaining = remainingText(item.holdUntilAt, now);

              return (
                <div
                  key={item.id}
                  className="p-5 sm:p-6 rounded-[12px] bg-[#f5eee1] shadow-xs space-y-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <h4 className="text-base sm:text-lg font-medium font-serif text-[#2a2b2f] leading-snug">{item.title}</h4>
                        <Badge variant="hold" className="text-xs font-semibold px-2.5 py-0.5">HOLD</Badge>
                      </div>
                      <span className="text-xs sm:text-[13px] text-[#515151] block">
                        Requested by <strong className="text-[#2a2b2f]">{requesterDisplayName}</strong> • Wallet: {item.wallet.replace("_", " ")}
                      </span>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-xl sm:text-2xl font-bold font-serif text-[#2a2b2f] block leading-none">
                        {formatMoney(item.amount, itemCurrency, locale)}
                      </span>
                      {itemCurrency !== reportingCurrency && (
                        <span className="text-xs sm:text-[13px] font-serif text-[#808988] block mt-1">
                          ≈ {formatMoneyConverted(item.amount, itemCurrency, reportingCurrency, locale)}
                        </span>
                      )}
                      <span className="text-xs text-[#C98A4F] font-semibold block font-mono mt-1">
                        Held until: {item.holdUntil}
                      </span>
                      {remaining && (
                        <span className="text-xs text-[#515151] block font-mono mt-0.5" aria-live="off">
                          Unlocks in {remaining}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="p-4 bg-[#fef9ef] rounded-[12px] text-xs sm:text-sm text-[#333333] border border-[#d1c9bf]/30 space-y-1">
                    <span className="font-semibold text-[#2a2b2f] block text-xs font-mono">
                      Triggered Rule:
                    </span>
                    <p className="leading-relaxed">{item.reason}</p>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                    <span className="text-[11px] text-[#808988]">
                      {remaining
                        ? "You can continue once the cooling-off period ends."
                        : "Continuing reruns the threshold and approval checks."}
                    </span>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => cancelHeldPurchase(item.id)}
                        className="text-xs"
                      >
                        Cancel Purchase
                      </Button>
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => continueHeldPurchase(item.id)}
                        disabled={Boolean(remaining)}
                        className="text-xs"
                      >
                        {remaining ? `Locked · ${remaining}` : "Continue Purchase"}
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })
        )}
      </div>
    </div>
  );
}
