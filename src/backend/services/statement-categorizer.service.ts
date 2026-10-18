import { generateWithFallback } from "@/backend/agents/provider-router";
import type {
  CategorizedTransaction,
  ParsedRawTransaction,
  TransactionCategory,
} from "@/backend/validators/statement-import";

const RULE_PATTERNS: Array<{
  category: TransactionCategory;
  keywords: string[];
}> = [
  {
    category: "Income",
    keywords: ["gaji", "salary", "payroll", "bunga tabungan", "interest", "dividend", "bonus", "transfer masuk"],
  },
  {
    category: "Food & Drinks",
    keywords: [
      "kopi", "coffee", "starbucks", "kenangan", "fore", "janji jiwa", "mcdonald", "kfc",
      "burger", "pizza", "resto", "restaurant", "cafe", "warung", "bakso", "nasi", "mie",
      "grabfood", "gofood", "shopeefood", "bakery", "roti", "breadtalk", "hokben", "solaria",
    ],
  },
  {
    category: "Transportation",
    keywords: [
      "grab", "gojek", "goride", "gocar", "grabride", "grabcar", "maxim", "bluebird",
      "pertamina", "spbu", "shell", "bensin", "gasoline", "toll", "tol", "krl", "mrt",
      "transjakarta", "kereta", "kai", "parkir", "parking", "flight", "garuda", "lion",
    ],
  },
  {
    category: "Bills",
    keywords: [
      "pln", "listrik", "electricity", "pdam", "air", "water", "bpjs", "telkom",
      "indihome", "biznet", "myrepublic", "first media", "wifi", "internet",
      "pulsa", "paket data", "asuransi", "insurance", "prudential", "allianz",
      "netflix", "spotify", "youtube premium", "disney", "icloud", "google storage",
    ],
  },
  {
    category: "Shopping",
    keywords: [
      "tokopedia", "shopee", "lazada", "blibli", "tiktok shop", "zalora", "amazon",
      "indomaret", "alfamart", "alfamidi", "superindo", "hypermart", "hero", "grand lucky",
      "uniqlo", "zara", "h&m", "pull&bear", "cotton on", "ikea", "ace hardware", "informa",
    ],
  },
  {
    category: "Health",
    keywords: [
      "apotek", "pharmacy", "kimia farma", "k24", "guardian", "watsons", "halodoc",
      "alodokter", "rumah sakit", "hospital", "rsia", "rsud", "klinik", "clinic",
      "dokter", "doctor", "lab", "laboratorium", "prodia", "optik", "dental", "gigi",
    ],
  },
  {
    category: "Social",
    keywords: [
      "wedding", "nikahan", "kondangan", "sumbangan", "donasi", "sedekah", "zakat",
      "kitabisa", "kado", "hadiah", "gift", "ulang tahun", "birthday",
    ],
  },
];

export function cleanRawTitle(rawDesc: string): string {
  let cleaned = rawDesc
    .replace(/^(TRSF|TRANSFER|PEMBELIAN|PAYMENT|PEMBAYARAN|DB|CR|QR|QRIS|BI-FAST|LLG|RTGS)\s+/gi, "")
    .replace(/\b(E-BKG|M-BKG|VA|VIRTUAL ACCOUNT|SWITCHING|ATM|EDC)\b/gi, "")
    .replace(/\d{8,}/g, "")
    .replace(/[/-]\s*\w+\s*[/-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (cleaned.length < 3) {
    cleaned = rawDesc.trim();
  }

  const words = cleaned.split(" ").slice(0, 5);
  return words.join(" ").slice(0, 100);
}

export function categorizeRuleBased(item: ParsedRawTransaction): CategorizedTransaction {
  if (item.type === "income") {
    return {
      date: item.date,
      title: cleanRawTitle(item.rawDescription),
      rawDescription: item.rawDescription,
      amount: item.amount,
      type: "income",
      category: "Income",
      currency: item.currency || "IDR",
      confidence: 0.9,
    };
  }

  const lowerDesc = item.rawDescription.toLowerCase();

  for (const rule of RULE_PATTERNS) {
    if (rule.keywords.some((kw) => lowerDesc.includes(kw))) {
      return {
        date: item.date,
        title: cleanRawTitle(item.rawDescription),
        rawDescription: item.rawDescription,
        amount: item.amount,
        type: "expense",
        category: rule.category,
        currency: item.currency || "IDR",
        confidence: 0.85,
      };
    }
  }

  return {
    date: item.date,
    title: cleanRawTitle(item.rawDescription),
    rawDescription: item.rawDescription,
    amount: item.amount,
    type: "expense",
    category: "Others",
    currency: item.currency || "IDR",
    confidence: 0.5,
  };
}

export async function categorizeTransactionsWithAi(
  items: ParsedRawTransaction[]
): Promise<CategorizedTransaction[]> {
  if (items.length === 0) return [];

  const uncategorized = items.map((item, index) => ({
    index,
    item,
    ruleResult: categorizeRuleBased(item),
  }));

  const needsAi = uncategorized.filter((u) => u.ruleResult.confidence && u.ruleResult.confidence < 0.8);

  if (needsAi.length === 0) {
    return uncategorized.map((u) => u.ruleResult);
  }

  const batchToAi = needsAi.slice(0, 30);
  const promptList = batchToAi.map((b) => ({
    id: b.index,
    desc: b.item.rawDescription,
    amount: b.item.amount,
    type: b.item.type,
  }));

  try {
    const aiResponse = await generateWithFallback({
      messages: [
        {
          role: "system",
          content:
            "You are a specialized financial statement transaction categorizer. " +
            "Analyze raw bank transaction descriptions and map each to a concise clean merchant/purpose title " +
            "and one category from: ['Food & Drinks', 'Shopping', 'Bills', 'Transportation', 'Health', 'Social', 'Others', 'Income']. " +
            "Return strictly a JSON array of objects with keys: id (number), title (string max 50 chars), category (string).",
        },
        {
          role: "user",
          content: JSON.stringify(promptList),
        },
      ],
      maxOutputTokens: 800,
      totalTimeoutMs: 15_000,
      dataClassification: "private",
    });

    const parsedJsonMatch = aiResponse.text.match(/\[[\s\S]*\]/);
    if (parsedJsonMatch) {
      const parsedArray = JSON.parse(parsedJsonMatch[0]) as Array<{
        id: number;
        title: string;
        category: string;
      }>;

      const aiMap = new Map<number, { title: string; category: TransactionCategory }>();
      const validCategories = new Set([
        "Food & Drinks", "Shopping", "Bills", "Transportation", "Health", "Social", "Others", "Income",
      ]);

      for (const entry of parsedArray) {
        if (typeof entry.id === "number") {
          const category = validCategories.has(entry.category)
            ? (entry.category as TransactionCategory)
            : "Others";
          aiMap.set(entry.id, {
            title: typeof entry.title === "string" ? entry.title.slice(0, 100) : "Transaction",
            category,
          });
        }
      }

      return uncategorized.map((u) => {
        const fromAi = aiMap.get(u.index);
        if (fromAi) {
          return {
            date: u.item.date,
            title: fromAi.title,
            rawDescription: u.item.rawDescription,
            amount: u.item.amount,
            type: u.item.type,
            category: fromAi.category,
            currency: u.item.currency || "IDR",
            confidence: 0.95,
          };
        }
        return u.ruleResult;
      });
    }
  } catch {
    return uncategorized.map((u) => u.ruleResult);
  }

  return uncategorized.map((u) => u.ruleResult);
}
