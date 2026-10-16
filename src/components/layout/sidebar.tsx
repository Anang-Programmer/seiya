"use client";

import React, { useState } from "react";
import { SolarIcon, SolarIconName } from "@/components/icons/solar";
import { SeiyaLogo, SeiyaIcon } from "@/components/icons/seiya-logo";
import { useApp } from "@/lib/store";

export type NavTab =
  | "home"
  | "plan"
  | "add_goal"
  | "draft_goals"
  | "seiya"
  | "approvals"
  | "wallets"
  | "bills"
  | "waiting_list"
  | "activity"
  | "settings"
  | "profile";

interface SidebarProps {
  currentTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  onLogout?: () => void;
  onOpenProfile?: () => void;
  onOpenContract?: () => void;
}

export function Sidebar({
  currentTab,
  onTabChange,
  onLogout,
  onOpenProfile,
  onOpenContract,
}: SidebarProps) {
  const { currentUser, approvals, heldPurchases, bills, partnerAName, partnerBName } = useApp();
  const [isCollapsed, setIsCollapsed] = useState(false);

  const pendingApprovalsCount = approvals.filter(
    (a) => a.status === "pending" && a.approver === currentUser
  ).length;

  const heldCount = heldPurchases.filter((h) => h.status === "held").length;

  const navItems: { tab: NavTab; label: string; icon: SolarIconName; badge?: number }[] = [
    { tab: "home", label: "Home", icon: "home" },
    { tab: "plan", label: "Plan", icon: "chart" },
    { tab: "seiya", label: "Ask Seiya", icon: "sparkles" },
    { tab: "approvals", label: "Approvals", icon: "shield-check", badge: pendingApprovalsCount },
    { tab: "wallets", label: "Wallets", icon: "wallet" },
    { tab: "bills", label: "Bills", icon: "receipt", badge: bills.filter((b) => b.daysRemaining <= 3).length },
    { tab: "waiting_list", label: "Waiting List", icon: "clock-circle", badge: heldCount },
    { tab: "activity", label: "Activity", icon: "calendar" },
  ];

  const currentDisplayName = currentUser === "partner_a" ? partnerAName : partnerBName;
  const currentInitial = currentDisplayName.charAt(0).toUpperCase();

  return (
    <aside
      className={`bg-[#fcf8f0] flex-col justify-between hidden md:flex shrink-0 h-screen sticky top-0 overflow-y-auto border-r border-[#d1c9bf]/30 transition-all duration-300 ease-in-out ${
        isCollapsed ? "w-20 p-3" : "w-64 p-4"
      }`}
    >
      {/* Top Header & Brand */}
      <div>
        <div
          className={`mb-3 flex items-center ${
            isCollapsed ? "flex-col gap-2 justify-center py-2" : "justify-between px-3 py-3.5"
          }`}
        >
          {isCollapsed ? (
            <button
              onClick={() => onTabChange("home")}
              className="cursor-pointer transition-transform hover:scale-105"
              title="Seiya - Home"
            >
              <SeiyaIcon size={28} trackCursor={true} />
            </button>
          ) : (
            <button
              onClick={() => onTabChange("home")}
              className="cursor-pointer transition-transform hover:scale-[1.02] text-left"
              title="Seiya - Home"
            >
              <SeiyaLogo height={32} trackCursor={true} />
            </button>
          )}

          {/* Collapse/Expand Toggle Button */}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-1.5 rounded-full text-[#808988] hover:text-[#2a2b2f] hover:bg-[#ece3d3] transition-colors cursor-pointer"
            title={isCollapsed ? "Expand sidebar" : "Collapse to icons only"}
            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <SolarIcon
              name={isCollapsed ? "arrow-right" : "arrow-left"}
              size={16}
              variant="bold"
            />
          </button>
        </div>

        {/* Navigation list */}
        <nav className="space-y-1">
          {navItems.map((item) => {
            const isActive =
              currentTab === item.tab ||
              (item.tab === "plan" && (currentTab === "add_goal" || currentTab === "draft_goals"));
            return (
              <button
                key={item.tab}
                onClick={() => onTabChange(item.tab)}
                title={item.label}
                className={`relative w-full flex items-center transition-all cursor-pointer ${
                  isCollapsed
                    ? "justify-center p-2.5 rounded-full"
                    : "justify-between px-3.5 py-2.5 rounded-full text-xs font-semibold"
                } ${
                  isActive
                    ? "bg-[#f5eee1] text-[#B45529] shadow-xs"
                    : "text-[#515151] hover:bg-[#f5eee1]/70 hover:text-[#2a2b2f]"
                }`}
              >
                <div className={`flex items-center ${isCollapsed ? "justify-center" : "gap-3"}`}>
                  {item.tab === "seiya" ? (
                    <SeiyaIcon
                      size={18}
                      color={isActive ? "#B45529" : "#808988"}
                      trackCursor={true}
                    />
                  ) : (
                    <SolarIcon
                      name={item.icon}
                      size={18}
                      variant="bold"
                      className={isActive ? "text-[#B45529]" : "text-[#808988]"}
                    />
                  )}
                  {!isCollapsed && <span>{item.label}</span>}
                </div>

                {/* Badge */}
                {item.badge !== undefined && item.badge > 0 && (
                  isCollapsed ? (
                    <span className="absolute top-1.5 right-2 w-2 h-2 rounded-full bg-[#B45529] ring-2 ring-[#fcf8f0]" />
                  ) : (
                    <span className="px-2 py-0.5 text-[10px] rounded-full bg-[#B45529] text-[#fef9ef] font-bold">
                      {item.badge}
                    </span>
                  )
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Footer Profile & Contract Box */}
      <div className="pt-4">
        {isCollapsed ? (
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={() => {
                if (onOpenProfile) onOpenProfile();
                else onTabChange("profile");
              }}
              className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold text-[#fef9ef] hover:scale-105 transition-all cursor-pointer shadow-xs ${
                currentUser === "partner_a" ? "bg-[#B45529]" : "bg-[#3B1D17]"
              } ${currentTab === "profile" ? "ring-2 ring-[#B45529] ring-offset-2 ring-offset-[#fcf8f0]" : ""}`}
              title={`${currentDisplayName} · Profile & Contract`}
              aria-label="Profile and Contract"
            >
              {currentInitial}
            </button>
            {onLogout && (
              <button
                onClick={onLogout}
                className="p-1.5 rounded-full text-[#808988] hover:text-[#a34426] hover:bg-[#ece3d3] transition-colors cursor-pointer"
                title="Log out"
                aria-label="Log out"
              >
                <SolarIcon name="log-out" size={15} variant="bold" />
              </button>
            )}
          </div>
        ) : (
          <div
            className={`p-3 rounded-[14px] transition-all flex items-center justify-between group ${
              currentTab === "profile"
                ? "bg-[#ecdcc9] ring-1 ring-[#B45529]/40 shadow-xs"
                : "bg-[#f5eee1] hover:bg-[#ece3d3]/80"
            }`}
          >
            <button
              onClick={() => {
                if (onOpenProfile) onOpenProfile();
                else onTabChange("profile");
              }}
              className="flex items-center gap-2.5 flex-1 text-left cursor-pointer"
              title="View partner profile & Couple Contract"
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-[#fef9ef] transition-transform group-hover:scale-105 shrink-0 ${
                  currentUser === "partner_a" ? "bg-[#B45529]" : "bg-[#3B1D17]"
                }`}
              >
                {currentInitial}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-[#2a2b2f] capitalize leading-tight truncate">
                  {currentDisplayName}
                </p>
                <span className="text-[10px] text-[#515151] font-medium flex items-center gap-1">
                  <span>Profile & Contract</span>
                  <span className="text-[9px] text-[#B45529] font-bold">· Edit</span>
                </span>
              </div>
            </button>
            {onLogout && (
              <button
                onClick={onLogout}
                className="p-1.5 rounded-full text-[#515151] hover:text-[#a34426] hover:bg-[#d1c9bf]/30 transition-colors cursor-pointer shrink-0"
                title="Log out to switch profile"
                aria-label="Log out"
              >
                <SolarIcon name="log-out" size={16} variant="bold" />
              </button>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
