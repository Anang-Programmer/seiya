
export const CHILDREN_CATEGORIES = [
  "none",
  "1_to_5",
  "more_than_5",
  "prefer_not_to_say",
] as const;

export const PARTNER_AWARENESS = [
  "yes_supportive",
  "yes_neutral",
  "yes_concerned",
  "not_told_yet",
  "not_discussed",
  "prefer_not_to_say",
] as const;

export const MONEY_TALK_FREQUENCIES = [
  "never",
  "less_than_monthly",
  "few_times_monthly",
  "weekly",
  "regularly",
  "prefer_not_to_say",
] as const;

export const MONEY_TALK_DURATIONS = [
  "under_15_min",
  "15_30_min",
  "30_60_min",
  "over_60_min",
  "varies",
  "prefer_not_to_say",
] as const;

export const DISCUSSION_STATUSES = [
  "yes",
  "no",
  "not_sure",
  "prefer_not_to_say",
] as const;

export const INCOME_SOURCES = [
  "one_partner",
  "both_partners",
  "other",
  "prefer_not_to_say",
] as const;

export const ACCOUNT_STRUCTURES = [
  "shared",
  "separate",
  "both",
  "not_discussed",
  "other",
  "prefer_not_to_say",
] as const;

export const FINANCIAL_CHALLENGES = [
  "credit_card_debt",
  "installments_or_loans",
  "paylater",
  "family_support",
  "planning_for_child",
  "no_emergency_fund",
  "saving_for_shared_goal",
  "no_urgent_concerns",
  "other",
] as const;

type ValueOf<T extends readonly string[]> = T[number];

export type OnboardingInput = {
  profile: {
    city: string | null;
    country: string | null;
    preferredLanguage: "en" | "id";
  };
  answers: {
    childrenCategory: ValueOf<typeof CHILDREN_CATEGORIES>;
    partner: {
      name: string | null;
      email: string | null;
    };
    partnerAwareness: ValueOf<typeof PARTNER_AWARENESS>;
    moneyTalkFrequency: ValueOf<typeof MONEY_TALK_FREQUENCIES>;
    moneyTalkDuration: ValueOf<typeof MONEY_TALK_DURATIONS>;
    hasDiscussedFamilyFinances: ValueOf<typeof DISCUSSION_STATUSES>;
    incomeSource: ValueOf<typeof INCOME_SOURCES>;
    accountStructure: ValueOf<typeof ACCOUNT_STRUCTURES>;
    financialChallenges: ValueOf<typeof FINANCIAL_CHALLENGES>[];
    otherChallengeDescription: string | null;
  };
};

export type ValidationResult =
  | { ok: true; data: OnboardingInput }
  | { ok: false; message: string };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" &&
    value !== null &&
    !Array.isArray(value);
}

function isOneOf<T extends readonly string[]>(
  value: unknown,
  options: T
): value is T[number] {
  return typeof value === "string" &&
    (options as readonly string[]).includes(value);
}

function optionalText(
  value: unknown,
  maxLength: number
): string | null | undefined {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (typeof value !== "string") return undefined;

  const result = value.trim();

  if (!result) return null;
  if (result.length > maxLength) return undefined;

  return result;
}

export function validateOnboarding(
  value: unknown
): ValidationResult {
  if (!isObject(value)) {
    return { ok: false, message: "Invalid request body." };
  }

  const profile = value.profile;
  const answers = value.answers;

  if (!isObject(profile) || !isObject(answers)) {
    return {
      ok: false,
      message: "Profile and answers are required.",
    };
  }

  const city = optionalText(profile.city, 100);
  const country = optionalText(profile.country, 100);

  if (city === undefined || country === undefined) {
    return {
      ok: false,
      message: "City or country is invalid.",
    };
  }

  if (!isOneOf(profile.preferredLanguage, ["en", "id"] as const)) {
    return {
      ok: false,
      message: "Preferred language must be en or id.",
    };
  }

  const partner = answers.partner;

  if (!isObject(partner)) {
    return {
      ok: false,
      message: "Partner information is required.",
    };
  }

  const partnerName = optionalText(partner.name, 100);
  const partnerEmailValue = optionalText(partner.email, 254);

  if (
    partnerName === undefined ||
    partnerEmailValue === undefined
  ) {
    return {
      ok: false,
      message: "Partner name or email is invalid.",
    };
  }

  const partnerEmail = partnerEmailValue?.toLowerCase() ?? null;

  if (
    partnerEmail &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(partnerEmail)
  ) {
    return {
      ok: false,
      message: "Partner email is invalid.",
    };
  }

  if (!isOneOf(answers.childrenCategory, CHILDREN_CATEGORIES)) {
    return { ok: false, message: "Invalid children category." };
  }

  if (!isOneOf(answers.partnerAwareness, PARTNER_AWARENESS)) {
    return { ok: false, message: "Invalid partner awareness value." };
  }

  if (!isOneOf(answers.moneyTalkFrequency, MONEY_TALK_FREQUENCIES)) {
    return { ok: false, message: "Invalid money talk frequency." };
  }

  if (!isOneOf(answers.moneyTalkDuration, MONEY_TALK_DURATIONS)) {
    return { ok: false, message: "Invalid money talk duration." };
  }

  if (
    !isOneOf(
      answers.hasDiscussedFamilyFinances,
      DISCUSSION_STATUSES
    )
  ) {
    return { ok: false, message: "Invalid discussion status." };
  }

  if (!isOneOf(answers.incomeSource, INCOME_SOURCES)) {
    return { ok: false, message: "Invalid income source." };
  }

  if (!isOneOf(answers.accountStructure, ACCOUNT_STRUCTURES)) {
    return { ok: false, message: "Invalid account structure." };
  }

  if (
    !Array.isArray(answers.financialChallenges) ||
    answers.financialChallenges.length < 1 ||
    answers.financialChallenges.length > FINANCIAL_CHALLENGES.length ||
    !answers.financialChallenges.every((item) =>
      isOneOf(item, FINANCIAL_CHALLENGES)
    ) ||
    new Set(answers.financialChallenges).size !==
      answers.financialChallenges.length
  ) {
    return {
      ok: false,
      message: "Select valid financial challenges.",
    };
  }

  const challenges = answers.financialChallenges as
    ValueOf<typeof FINANCIAL_CHALLENGES>[];

  if (
    challenges.includes("no_urgent_concerns") &&
    challenges.length > 1
  ) {
    return {
      ok: false,
      message:
        '"No urgent financial concerns" cannot be combined with other challenges.',
    };
  }

  const otherDescription = optionalText(
    answers.otherChallengeDescription,
    500
  );

  if (otherDescription === undefined) {
    return {
      ok: false,
      message: "Other challenge description is too long.",
    };
  }

  if (challenges.includes("other") && !otherDescription) {
    return {
      ok: false,
      message: "Please describe your other financial challenge.",
    };
  }

  const { partner: _partner, ...rest } = answers;

  return {
    ok: true,
    data: {
      profile: {
        city,
        country,
        preferredLanguage: profile.preferredLanguage,
      },
      answers: {
        childrenCategory: answers.childrenCategory,
        partner: {
          name: partnerName,
          email: partnerEmail,
        },
        partnerAwareness: answers.partnerAwareness,
        moneyTalkFrequency: answers.moneyTalkFrequency,
        moneyTalkDuration: answers.moneyTalkDuration,
        hasDiscussedFamilyFinances:
          answers.hasDiscussedFamilyFinances,
        incomeSource: answers.incomeSource,
        accountStructure: answers.accountStructure,
        financialChallenges: challenges,
        otherChallengeDescription: otherDescription,
      },
    },
  };
}
