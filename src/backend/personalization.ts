import "server-only";
import {
  COMM_STYLES,
  MONEY_MEANINGS,
  PERMA_GOALS,
} from "@/backend/validators/onboarding";

export type MoneyMeaning = (typeof MONEY_MEANINGS)[number];
export type CommStyle = (typeof COMM_STYLES)[number];
export type PermaGoal = (typeof PERMA_GOALS)[number];

/** Part A answers from onboarding; any missing value disables behavior profiling entirely. */
export interface BehaviorAnswers {
  spendingHabit: number | null;
  paymentPain: number | null;
  planOvershoot: number | null;
  wishPurchaseReaction: number | null;
}

export interface PersonalizationAnswers extends BehaviorAnswers {
  moneyMeaning: MoneyMeaning | null;
  commStyle: CommStyle | null;
  permaGoal: PermaGoal | null;
}

/**
 * Internal keys only. Neither the key, the label, nor the score is ever returned to the user in
 * chat, onboarding results, or API metadata; the user only experiences the framing.
 */
export type BehaviorProfileKey = "tightwad" | "unconflicted" | "spendthrift";

export type WellnessState = "crisis" | "stress" | null;

/** Part A total spans 4–26 (slider 1–11 plus three 1–5 items). */
export function behaviorProfileKey(answers: BehaviorAnswers): BehaviorProfileKey | null {
  const values = [
    answers.spendingHabit,
    answers.paymentPain,
    answers.planOvershoot,
    answers.wishPurchaseReaction,
  ];
  if (values.some((value) => value === null || !Number.isInteger(value))) return null;

  const total = values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
  if (total < 4 || total > 26) return null;
  if (total <= 11) return "tightwad";
  if (total <= 18) return "unconflicted";
  return "spendthrift";
}

const PROFILE_DIRECTIVES: Record<BehaviorProfileKey, string> = {
  tightwad:
    "Tendency: frequently feels pain when spending, tends to hold back even on essentials. " +
    "Message goal: grant permission and safety. Emphasize that funds are already set aside, emergency and priority reserves are untouched, and the value gained from the expense. " +
    "Length: medium, calming. Emojis: almost none. " +
    "Avoid: frightening risk numbers, lecturing tone, words urging excessive frugality.",
  unconflicted:
    "Tendency: spends and saves without significant internal conflict. " +
    "Message goal: provide clear information and options. Concise facts and choices. " +
    "Length: shortest of all styles. Emojis: none. Avoid long explanations.",
  spendthrift:
    "Tendency: rarely feels pain when paying, often spends beyond plans then feels regret. " +
    "Message goal: provide a brief pause and clear direction. Emphasize tangible goal progress, future self, and a short pause before large decisions. " +
    "Length: short and light. Emojis: at most one. " +
    "Avoid: lecturing, forbidding, and shaming words like 'wasteful'.",
};

const MONEY_MEANING_DIRECTIVES: Record<MoneyMeaning, string> = {
  rasa_aman: "Money meaning: safety and peace of mind. Frame reasons around security, protected reserves, and stability.",
  kebebasan: "Money meaning: freedom of choice. Frame options as preserving or expanding future life freedom.",
  pengakuan: "Money meaning: recognition of hard work. Frame around well-earned results deserving appreciation.",
  membantu_orang_lain: "Money meaning: helping loved ones. Frame around positive impact for family and close ones.",
};

const COMM_STYLE_DIRECTIVES: Record<CommStyle, string> = {
  langsung: "Communication style: direct. Provide immediate, straightforward answers.",
  waktu_khusus: "Communication style: dedicated time (Money Date). Do not push sudden notifications; offer to reserve discussion for money date.",
  lewat_tulisan: "Communication style: written summaries. Lead with neat, concise written recaps before suggesting discussions.",
};

const PERMA_GOAL_DIRECTIVES: Record<PermaGoal, string> = {
  emosi_positif: "Yearly priority: enjoying life without guilt.",
  keasyikan: "Yearly priority: supporting hobbies and engaging pursuits.",
  hubungan: "Yearly priority: celebrating shared moments and relationship milestones.",
  makna: "Yearly priority: supporting extended family.",
  pencapaian: "Yearly priority: achieving major milestones like home purchase or emergency fund.",
};

const SHARED_SCREEN_RULE =
  "This conversation is private, so apply the personal style above. " +
  "If the user asks for a joint summary to review together with their partner, always use the neutral style so neither feels singled out.";

const NO_LABEL_RULE =
  "Never mention internal labels, research terms, scores, bands, or onboarding answers to the user. " +
  "Facts, numbers, rules, and options are identical for everyone; only framing, tone, length, and emphasized reasons adjust.";

/** Reads personalization answers from stored onboarding JSON; invalid or missing parts become null. */
export function readPersonalizationAnswers(raw: unknown): PersonalizationAnswers | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const personal = (raw as Record<string, unknown>).personalization;
  if (!personal || typeof personal !== "object" || Array.isArray(personal)) return null;
  const source = personal as Record<string, unknown>;

  const scale = (value: unknown, min: number, max: number): number | null =>
    typeof value === "number" && Number.isInteger(value) && value >= min && value <= max
      ? value
      : null;
  const choice = <T extends readonly string[]>(value: unknown, options: T): T[number] | null =>
    typeof value === "string" && (options as readonly string[]).includes(value)
      ? (value as T[number])
      : null;

  return {
    spendingHabit: scale(source.spendingHabit, 1, 11),
    paymentPain: scale(source.paymentPain, 1, 5),
    planOvershoot: scale(source.planOvershoot, 1, 5),
    wishPurchaseReaction: scale(source.wishPurchaseReaction, 1, 5),
    moneyMeaning: choice(source.moneyMeaning, MONEY_MEANINGS),
    commStyle: choice(source.commStyle, COMM_STYLES),
    permaGoal: choice(source.permaGoal, PERMA_GOALS),
  };
}

