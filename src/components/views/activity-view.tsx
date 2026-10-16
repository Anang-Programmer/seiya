"use client";

import React, { useState } from "react";
import { formatMoney } from "@/lib/utils";
import { SolarIcon } from "@/components/icons/solar";
import { Badge } from "@/components/ui/badge";
import { useApp } from "@/lib/store";

export function ActivityView() {
  const { activities, reportingCurrency, locale, partnerAName, partnerBName } = useApp();
  const [filterActor, setFilterActor] = useState<"all" | "partner_a" | "partner_b" | "seiya">("all");
  const [filterStatus, setFilterStatus] = useState<"all" | "ALLOW" | "NEED_APPROVAL" | "HOLD" | "DENY">("all");

  const filtered = activities.filter((act) => {
    if (filterActor !== "all" && act.actor !== filterActor) return false;
    if (filterStatus !== "all" && act.status !== filterStatus) return false;
    return true;
  });

  return (
    <div className="space-y-4 sm:space-y-6 max-w-4xl mx-auto pb-20">
      {/* Mobile-first Filter controls with smooth horizontal swipe */}
      <div className="p-3 sm:p-4 bg-[#f8f3eb] rounded-[18px] border border-[#e8dfd5] shadow-xs space-y-2.5">
        {/* Row 1: Actor Filter */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#808988] w-14 shrink-0">
            Actor
          </span>
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar scroll-smooth py-0.5 flex-1">
            {[
              { id: "all", label: "All" },
              { id: "partner_a", label: `${partnerAName} (You)` },
              { id: "partner_b", label: partnerBName },
              { id: "seiya", label: "Seiya AI" },
            ].map((actor) => (
              <button
                key={actor.id}
                onClick={() => setFilterActor(actor.id as any)}
                className={`shrink-0 whitespace-nowrap px-3 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                  filterActor === actor.id
                    ? "bg-[#B45529] text-[#fef9ef] shadow-xs"
                    : "bg-white text-[#515151] hover:text-[#2a2b2f] hover:bg-[#f5eee1] border border-[#e8dfd5]"
                }`}
              >
                {actor.label}
              </button>
            ))}
          </div>
        </div>

        {/* Row 2: Outcome Status Filter */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#808988] w-14 shrink-0">
            Outcome
          </span>
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar scroll-smooth py-0.5 flex-1">
            {[
              { id: "all", label: "All", dot: null },
              { id: "ALLOW", label: "Approved", dot: "bg-emerald-600" },
              { id: "NEED_APPROVAL", label: "Needs Approval", dot: "bg-[#B45529]" },
              { id: "HOLD", label: "On Hold", dot: "bg-amber-600" },
              { id: "DENY", label: "Declined", dot: "bg-rose-600" },
            ].map((status) => (
              <button
                key={status.id}
                onClick={() => setFilterStatus(status.id as any)}
                className={`shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                  filterStatus === status.id
                    ? "bg-[#B45529] text-[#fef9ef] shadow-xs"
                    : "bg-white text-[#515151] hover:text-[#2a2b2f] hover:bg-[#f5eee1] border border-[#e8dfd5]"
                }`}
              >
                {status.dot && (
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      filterStatus === status.id ? "bg-white" : status.dot
                    }`}
                  />
                )}
                <span>{status.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Activity Timeline List */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="text-center py-12 p-6 rounded-[18px] bg-white border border-[#e8dfd5] text-xs text-[#515151] shadow-xs space-y-2">
            <div className="w-10 h-10 rounded-full bg-[#f5eee1] text-[#808988] flex items-center justify-center mx-auto">
              <SolarIcon name="info-circle" size={20} />
            </div>
            <p className="font-semibold text-sm text-[#2a2b2f]">No matching activities found</p>
            <p className="text-[#808988]">Try resetting your actor and outcome filters.</p>
            <button
              onClick={() => {
                setFilterActor("all");
                setFilterStatus("all");
              }}
              className="mt-2 text-xs font-semibold text-[#B45529] hover:underline cursor-pointer"
            >
              Reset filters
            </button>
          </div>
        ) : (
          filtered.map((item) => {
            const isPartnerA = item.actor === "partner_a";
            const isPartnerB = item.actor === "partner_b";
            const actorName = isPartnerA ? partnerAName : isPartnerB ? partnerBName : "Seiya AI";
            const itemCurrency = item.currency || reportingCurrency;

            return (
              <div
                key={item.id}
                className="p-4 sm:p-5 rounded-[18px] bg-white border border-[#e8dfd5] shadow-[0_2px_10px_-2px_rgba(42,43,47,0.05)] hover:shadow-[0_4px_16px_-4px_rgba(42,43,47,0.08)] transition-all space-y-3"
              >
                {/* Header: Actor info & timestamp */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    {isPartnerA ? (
                      <img
                        src="/dashboard/Profile-Card-Man.png"
                        alt={actorName}
                        className="w-8 h-8 rounded-full object-cover border border-[#ecd9c7] shadow-2xs shrink-0"
                      />
                    ) : isPartnerB ? (
                      <img
                        src="/dashboard/Profile-Card-Women.png"
                        alt={actorName}
                        className="w-8 h-8 rounded-full object-cover border border-[#ecd9c7] shadow-2xs shrink-0"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-[#2a2b2f] text-[#fef9ef] flex items-center justify-center shrink-0 shadow-2xs">
                        <SolarIcon name="sparkles" size={15} className="text-[#e8a58c]" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <span className="text-xs font-bold text-[#2a2b2f] block truncate">
                        {actorName}
                      </span>
                      <span className="text-[10px] text-[#808988] block -mt-0.5">
                        {isPartnerA ? "Primary Key" : isPartnerB ? "Partner Key" : "AI Copilot"}
                      </span>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="text-[11px] font-mono text-[#808988] block">
                      {item.timestamp}
                    </span>
                    <span className="text-[10px] text-[#a3abaa] block">
                      {item.timeAgo}
                    </span>
                  </div>
                </div>

                {/* Event Title & Status Badge */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1 border-t border-[#f5eee1]">
                  <h4 className="text-sm font-bold text-[#2a2b2f] leading-snug">
                    {item.title}
                  </h4>
                  <Badge
                    variant={
                      item.status === "ALLOW"
                        ? "allow"
                        : item.status === "NEED_APPROVAL"
                        ? "need_approval"
                        : item.status === "HOLD"
                        ? "hold"
                        : item.status === "DENY"
                        ? "deny"
                        : "neutral"
                    }
                    className="self-start sm:self-auto shrink-0"
                  >
                    {item.status === "ALLOW"
                      ? "Approved"
                      : item.status === "NEED_APPROVAL"
                      ? "Needs Approval"
                      : item.status === "HOLD"
                      ? "On Hold"
                      : item.status === "DENY"
                      ? "Declined"
                      : item.status}
                  </Badge>
                </div>

                {/* Reason Description */}
                <p className="text-xs text-[#515151] leading-relaxed bg-[#fcf8f2] rounded-[12px] p-2.5 sm:p-3 border border-[#e8dfd5]/60">
                  {item.reason}
                </p>

                {/* Footer: Category & Amount */}
                <div className="flex items-center justify-between gap-3 text-xs pt-0.5">
                  <span className="text-[11px] font-semibold text-[#808988] bg-[#f5eee1] px-2.5 py-1 rounded-full border border-[#d1c9bf]/40">
                    {item.category}
                  </span>
                  {item.amount && (
                    <div className="text-right">
                      <span className="text-xs text-[#808988] font-normal mr-1.5">Amount:</span>
                      <span className="font-bold text-sm text-[#2a2b2f] font-mono">
                        {formatMoney(item.amount, itemCurrency, locale)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
