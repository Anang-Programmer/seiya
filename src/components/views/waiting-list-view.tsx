"use client";

import React from "react";
import { formatMoney } from "@/lib/utils";
import { SolarIcon } from "@/components/icons/solar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useApp } from "@/lib/store";
import { PageHeader } from "@/components/ui/page-header";

export function WaitingListView() {
  const { heldPurchases, continueHeldPurchase, cancelHeldPurchase, reportingCurrency, locale, partnerAName, partnerBName } = useApp();

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

              return (
                <div
                  key={item.id}
                  className="p-5 sm:p-6 rounded-[12px] bg-[#f5eee1] shadow-xs space-y-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="text-sm font-serif font-normal text-[#2a2b2f] text-sm">{item.title}</h4>
                        <Badge variant="hold">HOLD</Badge>
                      </div>
                      <span className="text-xs text-[#515151]">
                        Requested by <strong>{requesterDisplayName}</strong> • Wallet: {item.wallet.replace("_", " ")}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-lg font-extrabold font-mono text-[#2a2b2f] block">
                        {formatMoney(item.amount, itemCurrency, locale)}
                      </span>
                      <span className="text-[11px] text-[#C98A4F] font-semibold block font-mono">
                        Held until: {item.holdUntil}
                      </span>
                    </div>
                  </div>

                  <div className="p-3.5 bg-[#fef9ef] rounded-[12px] text-xs text-[#515151]">
                    <span className="font-semibold text-[#2a2b2f] block text-[11px] mb-0.5 font-mono">
                      Triggered Rule:
                    </span>
                    <p>{item.reason}</p>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                    <span className="text-[11px] text-[#808988]">
                      Rerunning checks validates threshold & approval status.
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
                        className="text-xs"
                      >
                        Continue Anyway (Rerun Gateway)
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
