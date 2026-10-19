// Seiya's Promise clauses: AI-recommended couple agreements that each partner
// selects and edits. Numeric clauses (cost sharing, discuss first, cooling-off)
// carry the parameters that become the household's finance rules.

export const PROMISE_CLAUSE_KINDS = [
  "common_goal",
  "cost_sharing",
  "discuss_first",
  "cooling_off",
  "family_support",
  "data_privacy",
  "check_in",
  "emergency_fund",
  "custom",
] as const;

export type PromiseClauseKind = (typeof PROMISE_CLAUSE_KINDS)[number];

export interface PromiseClauseParams {
  /** cost_sharing: share of household owner (partner A), 0-100. */
  ownerPercent?: number;
  /** discuss_first / cooling_off: amount in the household base currency. */
  threshold?: number;
  /** cooling_off: hold duration in hours, 1-72. */
  hours?: number;
}

export interface PromiseClause {
  id: string;
  kind: PromiseClauseKind;
  category: string;
  title: string;
  description: string;
  /** Completes the sentence "Seiya will …" (without the prefix). */
  seiyaWill: string;
  params?: PromiseClauseParams;
}

type ValidationResult<T> = { ok: true; data: T } | { ok: false; message: string };

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function wholeNumber(value: unknown, min: number, max: number): number | undefined {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(n)) return undefined;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function sanitizeParams(kind: PromiseClauseKind, raw: unknown): PromiseClauseParams | undefined {
  if (!isObject(raw)) return undefined;
  if (kind === "cost_sharing") {
    const ownerPercent = wholeNumber(raw.ownerPercent, 0, 100);
    return ownerPercent === undefined ? undefined : { ownerPercent };
  }
  if (kind === "discuss_first") {
    const threshold = wholeNumber(raw.threshold, 0, 1_000_000_000_000);
    return threshold === undefined ? undefined : { threshold };
  }
  if (kind === "cooling_off") {
    const threshold = wholeNumber(raw.threshold, 0, 1_000_000_000_000);
    const hours = wholeNumber(raw.hours, 1, 72) ?? 8;
    return threshold === undefined ? undefined : { threshold, hours };
  }
  return undefined;
}

/** Normalizes one clause; returns null when it is unusable. */
export function sanitizeClause(value: unknown): PromiseClause | null {
  if (!isObject(value)) return null;
  const id = typeof value.id === "string" && ID_PATTERN.test(value.id) ? value.id : null;
  const kind = PROMISE_CLAUSE_KINDS.includes(value.kind as PromiseClauseKind)
    ? (value.kind as PromiseClauseKind)
    : "custom";
  const title = text(value.title, 160);
  const description = text(value.description, 400);
  const seiyaWill = text(value.seiyaWill, 240).replace(/^seiya will\s+/i, "");
  const category = text(value.category, 80) || "Your own clause";
  if (!id || !title) return null;

  const params = sanitizeParams(kind, value.params);
  return {
    id,
    kind,
    category,
    title,
    description,
    seiyaWill,
    ...(params ? { params } : {}),
  };
}

export function validatePromiseSelection(value: unknown): ValidationResult<PromiseClause[]> {
  const raw = isObject(value) ? value.selected : value;
  if (!Array.isArray(raw)) {
    return { ok: false, message: "selected must be an array of clauses." };
  }
  if (raw.length < 1 || raw.length > 20) {
    return { ok: false, message: "Select between 1 and 20 clauses." };
  }

  const seen = new Set<string>();
  const clauses: PromiseClause[] = [];
  for (const item of raw) {
    const clause = sanitizeClause(item);
    if (!clause) return { ok: false, message: "Every clause needs an id and a title." };
    if (seen.has(clause.id)) return { ok: false, message: "Clause ids must be unique." };
    if (["cost_sharing", "discuss_first", "cooling_off"].includes(clause.kind) && !clause.params) {
      return { ok: false, message: `The "${clause.category}" clause is missing its amount.` };
    }
    seen.add(clause.id);
    clauses.push(clause);
  }
  return { ok: true, data: clauses };
}
