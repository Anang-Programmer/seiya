import { SUPPORTED_CURRENCIES, convertAmount } from "./currency";

// Countries Seiya can price onboarding questions for. Each maps to one of the
// supported household currencies and a locale for number formatting.
export interface CountryOption {
  code: string;
  name: string;
  currency: string;
  locale: string;
}

export const COUNTRY_OPTIONS: CountryOption[] = [
  { code: "ID", name: "Indonesia", currency: "IDR", locale: "id-ID" },
  { code: "SG", name: "Singapore", currency: "SGD", locale: "en-SG" },
  { code: "US", name: "United States", currency: "USD", locale: "en-US" },
  { code: "GB", name: "United Kingdom", currency: "GBP", locale: "en-GB" },
  { code: "AU", name: "Australia", currency: "AUD", locale: "en-AU" },
  { code: "CA", name: "Canada", currency: "CAD", locale: "en-CA" },
  { code: "JP", name: "Japan", currency: "JPY", locale: "ja-JP" },
  { code: "CN", name: "China", currency: "CNY", locale: "zh-CN" },
  { code: "DE", name: "Germany", currency: "EUR", locale: "de-DE" },
  { code: "FR", name: "France", currency: "EUR", locale: "fr-FR" },
  { code: "NL", name: "Netherlands", currency: "EUR", locale: "nl-NL" },
  { code: "IT", name: "Italy", currency: "EUR", locale: "it-IT" },
  { code: "ES", name: "Spain", currency: "EUR", locale: "es-ES" },
  { code: "IE", name: "Ireland", currency: "EUR", locale: "en-IE" },
];

const DEFAULT_COUNTRY = COUNTRY_OPTIONS[0];

const TIMEZONE_COUNTRY: Record<string, string> = {
  "Asia/Jakarta": "ID",
  "Asia/Makassar": "ID",
  "Asia/Jayapura": "ID",
  "Asia/Pontianak": "ID",
  "Asia/Singapore": "SG",
  "Europe/London": "GB",
  "Asia/Tokyo": "JP",
  "Asia/Shanghai": "CN",
  "Asia/Chongqing": "CN",
  "Asia/Urumqi": "CN",
  "Europe/Berlin": "DE",
  "Europe/Paris": "FR",
  "Europe/Amsterdam": "NL",
  "Europe/Rome": "IT",
  "Europe/Madrid": "ES",
  "Europe/Dublin": "IE",
};

const CANADA_ZONES = /^America\/(Toronto|Vancouver|Edmonton|Winnipeg|Halifax|St_Johns|Regina|Montreal|Moncton|Whitehorse|Yellowknife|Iqaluit)$/;
const US_ZONES = /^(America\/(New_York|Chicago|Denver|Los_Angeles|Phoenix|Anchorage|Detroit|Boise|Indiana\/.+|Kentucky\/.+)|Pacific\/Honolulu)$/;

export function findCountry(codeOrName: string | null | undefined): CountryOption | null {
  if (!codeOrName) return null;
  const key = codeOrName.trim().toLowerCase();
  return COUNTRY_OPTIONS.find((c) => c.code.toLowerCase() === key || c.name.toLowerCase() === key) ?? null;
}

export function countryForCurrency(currency: string): CountryOption {
  return COUNTRY_OPTIONS.find((c) => c.currency === currency) ?? DEFAULT_COUNTRY;
}

/** Best guess of the user's country from the browser (time zone, then language region). */
export function detectCountry(): CountryOption {
  if (typeof window === "undefined") return DEFAULT_COUNTRY;
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
    const byZone = TIMEZONE_COUNTRY[tz] ?? (tz.startsWith("Australia/") ? "AU" : CANADA_ZONES.test(tz) ? "CA" : US_ZONES.test(tz) ? "US" : null);
    if (byZone) return findCountry(byZone) ?? DEFAULT_COUNTRY;
    for (const lang of navigator.languages ?? [navigator.language]) {
      const region = lang.split("-")[1];
      const match = findCountry(region);
      if (match) return match;
    }
  } catch {
    // Fall through to the default.
  }
  return DEFAULT_COUNTRY;
}

// Round, familiar amounts per currency for "purchases above how much should be
// discussed first?" (small, everyday, big, very big).
const DISCUSS_THRESHOLD_PRESETS: Record<string, number[]> = {
  IDR: [500_000, 1_000_000, 2_000_000, 5_000_000],
  USD: [50, 100, 250, 500],
  EUR: [50, 100, 250, 500],
  GBP: [50, 100, 200, 500],
  SGD: [100, 200, 500, 1_000],
  AUD: [100, 200, 500, 1_000],
  CAD: [100, 200, 500, 1_000],
  JPY: [5_000, 10_000, 30_000, 50_000],
  CNY: [300, 500, 1_000, 3_000],
};

function roundNice(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const magnitude = Math.pow(10, Math.max(0, Math.floor(Math.log10(value)) - 1));
  return Math.round(value / magnitude) * magnitude;
}

export function discussThresholdPresets(currency: string): number[] {
  return DISCUSS_THRESHOLD_PRESETS[currency] ?? [50, 100, 250, 500].map((usd) => roundNice(convertAmount(usd, "USD", currency)));
}

/** Whole-unit currency label, e.g. "Rp 1.000.000" or "$100". */
export function formatWholeAmount(amount: number, currency: string, locale: string) {
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    const symbol = SUPPORTED_CURRENCIES[currency]?.symbol ?? currency;
    return `${symbol} ${Math.round(amount).toLocaleString()}`;
  }
}
