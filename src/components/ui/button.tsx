import React from "react";
import { cn } from "@/lib/utils";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "tertiary" | "outline" | "ghost" | "danger" | "soft" | "purple";
  size?: "sm" | "md" | "lg" | "icon";
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", children, disabled, ...props }, ref) => {
    const baseStyles =
      "inline-flex items-center justify-center font-semibold rounded-[40px] transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-[#B45529]/30 focus:ring-offset-1 disabled:opacity-40 disabled:pointer-events-none cursor-pointer active:scale-[0.98]";

    const variantStyles = {
      primary: "bg-[#B45529] text-[#fef9ef] hover:bg-[#9a4c2b] shadow-xs",
      secondary: "bg-[#3B1D17] text-[#fef9ef] hover:bg-[#2c140f] shadow-xs",
      tertiary: "bg-[#C98A4F] text-[#fef9ef] hover:bg-[#b5773e] shadow-xs",
      outline: "border-[1.5px] border-[#B45529] bg-transparent text-[#B45529] hover:bg-[#f5eee1]/80",
      ghost: "text-[#2a2b2f] hover:bg-[#f5eee1] hover:text-[#B45529]",
      danger: "bg-[#a34426] text-[#fef9ef] hover:bg-[#8c371d]",
      soft: "bg-[#f5eee1] text-[#B45529] hover:bg-[#ece3d3]",
      purple: "bg-[#B45529] text-[#fef9ef] hover:bg-[#9a4c2b] shadow-xs",
    }[variant];

    const sizeStyles = {
      sm: "text-xs px-3.5 py-2 sm:py-1.5 gap-1.5",
      md: "text-sm px-5 py-2.5 gap-2",
      lg: "text-base px-6 py-3 gap-2.5",
      icon: "p-2 w-9 h-9 rounded-full",
    }[size];

    return (
      <button
        ref={ref}
        className={cn(baseStyles, variantStyles, sizeStyles, className)}
        disabled={disabled}
        {...props}
      >
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";
