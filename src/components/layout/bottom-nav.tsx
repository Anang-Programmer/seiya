"use client";

import React, { useEffect, useState } from "react";
import { SolarIcon, SolarIconName } from "@/components/icons/solar";
import { useApp } from "@/lib/store";
import { SeiyaIcon } from "@/components/icons/seiya-logo";
import { NavTab } from "./sidebar";

interface BottomNavProps {
  currentTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  onOpenProfile: () => void;
}

// Pages that live behind "More" on phones (the sidebar shows them on desktop).
const MORE_ITEMS: { tab: NavTab; label: string; icon: SolarIconName }[] = [
  { tab: "wallets", label: "Wallets", icon: "wallet" },
  { tab: "bills", label: "Bills", icon: "receipt" },
  { tab: "waiting_list", label: "Waiting List", icon: "clock-circle" },
  { tab: "activity", label: "Activity", icon: "calendar" },
  { tab: "profile", label: "Profile & Contract", icon: "user" },
];

export function BottomNav({ currentTab, onTabChange, onOpenProfile }: BottomNavProps) {
  const { approvals, currentUser, contractMeta } = useApp();
  const contractNeedsMe = contractMeta.pendingNeedsMyApproval;
  const [moreOpen, setMoreOpen] = useState(false);
  const waitingForMe = approvals.filter((a) => a.status === "pending" && a.approver === currentUser).length;
  const moreActive = MORE_ITEMS.some((item) => item.tab === currentTab);

  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMoreOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [moreOpen]);

  const openFromMore = (tab: NavTab) => {
    setMoreOpen(false);
    if (tab === "profile") onOpenProfile();
    // onOpenProfile opens the contract tab when a change waits for this person.
    else onTabChange(tab);
  };

  return (
    <>
      {moreOpen && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="More pages">
          <button type="button" className="absolute inset-0 bg-[#2a2b2f]/30 cursor-default" aria-label="Close menu" onClick={() => setMoreOpen(false)} />
          <div className="absolute left-3 right-3 bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))] rounded-[22px] bg-[#fefcf6] border border-[#d1c9bf]/60 shadow-[0_16px_40px_rgba(42,43,47,0.2)] p-2 animate-in fade-in-0 slide-in-from-bottom-2">
            {MORE_ITEMS.map((item) => (
              <button
                key={item.tab}
                type="button"
                onClick={() => openFromMore(item.tab)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-[14px] text-sm font-semibold text-left cursor-pointer transition-colors ${
                  currentTab === item.tab ? "bg-[#faeade] text-[#B45529]" : "text-[#2a2b2f] hover:bg-[#f5eee1]"
                }`}
              >
                <SolarIcon name={item.icon} size={18} className="text-[#B45529]" />
                {item.label}
                {item.tab === "profile" && contractNeedsMe && (
                  <span className="ml-auto text-[10px] font-bold text-white bg-[#d4380d] px-2 py-0.5 rounded-full">Contract to sign</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    <div className="fixed bottom-[calc(0.75rem+env(safe-area-inset-bottom,0px))] left-0 right-0 z-40 flex justify-center pointer-events-none md:hidden px-4">
      <nav className="pointer-events-auto bg-[#fefcf6]/95 backdrop-blur-xl px-5 py-2 flex items-center justify-between rounded-full shadow-[0_8px_28px_rgba(42,43,47,0.12)] border border-[#d1c9bf]/60 w-full max-w-sm sm:max-w-md">
        {/* Home */}
        <button
          onClick={() => onTabChange("home")}
          className={`flex-1 min-h-[44px] flex flex-col items-center justify-center gap-1 transition-all cursor-pointer active:scale-95 ${
            currentTab === "home" ? "text-[#B45529]" : "text-[#808988] hover:text-[#2a2b2f]"
          }`}
          aria-label="Home"
        >
          <SolarIcon name="home" size={20} variant="bold" />
          <span className="text-[10px] font-semibold tracking-tight">Home</span>
        </button>

        {/* Plan */}
        <button
          onClick={() => onTabChange("plan")}
          className={`flex-1 min-h-[44px] flex flex-col items-center justify-center gap-1 transition-all cursor-pointer active:scale-95 ${
            currentTab === "plan" || currentTab === "add_goal" || currentTab === "draft_goals"
              ? "text-[#B45529]"
              : "text-[#808988] hover:text-[#2a2b2f]"
          }`}
          aria-label="Plan"
        >
          <SolarIcon name="chart" size={20} variant="bold" />
          <span className="text-[10px] font-semibold tracking-tight">Plan</span>
        </button>

        {/* Central Seiya Mascot Star Action */}
        <div className="-mt-6 px-1 shrink-0">
          <button
            onClick={() => onTabChange("seiya")}
            className="w-13 h-13 flex items-center justify-center active:scale-90 hover:scale-110 transition-transform cursor-pointer drop-shadow-md"
            aria-label="Ask Seiya AI"
            title="Ask Seiya AI"
          >
            <SeiyaIcon size={44} />
          </button>
        </div>

        {/* Approvals (with the number waiting for this partner) */}
        <button
          onClick={() => onTabChange("approvals")}
          className={`relative flex-1 min-h-[44px] flex flex-col items-center justify-center gap-1 transition-all cursor-pointer active:scale-95 ${
            currentTab === "approvals" ? "text-[#B45529]" : "text-[#808988] hover:text-[#2a2b2f]"
          }`}
          aria-label={waitingForMe ? `Approvals, ${waitingForMe} waiting for you` : "Approvals"}
        >
          <span className="relative">
            <SolarIcon name="shield-check" size={20} variant="bold" />
            {waitingForMe > 0 && (
              <span className="absolute -top-1.5 -right-2.5 min-w-4 h-4 px-1 rounded-full bg-[#B45529] text-white text-[9px] font-bold flex items-center justify-center">
                {waitingForMe > 9 ? "9+" : waitingForMe}
              </span>
            )}
          </span>
          <span className="text-[10px] font-semibold tracking-tight">Approvals</span>
        </button>

        {/* More: Wallets, Bills, Waiting List, Activity, Profile */}
        <button
          onClick={() => setMoreOpen((open) => !open)}
          className={`flex-1 min-h-[44px] flex flex-col items-center justify-center gap-1 transition-all cursor-pointer active:scale-95 ${
            moreActive || moreOpen ? "text-[#B45529]" : "text-[#808988] hover:text-[#2a2b2f]"
          }`}
          aria-label={contractNeedsMe ? "More pages, a contract change needs your signature" : "More pages"}
          aria-expanded={moreOpen}
        >
          <span className="relative">
            <SolarIcon name="dots-menu" size={20} variant="bold" />
            {contractNeedsMe && (
              <span className="absolute -top-1 -right-1.5 w-2.5 h-2.5 rounded-full bg-[#d4380d] border-2 border-[#fefcf6]" aria-hidden="true" />
            )}
          </span>
          <span className="text-[10px] font-semibold tracking-tight">More</span>
        </button>
      </nav>
    </div>
    </>
  );
}
