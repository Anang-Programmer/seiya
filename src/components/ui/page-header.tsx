"use client";

import React, { useState } from "react";
import { SolarIcon } from "@/components/icons/solar";

interface PageHeaderProps {
  title: string;
  iconName?: import("@/components/icons/solar").SolarIconName;
  iconColor?: string;
  description: string;
  badge?: React.ReactNode;
  rightAction?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  iconName,
  iconColor = "text-[#B45529]",
  description,
  badge,
  rightAction,
  className = "",
}: PageHeaderProps) {
  const [showInfo, setShowInfo] = useState(false);

  return (
    <div className={`space-y-2.5 ${className}`}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Title and info toggle icon button */}
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-xl sm:text-2xl font-serif font-normal text-[#2a2b2f] tracking-tight flex items-center gap-2">
            {iconName && <SolarIcon name={iconName} size={24} className={iconColor} />}
            <span>{title}</span>
          </h2>

          {/* Circle 'i' button to toggle description / explanation */}
          <button
            type="button"
            onClick={() => setShowInfo((prev) => !prev)}
            aria-label={showInfo ? "Sembunyikan penjelasan" : "Lihat penjelasan halaman"}
            title={showInfo ? "Tutup penjelasan" : "Lihat penjelasan halaman"}
            className={`w-6 h-6 rounded-full flex items-center justify-center transition-all cursor-pointer shadow-2xs ${
              showInfo
                ? "bg-[#B45529] text-[#fef9ef] scale-105"
                : "bg-[#f5eee1] text-[#808988] hover:text-[#B45529] hover:bg-[#ece3d3]"
            }`}
          >
            <SolarIcon name="info-circle" size={15} />
          </button>
        </div>

        {/* Right side actions / badges */}
        {(badge || rightAction) && (
          <div className="flex items-center gap-2 shrink-0">
            {badge}
            {rightAction}
          </div>
        )}
      </div>

      {/* Expandable Explanation with subtle animation */}
      {showInfo && (
        <div className="p-3 sm:p-3.5 rounded-[12px] bg-[#f5eee1] border border-[#d1c9bf]/50 text-xs text-[#515151] flex items-start justify-between gap-3 animate-in fade-in-0 slide-in-from-top-1 duration-200">
          <div className="flex items-start gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[#B45529] shrink-0 mt-1.5" />
            <p className="leading-relaxed">{description}</p>
          </div>
          <button
            type="button"
            onClick={() => setShowInfo(false)}
            className="text-[#808988] hover:text-[#2a2b2f] p-0.5 rounded cursor-pointer shrink-0"
            title="Tutup"
          >
            <SolarIcon name="close-circle" size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
