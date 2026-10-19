import "server-only";
import { generateWithFallback } from "@/backend/agents/provider-router";
import {
  sanitizeClause,
  type PromiseClause,
  type PromiseClauseKind,
} from "@/backend/validators/promise";

// Inputs come from both partners' latest onboarding answers. They are private,
// so generation only ever runs server-side and uses the private-data providers.
export interface PartnerContext {
  role: "partner_a" | "partner_b";
  name: string;
  answers: Record<string, unknown> | null;
}

export interface GeneratedPromise {
  clauses: PromiseClause[];
  generatedBy: string;
}

const REQUIRED_KINDS: PromiseClauseKind[] = [
  "common_goal",
  "cost_sharing",
  "discuss_first",
  "cooling_off",
  "family_support",
  "data_privacy",
  "check_in",
  "emergency_fund",
];

// Sensible default amounts per currency, used when neither partner gave one.
function defaultThreshold(currency: string) {
  const defaults: Record<string, number> = {
    IDR: 1_000_000,
    USD: 100,
    EUR: 100,
    GBP: 100,
    SGD: 200,
    AUD: 200,
    CAD: 200,
    JPY: 10_000,
    CNY: 500,
  };
  return defaults[currency] ?? 100;
}

function pick(answers: Record<string, unknown> | null, path: string[]): unknown {
  let cur: unknown = answers;
  for (const key of path) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

function partnerSummary(p: PartnerContext, currency: string) {
  const expenses = Array.isArray(p.answers?.recentExpenses) ? (p.answers!.recentExpenses as Array<Record<string, unknown>>) : [];
  const spend = expenses.reduce((sum, e) => sum + (typeof e.amount === "number" ? e.amount : 0), 0);
  return {
    role: p.role === "partner_a" ? "Partner A (household owner)" : "Partner B",
    name: p.name,
    accountStructure: pick(p.answers, ["accountStructure"]),
    financialChallenges: pick(p.answers, ["financialChallenges"]),
    hasDiscussedFamilyFinances: pick(p.answers, ["hasDiscussedFamilyFinances"]),
    personalization: pick(p.answers, ["personalization"]),
    profiling: pick(p.answers, ["profiling"]),
    recentExpenses: {
      count: expenses.length,
      total: Math.round(spend),
      currency,
      categories: Array.from(new Set(expenses.map((e) => String(e.category ?? "")).filter(Boolean))).slice(0, 8),
    },
  };
}

/**
 * The "discuss first" amount the partners chose in onboarding (screen 17), in
 * the household currency. When both answered, the lower (more careful) one wins.
 */
export function answeredThreshold(partners: PartnerContext[], currency: string): number | null {
  const amounts = partners
    .map((p) => {
      const amount = pick(p.answers, ["profiling", "discussionThreshold"]);
      const answerCurrency = pick(p.answers, ["profiling", "discussionThresholdCurrency"]);
      return typeof amount === "number" && amount > 0 && answerCurrency === currency ? amount : null;
    })
    .filter((a): a is number => a !== null);
  return amounts.length ? Math.min(...amounts) : null;
}

/** Deterministic recommendation used when no AI provider is reachable. */
export function templateClauses(partners: PartnerContext[], currency: string): PromiseClause[] {
  const threshold = answeredThreshold(partners, currency) ?? defaultThreshold(currency);
  const oneIncome = partners.some((p) => pick(p.answers, ["incomeSource"]) === "one_partner");
  const supportsFamily = partners.some((p) =>
    (pick(p.answers, ["financialChallenges"]) as string[] | undefined)?.includes?.("family_support")
  );
  return [
    {
      id: "common_goal",
      kind: "common_goal",
      category: "Common goals · Relationships & Achievements",
      title: "We agree on one shared goal and review it together every month",
      description: "Your values and goals will be aligned once your profile is complete",
      seiyaWill: "show progress and remind you when you're starting to fall behind on your plan",
    },
    {
      id: "cost_sharing",
      kind: "cost_sharing",
      category: "Cost sharing",
      title: oneIncome ? "Shared costs are split 60:40 based on income" : "Shared costs are split 50:50",
      description: "It can be 50:50 or proportional, without considering who the main breadwinner is",
      seiyaWill: "calculate each person's portion every month",
      params: { ownerPercent: oneIncome ? 60 : 50 },
    },
    {
      id: "discuss_first",
      kind: "discuss_first",
      category: "Discuss first",
      title: "Shared purchases above the limit need the other partner's approval",
      description: "Seiya reminds the person who transacted, not to report it to the partner",
      seiyaWill: "give a pause before the purchase crosses the line",
      params: { threshold },
    },
    {
      id: "cooling_off",
      kind: "cooling_off",
      category: "Cooling-off · Healthy habits",
      title: "Big late-night purchases wait until the next morning",
      description: "Impulse purchases above the limit are held before they go through",
      seiyaWill: "hold the purchase and ask again once the cooling-off period ends",
      params: { threshold: threshold * 2, hours: 8 },
    },
    {
      id: "family_support",
      kind: "family_support",
      category: "Extended family support · Relationships & Meaning",
      title: supportsFamily ? "Family support has an agreed monthly amount" : "Family support is discussed before it is given",
      description: "The frequency and limits will only be determined after you have reviewed it together",
      seiyaWill: "record the realization and mark if it goes beyond the agreement.",
    },
    {
      id: "data_privacy",
      kind: "data_privacy",
      category: "Data privacy",
      title: "Personal spending details stay private; only totals are shared",
      description: "Private data never enters the shared summary",
      seiyaWill: "enforce sharing limits directly at the data layer",
    },
    {
      id: "check_in",
      kind: "check_in",
      category: "Check-in rhythm · Relationships",
      title: "We hold a short money check-in every Sunday evening",
      description: "Delivered at a specific time so that the conversation doesn't feel sudden",
      seiyaWill: "prepare a neutral summary and one topic to discuss",
    },
    {
      id: "emergency_fund",
      kind: "emergency_fund",
      category: "Safety net · Security",
      title: "We build an emergency fund before any big shared purchase",
      description: "Covers at least three months of household costs",
      seiyaWill: "track the fund and tell you both when it reaches each milestone",
    },
  ];
}

function parseClauses(raw: string): PromiseClause[] {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[0]) as { clauses?: unknown };
    if (!Array.isArray(parsed.clauses)) return [];
    return parsed.clauses.map(sanitizeClause).filter((c): c is PromiseClause => c !== null);
  } catch {
    return [];
  }
}

