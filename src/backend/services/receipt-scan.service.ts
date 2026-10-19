import "server-only";
import { AIProviderError } from "@/backend/agents/errors";
import { postJson } from "@/backend/agents/providers/http";
import type { TransactionCategory } from "@/backend/validators/statement-import";
import { findDate, guessCategory, parseAmount } from "@/lib/receipt-text";

// Reads a receipt photo with a vision model and returns a draft expense the
// user confirms in the chat. Receipt photos are private data, so only providers
// that are allowed to see private data are used (Mistral, then OpenRouter).

export type ExpenseCategory = Exclude<TransactionCategory, "Income">;

export interface ReceiptDraft {
  merchant: string | null;
  total: number | null;
  currency: string | null;
  date: string | null;
  category: ExpenseCategory;
}

export interface ReceiptScanResult {
  receipt: ReceiptDraft;
  provider: string;
}

type VisionCall = { id: string; url: string; key: string | undefined; model: string; imageField: "string" | "object" };

const PROMPT =
  "You read shopping receipts. Return ONLY a JSON object with these keys: " +
  '{"merchant": string|null, "total": number|null, "currency": "ISO 4217 code"|null, "date": "YYYY-MM-DD"|null, "category": string|null}. ' +
  "total is the final amount paid (after tax and discounts), as a plain number without separators. " +
  "Indonesian receipts use dots as thousand separators and commas for decimals (98.790 means 98790). " +
  "category is one of: Food & Drinks, Shopping, Bills, Transportation, Health, Social, Others. " +
  "Use null for anything you cannot read. If the image is not a receipt, return all nulls.";

const CATEGORIES: ExpenseCategory[] = ["Food & Drinks", "Shopping", "Bills", "Transportation", "Health", "Social", "Others"];

function visionCalls(): VisionCall[] {
  return [
    {
      id: "mistral",
      url: "https://api.mistral.ai/v1/chat/completions",
      key: process.env.MISTRAL_API_KEY?.trim(),
      model: process.env.SEIYA_AI_MISTRAL_VISION_MODEL?.trim() || "ministral-14b-latest",
      imageField: "string",
    },
    {
      id: "openrouter",
      url: "https://openrouter.ai/api/v1/chat/completions",
      key: process.env.OPENROUTER_API_KEY?.trim(),
      model: process.env.SEIYA_AI_OPENROUTER_VISION_MODEL?.trim() || "nvidia/nemotron-3.5-super-vl:free",
      imageField: "object",
    },
  ].filter((c): c is VisionCall => Boolean(c.key)) as VisionCall[];
}

export function hasReceiptReader() {
  return visionCalls().length > 0;
}

function parseDate(value: unknown): string | null {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim()) ? findDate(value.trim()) : null;
}

function parseCategory(value: unknown, merchant: string | null): ExpenseCategory {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  return CATEGORIES.find((c) => c.toLowerCase() === raw) ?? guessCategory(`${raw} ${merchant ?? ""}`);
}

export function sanitizeReceipt(value: unknown): ReceiptDraft {
  const r = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const merchant = typeof r.merchant === "string" && r.merchant.trim() ? r.merchant.replace(/\s+/g, " ").trim().slice(0, 80) : null;
  const currency = typeof r.currency === "string" && /^[A-Za-z]{3}$/.test(r.currency.trim()) ? r.currency.trim().toUpperCase() : null;
  return {
    merchant,
    total: parseAmount(r.total),
    currency,
    date: parseDate(r.date),
    category: parseCategory(r.category, merchant),
  };
}

function extractJson(text: string): unknown {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

async function callVision(call: VisionCall, imageDataUrl: string): Promise<ReceiptDraft> {
  const data = await postJson<{ choices?: Array<{ message?: { content?: unknown } }> }>(
    call.url,
    { Authorization: `Bearer ${call.key}` },
    {
      model: call.model,
      temperature: 0,
      max_tokens: 300,
      ...(call.id === "mistral" ? { response_format: { type: "json_object" } } : {}),
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: PROMPT },
            call.imageField === "string"
              ? { type: "image_url", image_url: imageDataUrl }
              : { type: "image_url", image_url: { url: imageDataUrl } },
          ],
        },
      ],
    },
    20_000
  );
  const content = data.choices?.[0]?.message?.content;
  const text = typeof content === "string" ? content : Array.isArray(content) ? content.map((p) => (p as { text?: string })?.text ?? "").join("") : "";
  const parsed = extractJson(text);
  if (!parsed) throw new AIProviderError("Vision model returned no JSON", { retryable: true, providerUnavailable: false });
  return sanitizeReceipt(parsed);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function scanReceipt(imageDataUrl: string): Promise<ReceiptScanResult> {
  let lastError: unknown = null;
  for (const call of visionCalls()) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return { receipt: await callVision(call, imageDataUrl), provider: call.id };
      } catch (error) {
        lastError = error;
        // One short retry on a rate limit; otherwise move to the next provider.
        if (attempt === 0 && error instanceof AIProviderError && error.status === 429) {
          await sleep(1500);
          continue;
        }
        break;
      }
    }
  }
  throw lastError ?? new Error("No receipt reader configured");
}
