import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { formatMoney } from "./currency";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatIDR(amount: number): string {
  return formatMoney(amount, "IDR", "id-ID");
}

export { formatMoney, formatMoneyConverted, convertMoney, convertAmount } from "./currency";

export interface CategoryVisual {
  iconName: import("@/components/icons/solar").SolarIconName;
  bgClass: string;
  textClass: string;
}

export function getTransactionCategoryVisual(category?: string | null, title?: string): CategoryVisual {
  const cat = (category || "").toLowerCase();
  const t = (title || "").toLowerCase();

  if (cat.includes("food") || cat.includes("drink") || t.includes("coffee") || t.includes("dinner") || t.includes("lunch") || t.includes("bistro") || t.includes("breakfast")) {
    return {
      iconName: "cup",
      bgClass: "bg-[#edd8cc]",
      textClass: "text-[#B45529]",
    };
  }
  if (cat.includes("income") || t.includes("payout") || t.includes("salary") || t.includes("deposit")) {
    return {
      iconName: "trend-up",
      bgClass: "bg-[#dce8db]",
      textClass: "text-[#2d5232]",
    };
  }
  if (t.includes("book") || cat.includes("education")) {
    return {
      iconName: "book",
      bgClass: "bg-[#ebdcc9]",
      textClass: "text-[#7a5933]",
    };
  }
  if (cat.includes("shop") || t.includes("grocer") || t.includes("market") || t.includes("store")) {
    return {
      iconName: "bag",
      bgClass: "bg-[#fae7cb]",
      textClass: "text-[#C98A4F]",
    };
  }
  if (cat.includes("bill") || cat.includes("utilit") || t.includes("internet") || t.includes("electric") || t.includes("water") || t.includes("wifi")) {
    return {
      iconName: "bolt",
      bgClass: "bg-[#e8dfd5]",
      textClass: "text-[#515151]",
    };
  }
  if (cat.includes("transport") || cat.includes("mobility") || t.includes("gas") || t.includes("fuel") || t.includes("taxi") || t.includes("uber") || t.includes("grab")) {
    return {
      iconName: "car",
      bgClass: "bg-[#dfdfd6]",
      textClass: "text-[#414847]",
    };
  }
  if (cat.includes("travel") || t.includes("flight") || t.includes("hotel") || t.includes("trip")) {
    return {
      iconName: "plane",
      bgClass: "bg-[#dce7f0]",
      textClass: "text-[#2e5374]",
    };
  }
  if (cat.includes("health") || t.includes("doctor") || t.includes("pharmacy") || t.includes("med")) {
    return {
      iconName: "heart",
      bgClass: "bg-[#f0dcd8]",
      textClass: "text-[#933b2b]",
    };
  }
  if (cat.includes("entertainment") || t.includes("tv") || t.includes("movie") || t.includes("game") || t.includes("netflix") || t.includes("cinema")) {
    return {
      iconName: "tv",
      bgClass: "bg-[#e6dded]",
      textClass: "text-[#5e4776]",
    };
  }
  if (cat.includes("housing") || t.includes("rent") || t.includes("home")) {
    return {
      iconName: "home",
      bgClass: "bg-[#ebdcd0]",
      textClass: "text-[#784e2d]",
    };
  }
  return {
    iconName: "card",
    bgClass: "bg-[#ece4d8]",
    textClass: "text-[#515151]",
  };
}
