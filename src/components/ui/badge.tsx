import React from "react";
import { cn } from "@/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "primary" | "secondary" | "tertiary" | "allow" | "need_approval" | "hold" | "deny" | "neutral" | "simulated" | "pending" | "active" | "draft";
}

export function Badge({ className, variant = "neutral", children, ...props }: BadgeProps) {
  const variantStyles = {
    primary: "bg-[#B45529] text-[#fef9ef] border-transparent",
    secondary: "bg-[#3B1D17] text-[#fef9ef] border-transparent",
    tertiary: "bg-[#C98A4F] text-[#fef9ef] border-transparent",
    allow: "bg-[#edf3ec] text-[#2d5232] border-[#c7dcc5]",
    need_approval: "bg-[#fbf0eb] text-[#B45529] border-[#edd2c6]",
    pending: "bg-[#fbf0eb] text-[#B45529] border-[#edd2c6]",
    hold: "bg-[#fcf5e8] text-[#C98A4F] border-[#ebdcc2]",
    deny: "bg-[#fcf0ee] text-[#9e382b] border-[#eec9c3]",
    neutral: "bg-[#f5eee1] text-[#333333] border-[#d1c9bf]",
    simulated: "bg-[#f5eee1] text-[#515151] border-[#d1c9bf] font-mono text-[10px] uppercase tracking-wider",
    active: "bg-[#edf3ec] text-[#2d5232] border-[#c7dcc5]",
    draft: "bg-[#f5eee1] text-[#515151] border-[#d1c9bf]",
  }[variant];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border transition-colors",
        variantStyles,
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}