/**
 * Asks Seiya's AI for one shared set of clauses based on both partners'
 * onboarding. Any kind the model leaves out (or gets wrong) is filled from the
 * deterministic template, so the result always has the numeric clauses.
 */
export async function generatePromiseClauses(partners: PartnerContext[], currency: string): Promise<GeneratedPromise> {
  const template = templateClauses(partners, currency);

  try {
    const ai = await generateWithFallback({
      messages: [
        {
          role: "system",
          content:
            "You are Seiya, a neutral financial mediator for couples. Draft 'Seiya's Promise': short, kind, " +
            "practical money agreements that BOTH partners will review. Base them on both partners' profiles. " +
            "Return ONLY JSON: {\"clauses\":[{\"id\",\"kind\",\"category\",\"title\",\"description\",\"seiyaWill\",\"params\"}]}. " +
            `Use exactly these kinds once each, and use the kind as the id: ${REQUIRED_KINDS.join(", ")}. ` +
            "title: one specific agreement sentence (max 90 chars). description: why it helps (max 160 chars). " +
            "seiyaWill: what the app will do, completing the sentence 'Seiya will …' WITHOUT those two words (max 110 chars). " +
            "category: short label such as 'Cost sharing', 'Discuss first', 'Common goals · Relationships & Achievements'. " +
            `params: cost_sharing needs {"ownerPercent": integer 0-100, share paid by Partner A}; ` +
            `discuss_first needs {"threshold": integer amount in ${currency}} — use the partners' profiling.discussionThreshold when given (the lower one if both answered); ` +
            `cooling_off needs {"threshold": integer amount in ${currency}, "hours": integer 1-72}. Other kinds have no params. ` +
            "Mention amounts in titles exactly as in params. Write in English. Never invent private details.",
        },
        {
          role: "user",
          content: JSON.stringify({ currency, partners: partners.map((p) => partnerSummary(p, currency)) }),
        },
      ],
      maxOutputTokens: 1600,
      temperature: 0.4,
      totalTimeoutMs: 25_000,
      dataClassification: "private",
    });

    const fromAi = parseClauses(ai.text);
    const byKind = new Map<PromiseClauseKind, PromiseClause>();
    for (const clause of fromAi) {
      if (REQUIRED_KINDS.includes(clause.kind) && !byKind.has(clause.kind)) {
        const needsParams = ["cost_sharing", "discuss_first", "cooling_off"].includes(clause.kind);
        if (!needsParams || clause.params) byKind.set(clause.kind, { ...clause, id: clause.kind });
      }
    }

    if (byKind.size >= 4) {
      // The partners' own "discuss first" answer is explicit, so it beats the model's guess.
      const answered = answeredThreshold(partners, currency);
      const discuss = byKind.get("discuss_first");
      if (answered !== null && discuss && discuss.params?.threshold !== answered) {
        const amount = new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(answered);
        byKind.set("discuss_first", {
          ...discuss,
          // Keep the sentence and the number in sync when the model used another amount.
          title: /\d/.test(discuss.title) ? `Shared purchases above ${amount} are discussed first` : discuss.title,
          params: { threshold: answered },
        });
      }
      const clauses = REQUIRED_KINDS.map((kind) => byKind.get(kind) ?? template.find((t) => t.kind === kind)!);
      return { clauses, generatedBy: `${ai.provider}:${ai.model}` };
    }
  } catch (error) {
    console.warn("[promise] AI generation failed, using template:", error instanceof Error ? error.message : error);
  }

  return { clauses: template, generatedBy: "template" };
}
