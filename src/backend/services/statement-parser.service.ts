import * as XLSX from "xlsx";
import { extractText } from "unpdf";
import type { ParsedRawTransaction } from "@/backend/validators/statement-import";

const MONTHS: Record<string, number> = {
  jan: 1, januari: 1, january: 1, feb: 2, februari: 2, february: 2, peb: 2, mar: 3, maret: 3, march: 3,
  apr: 4, april: 4, mei: 5, may: 5, jun: 6, juni: 6, june: 6, jul: 7, juli: 7, july: 7,
  agu: 8, agt: 8, ags: 8, agustus: 8, aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  okt: 10, oktober: 10, oct: 10, october: 10, nov: 11, nop: 11, november: 11, des: 12, desember: 12, dec: 12, december: 12,
};

function toIso(y: number, m: number, d: number): string | null {
  if (y < 100) y += 2000;
  if (y < 1990 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCMonth() === m - 1 ? date.toISOString().slice(0, 10) : null;
}

/** Parses a statement date; returns null when the cell is not a date. */
function normalizeDate(raw: string): string | null {
  const trimmed = raw.trim();
  let m = trimmed.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return toIso(+m[1], +m[2], +m[3]);
  m = trimmed.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (m) return toIso(+m[3], +m[2], +m[1]);
  m = trimmed.match(/^(\d{1,2})[\s-]+([A-Za-z]{3,9})\.?[\s-]+(\d{2,4})/);
  if (m && MONTHS[m[2].toLowerCase()]) return toIso(+m[3], MONTHS[m[2].toLowerCase()], +m[1]);
  // Excel serial day number (1900 system), e.g. 45930.
  if (/^\d{5}(\.\d+)?$/.test(trimmed)) {
    const serial = Number(trimmed);
    if (serial > 32874 && serial < 73051) return new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86_400_000).toISOString().slice(0, 10);
  }
  return null;
}

function parseAmountAndType(raw: string): { amount: number; type: "expense" | "income" } {
  const upper = raw.trim().toUpperCase();
  let type: "expense" | "income" = "expense";

  if (upper.includes("CR") || upper.includes("KREDIT") || upper.includes("CREDIT") || upper.startsWith("+")) {
    type = "income";
  } else if (upper.includes("DB") || upper.includes("DEBET") || upper.includes("DEBIT") || upper.startsWith("-")) {
    type = "expense";
  }

  const cleaned = raw.replace(/[^\d.,]/g, "").trim();

  let numericVal = 0;
  if (cleaned.includes(",") && cleaned.includes(".")) {
    const lastComma = cleaned.lastIndexOf(",");
    const lastDot = cleaned.lastIndexOf(".");
    if (lastComma > lastDot) {
      numericVal = parseFloat(cleaned.replace(/\./g, "").replace(",", "."));
    } else {
      numericVal = parseFloat(cleaned.replace(/,/g, ""));
    }
  } else if (cleaned.includes(",")) {
    const parts = cleaned.split(",");
    if (parts.length === 2 && parts[1].length <= 2) {
      numericVal = parseFloat(cleaned.replace(",", "."));
    } else {
      numericVal = parseFloat(cleaned.replace(/,/g, ""));
    }
  } else if (cleaned.includes(".")) {
    const parts = cleaned.split(".");
    if (parts.length === 2 && parts[1].length <= 2) {
      numericVal = parseFloat(cleaned);
    } else {
      numericVal = parseFloat(cleaned.replace(/\./g, ""));
    }
  } else {
    numericVal = parseFloat(cleaned);
  }

  if (isNaN(numericVal) || numericVal < 0) {
    numericVal = 0;
  }

  return { amount: Math.round(numericVal * 100) / 100, type };
}

export const NOT_A_STATEMENT =
  "This file doesn't look like a bank statement. I need a date column and an amount (or debit/credit) column.";

const isDateHeader = (h: string) => /\b(date|tanggal|tgl|posting|transaction date)\b|tanggal/.test(h);
const isDescHeader = (h: string) => /desc|keterangan|uraian|narration|transaksi|detail|remark|berita/.test(h);
const isAmountHeader = (h: string) => /amount|jumlah|nominal|mutasi|nilai/.test(h);
const isDebitHeader = (h: string) => /debit|debet|keluar|withdrawal|\bdb\b/.test(h);
const isCreditHeader = (h: string) => /credit|kredit|masuk|deposit|\bcr\b/.test(h);

