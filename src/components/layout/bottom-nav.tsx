"use client";

import React from "react";
import { SolarIcon } from "@/components/icons/solar";
import { SeiyaIcon } from "@/components/icons/seiya-logo";
import { NavTab } from "./sidebar";

interface BottomNavProps {
  currentTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  onOpenProfile: () => void;
}

export function BottomNav({ currentTab, onTabChange, onOpenProfile }: BottomNavProps) {
  return (
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

        {/* Activity */}
        <button
          onClick={() => onTabChange("activity")}
          className={`flex-1 min-h-[44px] flex flex-col items-center justify-center gap-1 transition-all cursor-pointer active:scale-95 ${
            currentTab === "activity" ? "text-[#B45529]" : "text-[#808988] hover:text-[#2a2b2f]"
          }`}
          aria-label="Activity"
        >
          <SolarIcon name="calendar" size={20} variant="bold" />
          <span className="text-[10px] font-semibold tracking-tight">Activity</span>
        </button>

        {/* Profile (Includes Couple Contract) */}
        <button
          onClick={() => onTabChange("profile")}
          className={`flex-1 min-h-[44px] flex flex-col items-center justify-center gap-1 transition-all cursor-pointer active:scale-95 ${
            currentTab === "profile" ? "text-[#B45529]" : "text-[#808988] hover:text-[#2a2b2f]"
          }`}
          aria-label="Profile and Couple Contract"
        >
          <SolarIcon name="user" size={20} variant="bold" />
          <span className="text-[10px] font-semibold tracking-tight">Profile</span>
        </button>
      </nav>
    </div>
  );
}
