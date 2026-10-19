// Reads a receipt's text (from on-device OCR or a PDF e-receipt) into a draft
// expense with plain rules, so normal receipts cost no AI tokens. Used in the
// browser (OCR) and on the server (PDF), so it must stay dependency-free.

export type ReceiptCategory = "Food & Drinks" | "Shopping" | "Bills" | "Transportation" | "Health" | "Social" | "Others";

export interface ReceiptFields {
  merchant: string | null;
  total: number | null;
  currency: string | null;
  date: string | null;
  category: ReceiptCategory;
}

/** "98.790" / "98,790" / "Rp 98.790,50" / "12.50" -> 98790 / 98790 / 98790.5 / 12.5 */
export function parseAmount(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) && value > 0 && value < 1e12 ? Math.round(value * 100) / 100 : null;
  if (typeof value !== "string") return null;
  let s = value.replace(/[^\d.,]/g, "");
  if (!/\d/.test(s)) return null;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  const lastSep = Math.max(lastComma, lastDot);
  if (lastSep >= 0 && s.length - lastSep - 1 === 3) {
    s = s.replace(/[.,]/g, ""); // the separators are thousands
  } else if (lastSep >= 0) {
    const decimalSep = lastComma > lastDot ? "," : ".";
    const thousands = decimalSep === "," ? "." : ",";
    s = s.split(thousands).join("").replace(decimalSep, ".");
  }
  return parseAmount(Number(s));
}

const MONTHS: Record<string, number> = {
  jan: 1, januari: 1, january: 1,
  feb: 2, februari: 2, february: 2, peb: 2,
  mar: 3, maret: 3, march: 3,
  apr: 4, april: 4,
  mei: 5, may: 5,
  jun: 6, juni: 6, june: 6,
  jul: 7, juli: 7, july: 7,
  agu: 8, agt: 8, ags: 8, agustus: 8, aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  okt: 10, oktober: 10, oct: 10, october: 10,
  nov: 11, nop: 11, november: 11,
  des: 12, desember: 12, dec: 12, december: 12,
};

function isoDate(y: number, m: number, d: number): string | null {
  if (y < 100) y += 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 2000) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCMonth() !== m - 1 || date.getTime() > Date.now() + 86_400_000) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** First date found in the text: 18/10/2026, 18-10-26, 2026-10-18, 18 Okt 2026. */
export function findDate(text: string): string | null {
  let m = text.match(/\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (m) return isoDate(+m[1], +m[2], +m[3]);
  m = text.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/);
  if (m) return isoDate(+m[3], +m[2], +m[1]);
  m = text.match(/\b(\d{1,2})\s+([A-Za-z]{3,9})\.?\s+(\d{2,4})\b/);
  if (m && MONTHS[m[2].toLowerCase()]) return isoDate(+m[3], MONTHS[m[2].toLowerCase()], +m[1]);
  return null;
}

export function guessCategory(hintText: string): ReceiptCategory {
  const hint = hintText.toLowerCase();
  if (/food|drink|cafe|coffee|kopi|resto|restaurant|makan|bakery|warung|bakso|sate|pizza|burger|kfc|mcd|starbucks|teh|boba/.test(hint)) return "Food & Drinks";
  if (/grab|gojek|taxi|taksi|fuel|bensin|pertamina|shell|parking|parkir|toll|tol|transport|kereta|krl|tiket/.test(hint)) return "Transportation";
  if (/pharma|apotek|clinic|klinik|hospital|rumah sakit|health|kimia farma|dokter/.test(hint)) return "Health";
  if (/pln|listrik|water|pdam|internet|indihome|bill|tagihan|telkom|pulsa|token/.test(hint)) return "Bills";
  if (/mart|maret|alfa|market|supermarket|shop|store|toko|mall|hypermart|lotte|matahari|uniqlo/.test(hint)) return "Shopping";
  return "Others";
}

// Lines that hold the final amount, best first. "subtotal", item counts and
// change/cash lines are excluded.
const TOTAL_PATTERNS = [
  /\b(grand\s*total|total\s*(bayar|pembayaran|belanja|tagihan|harga|akhir)|jumlah\s*(bayar|tagihan)|amount\s*due|total\s*due|net\s*total)\b/i,
  /^(?!.*\b(sub\s*-?\s*total|total\s*(item|qty|disc|diskon|hemat)|tunai|cash|kembali|change)\b).*\btotal\b/i,
  /\b(tagihan|harus\s*dibayar)\b/i,
];
const NOT_AMOUNT_LINE = /\b(kembali|kembalian|change|tunai|cash|dibayar\s*tunai|qty|item)\b/i;
const AMOUNT_AT_END = /(?:rp\.?|idr)?\s*(\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s*-?\s*$/i;
const SKIP_MERCHANT = /\b(struk|receipt|invoice|nota|faktur|kasir|cashier|tanggal|tgl|date|jl\.?|jalan|telp|tel|npwp|no\.?)\b/i;

function lineAmount(line: string): number | null {
  const m = line.match(AMOUNT_AT_END);
  return m ? parseAmount(m[1]) : null;
}

export function parseReceiptText(rawText: string): ReceiptFields {
  const lines = rawText
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  let total: number | null = null;
  for (const pattern of TOTAL_PATTERNS) {
    for (let i = lines.length - 1; i >= 0 && total === null; i--) {
      if (!pattern.test(lines[i])) continue;
      // The amount is on the same line, or on the next one in two-column layouts.
      total = lineAmount(lines[i]) ?? (lines[i + 1] && !NOT_AMOUNT_LINE.test(lines[i + 1]) ? lineAmount(lines[i + 1]) : null);
    }
    if (total !== null) break;
  }

  const merchant =
    lines
      .slice(0, 6)
      .find((l) => /[A-Za-z]{3,}/.test(l) && !SKIP_MERCHANT.test(l) && (l.match(/\d/g)?.length ?? 0) < l.length / 3)
      ?.slice(0, 80) ?? null;

  const text = lines.join("\n");
  const currency = /\b(rp\.?|idr)\b/i.test(text) ? "IDR" : /\$|\busd\b/i.test(text) ? "USD" : /€|\beur\b/i.test(text) ? "EUR" : /\bsgd\b|s\$/i.test(text) ? "SGD" : null;

  return {
    merchant,
    total,
    currency,
    date: findDate(text),
    category: guessCategory(`${merchant ?? ""} ${text.slice(0, 400)}`),
  };
}