/**
 * Reads statement rows from a table (CSV or a sheet). The header row must have a
 * date column and an amount, debit or credit column; rows whose date cannot be
 * read are skipped instead of being dated "today".
 */
function parseStatementTable(rows: string[][]): { transactions: ParsedRawTransaction[]; isStatement: boolean } {
  let headerRowIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const cells = rows[i].map((c) => c.toLowerCase());
    if (cells.some(isDateHeader) && cells.some((c) => isAmountHeader(c) || isDebitHeader(c) || isCreditHeader(c))) {
      headerRowIdx = i;
      break;
    }
  }
  if (headerRowIdx === -1) return { transactions: [], isStatement: false };

  const header = rows[headerRowIdx].map((c) => c.toLowerCase());
  const dateIdx = header.findIndex(isDateHeader);
  let descIdx = header.findIndex(isDescHeader);
  const debitIdx = header.findIndex(isDebitHeader);
  const creditIdx = header.findIndex(isCreditHeader);
  const amountIdx = header.findIndex((h, i) => isAmountHeader(h) && i !== debitIdx && i !== creditIdx);
  if (descIdx === -1) descIdx = header.findIndex((h, i) => h && i !== dateIdx && i !== amountIdx && i !== debitIdx && i !== creditIdx);

  const transactions: ParsedRawTransaction[] = [];
  for (let r = headerRowIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    const date = normalizeDate(row[dateIdx] ?? "");
    if (!date) continue;

    let amount = 0;
    let type: "expense" | "income" = "expense";
    if (debitIdx !== -1 && row[debitIdx] && row[debitIdx] !== "0") {
      const parsed = parseAmountAndType(row[debitIdx]);
      if (parsed.amount > 0) {
        amount = parsed.amount;
        type = "expense";
      }
    }
    if (amount === 0 && creditIdx !== -1 && row[creditIdx] && row[creditIdx] !== "0") {
      const parsed = parseAmountAndType(row[creditIdx]);
      if (parsed.amount > 0) {
        amount = parsed.amount;
        type = "income";
      }
    }
    if (amount === 0 && amountIdx !== -1 && row[amountIdx]) {
      const parsed = parseAmountAndType(row[amountIdx]);
      amount = parsed.amount;
      type = parsed.type;
    }
    if (amount <= 0) continue;

    transactions.push({
      date,
      rawDescription: (descIdx !== -1 ? row[descIdx] ?? "" : "").replace(/\s+/g, " ").trim() || "Transaction",
      amount,
      type,
      currency: "IDR",
    });
  }
  return { transactions, isStatement: true };
}

function splitCsv(csvText: string): string[][] {
  const lines = csvText.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) return [];
  const delimiter = lines[0].includes(";") ? ";" : lines[0].includes("\t") ? "\t" : ",";
  return lines.map((line) => {
    const pattern = new RegExp(`(?:^|${delimiter})(?:"([^"]*(?:""[^"]*)*)"|([^"${delimiter}]*))`, "g");
    const fields: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(line)) !== null) {
      const val = match[1] !== undefined ? match[1].replace(/""/g, '"') : match[2] !== undefined ? match[2] : "";
      fields.push(val.trim());
      if (pattern.lastIndex === match.index) pattern.lastIndex++;
    }
    return fields;
  });
}

export function parseCsvStatement(csvText: string): ParsedRawTransaction[] {
  return parseStatementTable(splitCsv(csvText)).transactions;
}

/** Reads every sheet until one looks like a statement. */
export function parseExcelStatement(buffer: ArrayBuffer | Buffer): ParsedRawTransaction[] {
  return readExcelStatement(buffer).transactions;
}

function readExcelStatement(buffer: ArrayBuffer | Buffer): { transactions: ParsedRawTransaction[]; isStatement: boolean } {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  for (const sheetName of workbook.SheetNames) {
    // Raw values: date cells stay Excel serial numbers (read by normalizeDate),
    // so no locale-dependent formatting; defval fills empty cells.
    const rows = XLSX.utils
      .sheet_to_json<unknown[]>(workbook.Sheets[sheetName], { header: 1, raw: true, defval: "", blankrows: false })
      .map((row) => Array.from(row, (c) => String(c ?? "").trim()));
    const result = parseStatementTable(rows);
    if (result.isStatement) return result;
  }
  return { transactions: [], isStatement: false };
}

