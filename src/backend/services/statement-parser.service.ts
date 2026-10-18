import * as XLSX from "xlsx";
import { extractText } from "unpdf";
import type { ParsedRawTransaction } from "@/backend/validators/statement-import";

function normalizeDate(raw: string): string {
  const trimmed = raw.trim();
  const isoMatch = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (isoMatch) {
    const y = isoMatch[1];
    const m = isoMatch[2].padStart(2, "0");
    const d = isoMatch[3].padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  const dmyMatch = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/);
  if (dmyMatch) {
    const d = dmyMatch[1].padStart(2, "0");
    const m = dmyMatch[2].padStart(2, "0");
    let y = dmyMatch[3];
    if (y.length === 2) y = `20${y}`;
    return `${y}-${m}-${d}`;
  }

  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return new Date().toISOString().slice(0, 10);
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

export function parseCsvStatement(csvText: string): ParsedRawTransaction[] {
  const lines = csvText.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) return [];

  const delimiter = lines[0].includes(";") ? ";" : lines[0].includes("\t") ? "\t" : ",";

  const rows = lines.map((line) => {
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

  const header = rows[0].map((h) => h.toLowerCase());
  let dateIdx = header.findIndex((h) => h.includes("date") || h.includes("tanggal") || h.includes("tgl"));
  let descIdx = header.findIndex((h) => h.includes("desc") || h.includes("keterangan") || h.includes("uraian") || h.includes("narration") || h.includes("transaksi") || h.includes("detail"));
  let amountIdx = header.findIndex((h) => h.includes("amount") || h.includes("jumlah") || h.includes("nominal") || h.includes("mutasi"));
  const debitIdx = header.findIndex((h) => h.includes("debit") || h.includes("debet") || h.includes("keluar"));
  const creditIdx = header.findIndex((h) => h.includes("credit") || h.includes("kredit") || h.includes("masuk"));

  if (dateIdx === -1) dateIdx = 0;
  if (descIdx === -1) descIdx = 1;
  if (amountIdx === -1 && debitIdx === -1 && creditIdx === -1) amountIdx = 2;

  const results: ParsedRawTransaction[] = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (row.length <= Math.max(dateIdx, descIdx)) continue;

    const rawDate = row[dateIdx] || "";
    const rawDesc = row[descIdx] || "";
    if (!rawDate && !rawDesc) continue;

    let amount = 0;
    let type: "expense" | "income" = "expense";

    if (debitIdx !== -1 && row[debitIdx] && row[debitIdx] !== "0") {
      const parsed = parseAmountAndType(row[debitIdx]);
      if (parsed.amount > 0) {
        amount = parsed.amount;
        type = "expense";
      }
    }

    if (creditIdx !== -1 && row[creditIdx] && row[creditIdx] !== "0" && amount === 0) {
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

    if (amount > 0) {
      results.push({
        date: normalizeDate(rawDate),
        rawDescription: rawDesc.replace(/\s+/g, " "),
        amount,
        type,
        currency: "IDR",
      });
    }
  }

  return results;
}

export function parseExcelStatement(buffer: ArrayBuffer | Buffer): ParsedRawTransaction[] {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];

  const worksheet = workbook.Sheets[sheetName];
  const rawRows: Array<Array<string | number>> = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
  if (rawRows.length < 2) return [];

  let headerRowIdx = -1;
  for (let i = 0; i < Math.min(rawRows.length, 15); i++) {
    const strRow = rawRows[i].map((c) => String(c || "").toLowerCase());
    if (
      strRow.some((c) => c.includes("date") || c.includes("tanggal") || c.includes("tgl")) &&
      strRow.some((c) => c.includes("desc") || c.includes("keterangan") || c.includes("uraian") || c.includes("nominal") || c.includes("amount") || c.includes("jumlah") || c.includes("mutasi"))
    ) {
      headerRowIdx = i;
      break;
    }
  }

  if (headerRowIdx === -1) headerRowIdx = 0;

  const header = rawRows[headerRowIdx].map((c) => String(c || "").toLowerCase());
  let dateIdx = header.findIndex((h) => h.includes("date") || h.includes("tanggal") || h.includes("tgl"));
  let descIdx = header.findIndex((h) => h.includes("desc") || h.includes("keterangan") || h.includes("uraian") || h.includes("narration") || h.includes("transaksi") || h.includes("detail"));
  let amountIdx = header.findIndex((h) => h.includes("amount") || h.includes("jumlah") || h.includes("nominal") || h.includes("mutasi"));
  const debitIdx = header.findIndex((h) => h.includes("debit") || h.includes("debet") || h.includes("keluar"));
  const creditIdx = header.findIndex((h) => h.includes("credit") || h.includes("kredit") || h.includes("masuk"));

  if (dateIdx === -1) dateIdx = 0;
  if (descIdx === -1) descIdx = 1;
  if (amountIdx === -1 && debitIdx === -1 && creditIdx === -1) amountIdx = 2;

  const results: ParsedRawTransaction[] = [];

  for (let r = headerRowIdx + 1; r < rawRows.length; r++) {
    const row = rawRows[r];
    if (!row || row.length <= Math.max(dateIdx, descIdx)) continue;

    const rawDate = String(row[dateIdx] || "");
    const rawDesc = String(row[descIdx] || "");
    if (!rawDate && !rawDesc) continue;

    let amount = 0;
    let type: "expense" | "income" = "expense";

    if (debitIdx !== -1 && row[debitIdx] !== undefined) {
      const parsed = parseAmountAndType(String(row[debitIdx]));
      if (parsed.amount > 0) {
        amount = parsed.amount;
        type = "expense";
      }
    }

    if (creditIdx !== -1 && row[creditIdx] !== undefined && amount === 0) {
      const parsed = parseAmountAndType(String(row[creditIdx]));
      if (parsed.amount > 0) {
        amount = parsed.amount;
        type = "income";
      }
    }

    if (amount === 0 && amountIdx !== -1 && row[amountIdx] !== undefined) {
      const parsed = parseAmountAndType(String(row[amountIdx]));
      amount = parsed.amount;
      type = parsed.type;
    }

    if (amount > 0) {
      results.push({
        date: normalizeDate(rawDate),
        rawDescription: rawDesc.replace(/\s+/g, " "),
        amount,
        type,
        currency: "IDR",
      });
    }
  }

  return results;
}

export async function parsePdfStatement(buffer: ArrayBuffer | Uint8Array): Promise<ParsedRawTransaction[]> {
  const { text } = await extractText(buffer);
  const fullText = Array.isArray(text) ? text.join("\n") : String(text || "");
  const lines = fullText.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);

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
        results.push({
          date: normalizeDate(datePart),
          rawDescription: descPart.replace(/\s+/g, " "),
          amount,
          type,
          currency: "IDR",
        });
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
      if (amount > 0 && descPart.length > 1) {
        results.push({
          date: normalizeDate(datePart),
          rawDescription: descPart.replace(/\s+/g, " "),
          amount,
          type,
          currency: "IDR",
        });
      }
    }
  }

  return results;
}

