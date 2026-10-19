import { findCountry } from "@/lib/country-currency";

// Dashboard greeting ("Good morning, Kylorenn") and date, in the language and
// date style of the household's country, using the time on the user's device.

type Period = "morning" | "midday" | "afternoon" | "evening";

interface GreetingStyle {
  /** Greeting per period, chosen by the local hour. */
  periods: (hour: number) => Period;
  words: Record<Period, string>;
  /** Text between greeting and name, and after the name (e.g. Japanese "さん"). */
  separator: string;
  suffix?: string;
}

const STYLES: Record<string, GreetingStyle> = {
  en: {
    periods: (h) => (h >= 5 && h < 12 ? "morning" : h >= 12 && h < 18 ? "afternoon" : "evening"),
    words: { morning: "Good morning", midday: "Good afternoon", afternoon: "Good afternoon", evening: "Good evening" },
    separator: ", ",
  },
  // Indonesian splits the day into pagi, siang, sore and malam.
  id: {
    periods: (h) => (h >= 4 && h < 11 ? "morning" : h >= 11 && h < 15 ? "midday" : h >= 15 && h < 18 ? "afternoon" : "evening"),
    words: { morning: "Selamat pagi", midday: "Selamat siang", afternoon: "Selamat sore", evening: "Selamat malam" },
    separator: ", ",
  },
  zh: {
    periods: (h) => (h >= 5 && h < 11 ? "morning" : h >= 11 && h < 13 ? "midday" : h >= 13 && h < 18 ? "afternoon" : "evening"),
    words: { morning: "早上好", midday: "中午好", afternoon: "下午好", evening: "晚上好" },
    separator: "，",
  },
  ja: {
    periods: (h) => (h >= 5 && h < 11 ? "morning" : h >= 11 && h < 18 ? "afternoon" : "evening"),
    words: { morning: "おはようございます", midday: "こんにちは", afternoon: "こんにちは", evening: "こんばんは" },
    separator: "、",
    suffix: "さん",
  },
  de: {
    periods: (h) => (h >= 5 && h < 11 ? "morning" : h >= 11 && h < 18 ? "afternoon" : "evening"),
    words: { morning: "Guten Morgen", midday: "Guten Tag", afternoon: "Guten Tag", evening: "Guten Abend" },
    separator: ", ",
  },
  fr: {
    periods: (h) => (h >= 5 && h < 18 ? "morning" : "evening"),
    words: { morning: "Bonjour", midday: "Bonjour", afternoon: "Bonjour", evening: "Bonsoir" },
    separator: ", ",
  },
  nl: {
    periods: (h) => (h >= 5 && h < 12 ? "morning" : h >= 12 && h < 18 ? "afternoon" : "evening"),
    words: { morning: "Goedemorgen", midday: "Goedemiddag", afternoon: "Goedemiddag", evening: "Goedenavond" },
    separator: ", ",
  },
  it: {
    periods: (h) => (h >= 5 && h < 13 ? "morning" : h >= 13 && h < 18 ? "afternoon" : "evening"),
    words: { morning: "Buongiorno", midday: "Buon pomeriggio", afternoon: "Buon pomeriggio", evening: "Buonasera" },
    separator: ", ",
  },
  es: {
    periods: (h) => (h >= 5 && h < 12 ? "morning" : h >= 12 && h < 20 ? "afternoon" : "evening"),
    words: { morning: "Buenos días", midday: "Buenas tardes", afternoon: "Buenas tardes", evening: "Buenas noches" },
    separator: ", ",
  },
};

/**
 * Locale for the dashboard header: the household's country first (chosen in
 * onboarding), then the app/browser locale.
 */
export function dashboardLocale(householdCountry: string | null | undefined, fallbackLocale: string) {
  return findCountry(householdCountry)?.locale ?? fallbackLocale ?? "en-US";
}

export interface GreetingParts {
  greeting: string;
  separator: string;
  suffix: string;
}

/** Greeting for the local hour, split so the name can be styled separately. */
export function greetingParts(locale: string, now: Date = new Date()): GreetingParts {
  const style = STYLES[locale.split("-")[0].toLowerCase()] ?? STYLES.en;
  return { greeting: style.words[style.periods(now.getHours())], separator: style.separator, suffix: style.suffix ?? "" };
}

export function greetingText(name: string, locale: string, now: Date = new Date()) {
  const p = greetingParts(locale, now);
  return `${p.greeting}${p.separator}${name}${p.suffix}`;
}

/** "Senin, 19 Oktober 2026" / "2026年10月19日星期一" / "Monday 19 October 2026". */
export function longDate(locale: string, now: Date = new Date()) {
  try {
    const text = new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(now);
    // Standalone line: capitalise ("lundi 19 octobre" -> "Lundi 19 octobre").
    return text.charAt(0).toLocaleUpperCase(locale) + text.slice(1);
  } catch {
    return now.toDateString();
  }
}