export async function parsePdfStatement(buffer: ArrayBuffer | Uint8Array): Promise<ParsedRawTransaction[]> {
  return parsePdfStatementText(await extractPdfText(buffer));
}

export function parsePdfStatementText(fullText: string): ParsedRawTransaction[] {
  const lines =fullText.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);

  const results: ParsedRawTransaction[] = [];
  const linePattern = /^(\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?|\d{4}[/-]\d{1,2}[/-]\d{1,2})\s+(.+?)\s+([\d.,]+(?:\s*(?:CR|DB|KREDIT|DEBET))?)$/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(linePattern);

    if (match) {
      const datePart = match[1];
      const descPart = match[2];
      const amountPart = match[3];

      const { amount, type } = parseAmountAndType(amountPart);
      if (amount > 0) {
        const date = normalizeDate(datePart);
        if (date) {
          results.push({ date, rawDescription: descPart.replace(/\s+/g, " "), amount, type, currency: "IDR" });
        }
      }
      continue;
    }

    const dateMatch = line.match(/^(\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?|\d{4}[/-]\d{1,2}[/-]\d{1,2})/);
    const amountMatch = line.match(/([\d.,]{3,})\s*(CR|DB|KREDIT|DEBET|\+|-)?$/i);

    if (dateMatch && amountMatch) {
      const datePart = dateMatch[1];
      const descPart = line.slice(dateMatch[0].length, line.length - amountMatch[0].length).trim();
      const amountPart = amountMatch[0];

      const { amount, type } = parseAmountAndType(amountPart);
      const date = normalizeDate(datePart);
      if (amount > 0 && descPart.length > 1 && date) {
        results.push({ date, rawDescription: descPart.replace(/\s+/g, " "), amount, type, currency: "IDR" });
      }
    }
  }

  return results;
}

/** Plain text of a PDF (empty for scanned/image-only PDFs). Uses unpdf, no AI. */
export async function extractPdfText(buffer: ArrayBuffer | Uint8Array): Promise<string> {
  // pdf.js takes ownership of (detaches) the bytes it is given, so pass a copy.
  const { text } = await extractText(new Uint8Array(buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)));
  return (Array.isArray(text) ? text.join("\n") : String(text || "")).trim();
}

export async function parseStatementFile(
  buffer: Buffer | ArrayBuffer,
  fileName: string,
  mimeType?: string
): Promise<{ success: boolean; transactions: ParsedRawTransaction[]; error?: string }> {
  const lowerName = fileName.toLowerCase();
  const nodeBuf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(new Uint8Array(buffer));
  const u8 = new Uint8Array(nodeBuf);
  const isPdf = lowerName.endsWith(".pdf") || mimeType === "application/pdf" || nodeBuf.subarray(0, 5).toString("utf-8").startsWith("%PDF");
  const isExcel = /\.(xlsx|xls)$/.test(lowerName) || Boolean(mimeType?.includes("spreadsheet") || mimeType?.includes("excel"));
  const isCsv = lowerName.endsWith(".csv") || Boolean(mimeType?.includes("csv"));

  try {
    if (isPdf) {
      const text = await extractPdfText(u8);
      if (!text) {
        return {
          success: false,
          transactions: [],
          error: "This PDF has no readable text (it looks like a scan). Download the statement from your bank app as PDF, Excel or CSV.",
        };
      }
      const transactions = parsePdfStatementText(text);
      return transactions.length
        ? { success: true, transactions }
        : { success: false, transactions, error: "I couldn't find transaction rows (date, description, amount) in this PDF." };
    }

    if (isExcel || isCsv) {
      const result = isExcel ? readExcelStatement(nodeBuf) : parseStatementTable(splitCsv(nodeBuf.toString("utf-8")));
      if (!result.isStatement) return { success: false, transactions: [], error: NOT_A_STATEMENT };
      return result.transactions.length
        ? { success: true, transactions: result.transactions }
        : { success: false, transactions: [], error: "The statement columns were found, but no rows had a readable date and amount." };
    }

    return { success: false, transactions: [], error: "Use a PDF, Excel (.xlsx/.xls) or CSV bank statement." };
  } catch (error) {
    console.warn("[statement-parser]", error instanceof Error ? error.message : error);
    return { success: false, transactions: [], error: "I couldn't open this file. Make sure it's a valid PDF, Excel or CSV statement." };
  }
}