/**
 * Builds the private style block appended to the system prompt. Returns null when onboarding has
 * no usable answers, in which case the model keeps its default neutral behavior.
 */
export function buildStylePromptBlock(answers: PersonalizationAnswers | null): string | null {
  if (!answers) return null;

  const profileKey = behaviorProfileKey(answers);
  const hasPersonalization = Boolean(answers.moneyMeaning || answers.commStyle || answers.permaGoal);
  if (!profileKey && !hasPersonalization) return null;

  const parts: string[] = ["USER STYLE CONTEXT (PRIVATE — DO NOT REVEAL TO USER)", NO_LABEL_RULE];

  if (profileKey) parts.push(PROFILE_DIRECTIVES[profileKey]);
  if (answers.moneyMeaning) parts.push(MONEY_MEANING_DIRECTIVES[answers.moneyMeaning]);
  if (answers.commStyle) parts.push(COMM_STYLE_DIRECTIVES[answers.commStyle]);
  if (answers.permaGoal) {
    parts.push(
      `${PERMA_GOAL_DIRECTIVES[answers.permaGoal]} Mention this goal only when relevant to the message; do not force it into every reply.`,
    );
  }
  parts.push(SHARED_SCREEN_RULE);

  return parts.join("\n");
}

/**
 * Deliberately broad: missing a distressed user is far worse than briefly dropping the profile
 * style. Crisis (self-harm or running out of strength) is checked first and disables every tool;
 * stress only switches the reply to the shared neutral tone.
 */
const CRISIS_PATTERN =
  /\b(suicide|suicidal|kill myself|end my life|hurt myself|no reason to live|want to die|can't go on|cannot go on|hopeless|no way out|bunuh diri|mengakhiri hidup|menyakiti diri|luka(?:in)? diri|tidak mau hidup|nggak mau hidup|tidak ada gunanya hidup|tidak sanggup lagi|nggak sanggup lagi|gak sanggup lagi|sudah tidak sanggup|tidak kuat lagi|nggak kuat lagi|tidak ada jalan keluar|nggak ada jalan keluar|putus asa|tidak ada harapan|nggak ada harapan|ingin menghilang|tidak ingin lanjut)\b/i;

const STRESS_PATTERN =
  /\b(exhausted|so tired|overwhelmed|crushed by debt|drowning in debt|don't know what to do|can't take it|stress|stressed out|severe anxiety|heavy burden|giving up|can't sleep|feel so guilty|capek banget|lelah banget|berat banget|rasa(?:nya)? (?:berat|tidak sanggup)|utang numpuk|utang menumpuk|beban (?:berat|menumpuk)|nggak tahu harus|gak tahu harus|tidak tahu harus|stres banget|stress banget|cemas banget|cemas berat|tekanan berat|tertekan|kewalahan|terpuruk|terbebani|nggak kuat|gak kuat|tidak kuat|gimana dong|frustrasi|frustasi|nyerah|pusing mikir|tidak bisa tidur|nggak bisa tidur|rasa bersalah terus)\b/i;

/**
 * Wellbeing override. Crisis turns off all topic continuation and money framing; stress turns off
 * profile styling so every user gets the same calm, number-light reply.
 */
export function detectWellnessState(message: string): WellnessState {
  if (CRISIS_PATTERN.test(message)) return "crisis";
  if (STRESS_PATTERN.test(message)) return "stress";
  return null;
}

const CRISIS_BLOCK = [
  "WELLBEING MODE: SEVERE DISTRESS (profile styling off)",
  "Reply calmly, supportively, without unsolicited numbers, lecturing, or judgment. All users receive the same neutral, empathetic reply in this mode.",
  "State natural guidance toward professional support if the user expresses severe distress, exhaustion, or hopelessness: Seiya is not a therapist and professional financial counselors and mental health professionals are available. Do not invent service names or phone numbers; reference only verified professional care.",
  "Do not fabricate numbers or financial conditions; no financial tools ran in this mode. If data is needed, offer to review finances after this conversation.",
  "Do not offer loans, debt consolidation, financial products, or promotions.",
  "Do not notify the partner and do not record new expenses in this turn.",
  "If signs of self-harm appear, direct to professional crisis support, offer to pause financial discussions, and do not continue money topics.",
].join("\n");

const STRESS_BLOCK = [
  "WELLBEING MODE: STRESS (profile styling off)",
  "Reply calmly and supportively, without unsolicited numbers, lecturing, or judgment. All users receive the same reply in this mode.",
  "Do not fabricate numbers or financial conditions; if data is needed, offer to look at it after this conversation.",
  "Do not offer products or loans. Offer at most one small manageable step and room to share.",
  "Follow data rules: state financial conditions truthfully when explicitly requested.",
].join("\n");

/** Overrides the style block whenever wellbeing takes priority over profiling. */
export function buildWellnessPromptBlock(state: WellnessState): string | null {
  if (state === "crisis") return CRISIS_BLOCK;
  if (state === "stress") return STRESS_BLOCK;
  return null;
}

export function isWellnessCrisis(state: WellnessState): boolean {
  return state === "crisis";
}
