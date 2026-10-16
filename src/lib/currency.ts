export interface CurrencyInfo {
  code: string;
  name: string;
  symbol: string;
  decimals: number;
}

export const SUPPORTED_CURRENCIES: Record<string, CurrencyInfo> = {
  USD: { code: "USD", name: "US Dollar", symbol: "$", decimals: 2 },
  EUR: { code: "EUR", name: "Euro", symbol: "€", decimals: 2 },
  GBP: { code: "GBP", name: "British Pound", symbol: "£", decimals: 2 },
  CNY: { code: "CNY", name: "Chinese Yuan", symbol: "¥", decimals: 2 },
  IDR: { code: "IDR", name: "Indonesian Rupiah", symbol: "Rp", decimals: 0 },
  JPY: { code: "JPY", name: "Japanese Yen", symbol: "¥", decimals: 0 },
  SGD: { code: "SGD", name: "Singapore Dollar", symbol: "S$", decimals: 2 },
  AUD: { code: "AUD", name: "Australian Dollar", symbol: "A$", decimals: 2 },
  CAD: { code: "CAD", name: "Canadian Dollar", symbol: "C$", decimals: 2 },
};

// Explicitly labeled mock FX rates (USD base) for prototype demo purposes
export const MOCK_FX_RATES: Record<string, number> = {
  USD: 1.0,
  EUR: 0.92,
  GBP: 0.78,
  CNY: 7.24,
  IDR: 15600,
  JPY: 151.5,
  SGD: 1.35,
  AUD: 1.52,
  CAD: 1.38,
};

export const MOCK_FX_METADATA = {
  status: "mock_fixture" as const,
  source: "Mock Fed/ECB Mid-market",
  disclaimer: "Estimated prototype rate. Not live market execution.",
  timestamp: "2026-10-14 00:00 UTC",
};

/**
 * Format money with locale awareness and proper minor-unit decimals.
 */
export function formatMoney(
  amount: number,
  currencyCode: string = "USD",
  locale: string = "en-US"
): string {
  const info = SUPPORTED_CURRENCIES[currencyCode] || {
    code: currencyCode,
    name: currencyCode,
    symbol: currencyCode,
    decimals: 2,
  };

  try {
    const formatted = new Intl.NumberFormat(locale, {
      style: "currency",
      currency: info.code,
      minimumFractionDigits: info.decimals,
      maximumFractionDigits: info.decimals,
    }).format(amount);

    return formatted;
  } catch {
    const sign = amount < 0 ? "-" : "";
    const abs = Math.abs(amount).toFixed(info.decimals);
    return `${sign}${info.code} ${abs}`;
  }
}

export interface ConversionResult {
  convertedAmount: number;
  available: boolean;
  rateUsed?: number;
  rateTimestamp?: string;
  isEstimate: boolean;
  errorMessage?: string;
}

/**
 * Converts money from one currency to another using labeled mock rates.
 * If conversion is unsupported or rates are missing, returns available: false.
 */
export function convertMoney(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  simulateRateMissing: boolean = false
): ConversionResult {
  if (fromCurrency === toCurrency) {
    return {
      convertedAmount: amount,
      available: true,
      rateUsed: 1.0,
      rateTimestamp: MOCK_FX_METADATA.timestamp,
      isEstimate: false,
    };
  }

  if (simulateRateMissing) {
    return {
      convertedAmount: 0,
      available: false,
      isEstimate: false,
      errorMessage: `Mock exchange rate unavailable for ${fromCurrency} → ${toCurrency}. Native breakdown preserved.`,
    };
  }

  const fromRate = MOCK_FX_RATES[fromCurrency];
  const toRate = MOCK_FX_RATES[toCurrency];

  if (!fromRate || !toRate) {
    return {
      convertedAmount: 0,
      available: false,
      isEstimate: false,
      errorMessage: `Exchange rate not available for ${fromCurrency} → ${toCurrency}.`,
    };
  }

  // Convert via USD base: amount / fromRate * toRate
  const amountInUSD = amount / fromRate;
  const convertedAmount = amountInUSD * toRate;

  return {
    convertedAmount,
    available: true,
    rateUsed: toRate / fromRate,
    rateTimestamp: MOCK_FX_METADATA.timestamp,
    isEstimate: true,
  };
}

/**
 * Formats money with automatic currency conversion if fromCurrency !== toCurrency.
 * If fromCurrency is omitted, it assumes the amount is in USD base.
 */
export function formatMoneyConverted(
  amount: number,
  fromCurrency: string = "USD",
  toCurrency: string = "USD",
  locale: string = "en-US"
): string {
  const conv = convertMoney(amount, fromCurrency, toCurrency);
  const finalAmount = conv.available ? conv.convertedAmount : amount;
  return formatMoney(finalAmount, toCurrency, locale);
}

/**
 * Convert an amount from fromCurrency to toCurrency, returning the numeric value.
 * Fallback to original amount if rate not found.
 */
export function convertAmount(
  amount: number,
  fromCurrency: string = "USD",
  toCurrency: string = "USD"
): number {
  const conv = convertMoney(amount, fromCurrency, toCurrency);
  return conv.available ? conv.convertedAmount : amount;
}
