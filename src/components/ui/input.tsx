import React from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-11 w-full rounded-full border border-[#d1c9bf] bg-[#fef9ef] px-4 py-2 text-sm text-[#2a2b2f] placeholder:text-[#808988] focus:outline-none focus:ring-3 focus:ring-[#B45529]/20 focus:border-[#B45529] disabled:cursor-not-allowed disabled:opacity-50 transition-all",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export function Progress({
  value = 0,
  max = 100,
  className,
  indicatorClassName,
}: {
  value?: number;
  max?: number;
  className?: string;
  indicatorClassName?: string;
}) {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div className={cn("relative h-2 w-full overflow-hidden rounded-full bg-[#f5eee1] border border-[#d1c9bf]/40", className)}>
      <div
        className={cn("h-full w-full flex-1 bg-[#B45529] rounded-full transition-all duration-300", indicatorClassName)}
        style={{ transform: `translateX(-${100 - percentage}%)` }}
      />
    </div>
  );
}

export function Tabs({
  items,
  activeKey,
  onChange,
  className,
}: {
  items: { key: string; label: string; badge?: string | number }[];
  activeKey: string;
  onChange: (key: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("inline-flex w-fit max-w-full items-center gap-1.5 p-1 bg-[#f5eee1] rounded-full border border-[#d1c9bf]/60 overflow-x-auto", className)}>
      {items.map((item) => {
        const isActive = item.key === activeKey;
        return (
          <button
            key={item.key}
            onClick={() => onChange(item.key)}
            className={cn(
              "px-4 py-1.5 text-xs font-semibold rounded-full transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5",
              isActive
                ? "bg-[#B45529] text-[#fef9ef] shadow-xs"
                : "text-[#515151] hover:text-[#2a2b2f] hover:bg-[#ece3d3]"
            )}
          >
            {item.label}
            {item.badge !== undefined && (
              <span
                className={cn(
                  "px-1.5 py-0.2 rounded-full text-[10px] font-mono",
                  isActive ? "bg-white/20 text-[#fef9ef]" : "bg-[#e5dcd0] text-[#515151]"
                )}
              >
                {item.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