export async function parseStatementFile(
  buffer: Buffer | ArrayBuffer,
  fileName: string,
  mimeType?: string
): Promise<{ success: boolean; transactions: ParsedRawTransaction[]; error?: string }> {
  const lowerName = fileName.toLowerCase();
  const nodeBuf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(new Uint8Array(buffer));
  const u8 = new Uint8Array(nodeBuf);

  try {
    if (lowerName.endsWith(".pdf") || mimeType === "application/pdf") {
      const transactions = await parsePdfStatement(u8);
      return { success: true, transactions };
    }

    if (lowerName.endsWith(".xlsx") || lowerName.endsWith(".xls") || mimeType?.includes("spreadsheet") || mimeType?.includes("excel")) {
      const transactions = parseExcelStatement(nodeBuf);
      return { success: true, transactions };
    }

    if (lowerName.endsWith(".csv") || mimeType?.includes("csv") || mimeType?.includes("text")) {
      const text = nodeBuf.toString("utf-8");
      const transactions = parseCsvStatement(text);
      return { success: true, transactions };
    }

    const headerBytes = nodeBuf.slice(0, 5).toString("utf-8");
    if (headerBytes.startsWith("%PDF")) {
      const transactions = await parsePdfStatement(u8);
      return { success: true, transactions };
    }

    const excelTransactions = parseExcelStatement(nodeBuf);
    if (excelTransactions.length > 0) {
      return { success: true, transactions: excelTransactions };
    }

    const textContent = nodeBuf.toString("utf-8");
    const csvTransactions = parseCsvStatement(textContent);
    return { success: true, transactions: csvTransactions };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown file parsing error";
    return { success: false, transactions: [], error: msg };
  }
}
