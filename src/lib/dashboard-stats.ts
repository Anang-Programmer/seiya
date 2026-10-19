import { convertAmount } from "./currency";
import type { Transaction } from "./store";

// Geometry of the dashboard's weekly SVG chart (viewBox 0 0 460 210):
// the zero line sits at y=170 and the top gridline at y=20.
const CHART_ZERO_Y = 170;
const CHART_HEIGHT = 150;
const WEEK_CENTERS = [88, 188, 288, 388];

export interface WeekBar {
  id: string;
  label: string;
  period: string;
  income: number;
  expenses: number;
  savings: number;
  xCenter: number;
  b1X: number;
  b2X: number;
  bar1: { yBottom: number; hBottom: number; yMid: number; hMid: number; yTop: number; hTop: number };
  bar2: { yBottom: number; hBottom: number; yMid: number; hMid: number; yTop: number; hTop: number };
}

export interface CategorySlice {
  name: string;
  count: string;
  percent: string;
  value: number;
  share: number;
  color: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  Shopping: "#B45529",
  "Food & Drinks": "#C98A4F",
  Bills: "#3B1D17",
  Health: "#3d5a40",
  Transportation: "#808988",
  Social: "#9fb497",
  Others: "#d1c9bf",
};

function niceCeil(value: number) {
  if (value <= 0) return 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  for (const step of [1, 1.5, 2, 3, 5, 10]) {
    if (step * magnitude >= value) return step * magnitude;
  }
  return 10 * magnitude;
}

export function percentChange(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

function sumRange(txs: Transaction[], from: Date, to: Date, currency: string) {
  let income = 0;
  let expenses = 0;
  for (const tx of txs) {
    const at = new Date(tx.timestamp).getTime();
    if (Number.isNaN(at) || at < from.getTime() || at >= to.getTime()) continue;
    const value = convertAmount(Math.abs(tx.amount), tx.currency, currency);
    if (tx.amount >= 0) income += value;
    else expenses += value;
  }
  return { income, expenses, savings: Math.max(0, income - expenses) };
}

export function computeDashboardStats(transactions: Transaction[], currency: string, locale: string, now = new Date()) {
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const month = sumRange(transactions, monthStart, nextMonthStart, currency);
  const previous = sumRange(transactions, prevMonthStart, monthStart, currency);

  // Four rolling 7-day windows ending today.
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const shortDate = (d: Date) => d.toLocaleDateString(locale, { day: "numeric", month: "short" });
  const windows = [3, 2, 1, 0].map((weeksAgo) => {
    const to = new Date(endOfToday.getTime() - weeksAgo * 7 * 86_400_000);
    const from = new Date(to.getTime() - 7 * 86_400_000);
    const last = new Date(to.getTime() - 86_400_000);
    return { from, to, last, ...sumRange(transactions, from, to, currency) };
  });

  const scaleMax = niceCeil(Math.max(1, ...windows.map((w) => Math.max(w.income, w.expenses + w.savings))));
  const toHeight = (value: number) => (value / scaleMax) * CHART_HEIGHT;

  const weeks: WeekBar[] = windows.map((w, idx) => {
    const xCenter = WEEK_CENTERS[idx];
    const hIncome = toHeight(w.income);
    const hExpenses = toHeight(w.expenses);
    const hSavings = toHeight(w.savings);
    const expensesTop = CHART_ZERO_Y - hExpenses;
    return {
      id: `week${idx + 1}`,
      label: `${shortDate(w.from)}–${w.last.getDate()}`,
      period: `${shortDate(w.from)} – ${w.last.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" })}`,
      income: w.income,
      expenses: w.expenses,
      savings: w.savings,
      xCenter,
      b1X: xCenter - 20,
      b2X: xCenter + 2,
      // Bar 1: income only.
      bar1: { yBottom: CHART_ZERO_Y, hBottom: 0, yMid: CHART_ZERO_Y, hMid: 0, yTop: CHART_ZERO_Y - hIncome, hTop: hIncome },
      // Bar 2: expenses with savings stacked on top.
      bar2: {
        yBottom: expensesTop,
        hBottom: hExpenses,
        yMid: expensesTop,
        hMid: 0,
        yTop: expensesTop - hSavings,
        hTop: hSavings,
      },
    };
  });

  // Spending by category for the current month.
  const byCategory = new Map<string, { value: number; count: number }>();
  for (const tx of transactions) {
    if (tx.amount >= 0) continue;
    const at = new Date(tx.timestamp).getTime();
    if (at < monthStart.getTime() || at >= nextMonthStart.getTime()) continue;
    const entry = byCategory.get(tx.category) ?? { value: 0, count: 0 };
    entry.value += convertAmount(Math.abs(tx.amount), tx.currency, currency);
    entry.count += 1;
    byCategory.set(tx.category, entry);
  }
  const totalSpent = Array.from(byCategory.values()).reduce((sum, c) => sum + c.value, 0);
  const categories: CategorySlice[] = Array.from(byCategory.entries())
    .sort((a, b) => b[1].value - a[1].value)
    .map(([name, c]) => ({
      name,
      count: `${c.count} Transaction${c.count === 1 ? "" : "s"}`,
      percent: totalSpent > 0 ? `${((c.value / totalSpent) * 100).toFixed(1)}%` : "0%",
      value: c.value,
      share: totalSpent > 0 ? c.value / totalSpent : 0,
      color: CATEGORY_COLORS[name] ?? "#d1c9bf",
    }));

  return {
    monthLabel: now.toLocaleDateString(locale, { month: "long", year: "numeric" }),
    income: month.income,
    expenses: month.expenses,
    savings: month.savings,
    incomeChange: percentChange(month.income, previous.income),
    expensesChange: percentChange(month.expenses, previous.expenses),
    savingsChange: percentChange(month.savings, previous.savings),
    weeks,
    scaleMax,
    categories,
    totalSpent,
    spentChange: percentChange(month.expenses, previous.expenses),
  };
}
