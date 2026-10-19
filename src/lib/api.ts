"use client";

// Thin client for the Seiya Next.js API routes. Every call goes to the same
// origin so the Supabase Auth cookies travel with the request automatically.

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

type Json = Record<string, unknown>;

async function request<T = Json>(
  path: string,
  init: { method?: string; body?: unknown; formData?: FormData } = {}
): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  let body: BodyInit | undefined;

  if (init.formData) {
    body = init.formData;
  } else if (init.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(init.body);
  }

  let res: Response;
  try {
    res = await fetch(path, {
      method: init.method ?? (body ? "POST" : "GET"),
      headers,
      body,
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    throw new ApiError("Network error. Please check your connection and try again.", 0);
  }

  let payload: Json = {};
  try {
    payload = (await res.json()) as Json;
  } catch {
    // Non-JSON responses fall through to the status check below.
  }

  if (!res.ok || payload.success === false) {
    const message =
      typeof payload.message === "string" && payload.message
        ? payload.message
        : `Request failed (${res.status}).`;
    throw new ApiError(message, res.status, typeof payload.code === "string" ? payload.code : undefined);
  }

  return payload as T;
}

export function newIdempotencyKey(prefix = "seiya") {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${random}`.slice(0, 80);
}

// ---------------------------------------------------------------------------
// API response shapes (raw, as returned by the routes)
// ---------------------------------------------------------------------------

export interface ApiMeResponse {
  success: true;
  user: { id: string; email: string | null };
  profile: {
    id: string;
    full_name: string | null;
    city: string | null;
    country: string | null;
    preferred_language: string | null;
    children_count: number | null;
  };
  household: {
    id: string;
    name: string;
    country: string | null;
    base_currency: string;
    status: string;
    myRole: "owner" | "partner";
    partner: { userId: string; fullName: string | null; role: "owner" | "partner" } | null;
  } | null;
  hasPin: boolean;
}

export interface ApiWallet {
  id: string;
  household_id: string;
  wallet_type: "shared" | "personal";
  owner_user_id: string | null;
  name: string | null;
  currency: string;
  simulated_balance: number | string;
  status: string;
}

export interface ApiTransaction {
  id: string;
  household_id: string;
  wallet_id: string | null;
  created_by: string | null;
  transaction_type: "income" | "expense" | string;
  category: string | null;
  description: string | null;
  amount: number | string;
  currency: string;
  status: string;
  hold_until: string | null;
  occurred_at: string | null;
  created_at: string;
}

export interface ApiBill {
  id: string;
  household_id: string;
  created_by: string | null;
  title: string;
  payee: string | null;
  amount: number | string;
  currency: string;
  due_date: string;
  recurrence: "none" | "weekly" | "monthly" | "yearly";
  status: "upcoming" | "paid" | "pending_approval" | "overdue" | string;
  display_status?: string;
  notes: string | null;
}

export interface ApiApproval {
  id: string;
  title: string;
  amount: number;
  currency: string;
  wallet: "shared" | "personal_a" | "personal_b";
  requester: "partner_a" | "partner_b";
  approver: "partner_a" | "partner_b";
  status: "pending" | "approved" | "declined" | "cancelled" | "expired";
  reason: string;
  createdAt: string;
  expiresInHours: number;
  category?: string;
  type?: string;
  targetId?: string | null;
  notes?: string | null;
}

export interface ApiPlan {
  id: string;
  title: string;
  category: string;
  targetAmount: number;
  currentAmount: number;
  currency: string;
  targetDate: string;
  recommendedMonthly: number;
  splitRecommendation: { partnerB: number; partnerA: number };
  walletFunding: string;
  status: string;
  assumptions: string | null;
}

export interface ApiActivity {
  id: string;
  title: string;
  category: string;
  actor: "partner_a" | "partner_b" | "seiya";
  status: "ALLOW" | "NEED_APPROVAL" | "HOLD" | "DENY" | "INFO";
  amount?: number;
  currency?: string;
  reason: string;
  timestamp: string;
}

export interface ApiHeldPurchase {
  id: string;
  title: string;
  amount: number;
  currency: string;
  wallet: "shared" | "personal_a" | "personal_b";
  requester: "partner_a" | "partner_b";
  status: "held" | "released" | "cancelled";
  holdUntil: string;
  holdUntilDisplay?: string;
  reason: string;
  createdAt: string;
}

export interface ApiFinanceRuleSet {
  walletMode: "shared_only" | "shared_and_personal" | "separate_only";
  expenseSplit: { mode: "equal" | "custom"; ownerPercent: number; partnerPercent: number };
  approval: {
    requirePartnerApprovalAboveThreshold: boolean;
    sharedWalletThreshold: number;
    approveEverySharedPurchase?: boolean;
  };
  coolingOff: { enabled: boolean; threshold: number; durationHours: number };
}

export interface ApiFinanceRule {
  id: string;
  household_id: string;
  version: number;
  created_by: string;
  rules: ApiFinanceRuleSet;
  status: "pending_approval" | "active" | "rejected" | "superseded" | string;
  created_at: string;
  activated_at: string | null;
}

export interface ApiFinanceRuleApproval {
  id: string;
  rule_id: string;
  user_id: string;
  decision: "pending" | "approved" | "rejected" | string;
  decided_at: string | null;
  note: string | null;
}

export interface ApiGatewayDecision {
  outcome: "ALLOW" | "NEED_APPROVAL" | "HOLD" | "DENY";
  reason_code: string;
  reason: string;
  details?: Record<string, unknown>;
}

export interface ApiChatResponse {
  success: true;
  message: string;
  cardType?: string;
  cardData?: Record<string, unknown>;
  conversationId: string | null;
  historySaved: boolean;
  warning?: string;
}

export interface OnboardingPayload {
  profile: { city: string | null; country: string | null; preferredLanguage: "en" | "id" };
  answers: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Auth & security
// ---------------------------------------------------------------------------

// Accounts sign in with their full name as a unique username.
export const apiSignUp = (fullName: string, password: string) =>
  request<{ success: true; message: string; needsEmailConfirmation: boolean; user: { id: string; fullName: string } }>(
    "/api/auth/signup",
    { body: { fullName, password } }
  );

export const apiSignIn = (fullName: string, password: string) =>
  request<{ success: true; user: { id: string; fullName: string } }>("/api/auth/signin", {
    body: { fullName, password },
  });

export const apiSignOut = () => request("/api/auth/signout", { method: "POST" });

export const apiGetMe = () => request<ApiMeResponse>("/api/auth/me");

export const apiSetupPin = (pin: string) => request("/api/auth/pin/setup", { body: { pin } });

export const apiVerifyPin = (pin: string, userId?: string) =>
  request<{ success: true; valid: boolean }>("/api/auth/pin/verify", {
    body: userId ? { pin, userId } : { pin },
  });

export const apiGetPinStatus = () => request<{ success: true; hasPin: boolean }>("/api/auth/pin/status");

// ---------------------------------------------------------------------------
// Households & partner pairing
// ---------------------------------------------------------------------------

export const apiGetHouseholds = () => request<{ success: true; households: Json[] }>("/api/households");

export const apiCreateHousehold = (name: string, country?: string | null, baseCurrency?: string) =>
  request<{ success: true; household: unknown }>("/api/households", {
    body: { name, country: country ?? null, baseCurrency: baseCurrency ?? "IDR" },
  });

export const apiInvitePartner = (householdId: string, invitedName?: string | null) =>
  request<{ success: true; invitation: unknown; inviteUrl: string }>("/api/households/invitations", {
    body: { householdId, invitedName: invitedName || null },
  });

export const apiAcceptInvitation = (token: string) =>
  request<{ success: true; result: unknown }>("/api/households/invitations/accept", { body: { token } });

// ---------------------------------------------------------------------------
// Wallets & transactions
// ---------------------------------------------------------------------------

export const apiGetWallets = (hid: string) =>
  request<{ success: true; wallets: ApiWallet[] }>(`/api/households/${hid}/wallets`);

export const apiInitializeWallets = (hid: string) =>
  request(`/api/households/${hid}/wallets`, { method: "POST" });

export const apiGetTransactions = (hid: string, limit = 50) =>
  request<{ success: true; transactions: ApiTransaction[] }>(
    `/api/households/${hid}/transactions?limit=${limit}`
  );

export interface CreateTransactionInput {
  walletId: string;
  transactionType: "income" | "expense";
  amount: number;
  description: string;
  category?: string | null;
  idempotencyKey?: string;
}

// Uses the household-scoped route backed by the request_simulated_transaction
// RPC, which applies the couple rules (approval threshold, cooling-off) atomically.
export const apiCreateTransaction = (hid: string, input: CreateTransactionInput) =>
  request<{
    success: true;
    message: string;
    transaction?: ApiTransaction & { requires_approval?: boolean };
    // Set when the engine queued a partner approval for this expense.
    approval_id?: string | null;
    idempotent_replay?: boolean;
  }>(`/api/households/${hid}/transactions`, {
    body: { ...input, idempotencyKey: input.idempotencyKey ?? newIdempotencyKey("tx") },
  });

export const apiUndoTransaction = (transactionId: string) =>
  request(`/api/transactions/${transactionId}/undo`, { method: "POST" });

export const apiExecuteHeldTransaction = (transactionId: string) =>
  request<{ success: true; message: string }>(`/api/transactions/${transactionId}/execute`, { method: "POST" });

export const apiDecideTransaction = (transactionId: string, decision: "approved" | "rejected", note?: string, pin?: string) =>
  request(`/api/transactions/${transactionId}/decision`, { body: { decision, note: note ?? null, ...(pin ? { pin } : {}) } });

// ---------------------------------------------------------------------------
// Bills
// ---------------------------------------------------------------------------

export interface BillInput {
  title: string;
  payee?: string | null;
  amount: number;
  currency: string;
  dueDate: string; // YYYY-MM-DD
  recurrence: "none" | "weekly" | "monthly" | "yearly";
  notes?: string | null;
}

export const apiGetBills = (hid: string) =>
  request<{ success: true; bills: ApiBill[] }>(`/api/households/${hid}/bills`);

export const apiCreateBill = (hid: string, data: BillInput) =>
  request<{ success: true; bill: unknown }>(`/api/households/${hid}/bills`, { body: data });

export const apiUpdateBill = (hid: string, billId: string, data: Partial<BillInput> & { status?: string }) =>
  request(`/api/households/${hid}/bills/${billId}`, { method: "PATCH", body: data });

export const apiDeleteBill = (hid: string, billId: string) =>
  request(`/api/households/${hid}/bills/${billId}`, { method: "DELETE" });

export const apiPayBill = (hid: string, billId: string, walletId: string, idempotencyKey = newIdempotencyKey("bill")) =>
  request<{ success: true; message: string; result: unknown }>(`/api/households/${hid}/bills/${billId}/pay`, {
    body: { walletId, idempotencyKey },
  });

export const apiRequestPayBill = (hid: string, billId: string) =>
  request(`/api/households/${hid}/bills/${billId}/request-pay`, { method: "POST" });

export interface ApiBudget {
  id: string;
  category: string;
  amount: number | string;
  currency: string;
  period_start: string;
  period_end: string;
  spent: number | string;
  usage_percent: number | string;
  over_budget: boolean;
}

export const apiGetBudgets = (hid: string) =>
  request<{ success: true; budgets?: ApiBudget[] }>(`/api/households/${hid}/budgets`);

// ---------------------------------------------------------------------------
// Dual-key approvals
// ---------------------------------------------------------------------------

export const apiGetApprovals = (hid?: string) =>
  request<{ success: true; approvals: ApiApproval[] }>(
    hid ? `/api/households/${hid}/approvals` : "/api/approvals"
  );

export const apiCreateApproval = (data: {
  title: string;
  amount: number;
  currency: string;
  wallet: "shared" | "personal_a" | "personal_b";
  requesterRole: "partner_a" | "partner_b";
  approverRole: "partner_a" | "partner_b";
  category: string;
  type: string;
  reason: string;
  targetId?: string | null;
  notes?: string | null;
  expiresInHours?: number;
}) => request<{ success: true; approval: ApiApproval }>("/api/approvals", { body: data });

export const apiDecideApproval = (
  approvalId: string,
  decision: "approved" | "declined",
  pin?: string,
  reason?: string
) =>
  request<{ success: true; status: string; message: string }>(`/api/approvals/${approvalId}/decision`, {
    body: { decision, ...(pin ? { pin } : {}), ...(reason ? { reason } : {}) },
  });

export const apiCancelApproval = (approvalId: string) =>
  request<{ success: true; status: string; message: string }>(`/api/approvals/${approvalId}/cancel`, { method: "POST" });

// ---------------------------------------------------------------------------
// Plans & goals
// ---------------------------------------------------------------------------

export interface PlanInput {
  title: string;
  category: string;
  targetAmount: number;
  currentAmount: number;
  currency: string;
  targetDate: string;
  recommendedMonthly: number;
  // Sent as an object: the validator only accepts 0-100 for the flat
  // splitPartnerA/B fields, but plans store per-partner monthly amounts.
  splitRecommendation: { partnerB: number; partnerA: number };
  walletFunding: string;
  status: string;
  assumptions: string | null;
}

export const apiGetPlans = (hid?: string) =>
  request<{ success: true; plans: ApiPlan[] }>(hid ? `/api/households/${hid}/plans` : "/api/plans");

export const apiCreatePlan = (hid: string, data: PlanInput) =>
  request<{ success: true; plan: ApiPlan }>(`/api/households/${hid}/plans`, { body: data });

export const apiUpdatePlan = (hid: string, planId: string, data: Partial<PlanInput>) =>
  request<{ success: true; plan: ApiPlan }>(`/api/households/${hid}/plans/${planId}`, {
    method: "PATCH",
    body: data,
  });

export const apiRequestDeletePlan = (hid: string, planId: string, partnerAPin?: string, partnerBPin?: string) =>
  request<{ success: true; requiresApproval?: boolean; message?: string }>(
    `/api/households/${hid}/plans/${planId}/request-delete`,
    { body: { ...(partnerAPin ? { partnerAPin } : {}), ...(partnerBPin ? { partnerBPin } : {}) } }
  );

// ---------------------------------------------------------------------------
// Finance rules (couple contract)
// ---------------------------------------------------------------------------

export const apiGetFinanceRules = (hid: string) =>
  request<{ success: true; rules: ApiFinanceRule[]; approvals: ApiFinanceRuleApproval[] }>(
    `/api/households/${hid}/finance-rules`
  );

export const apiProposeFinanceRules = (hid: string, rules: ApiFinanceRuleSet) =>
  request<{ success: true; rule: unknown }>(`/api/households/${hid}/finance-rules`, { body: { rules } });

export const apiDecideFinanceRule = (hid: string, ruleId: string, decision: "approved" | "rejected", note?: string) =>
  request(`/api/households/${hid}/finance-rules/${ruleId}/decision`, {
    body: { decision, note: note ?? null },
  });

// ---------------------------------------------------------------------------
// Seiya's Promise (AI-recommended couple clauses)
// ---------------------------------------------------------------------------

export type PromiseClauseKind =
  | "common_goal"
  | "cost_sharing"
  | "discuss_first"
  | "cooling_off"
  | "family_support"
  | "data_privacy"
  | "check_in"
  | "emergency_fund"
  | "custom";

export interface PromiseClause {
  id: string;
  kind: PromiseClauseKind;
  category: string;
  title: string;
  description: string;
  /** Completes "Seiya will …" (without the prefix). */
  seiyaWill: string;
  params?: { ownerPercent?: number; threshold?: number; hours?: number };
}

export interface PromiseMemberProgress {
  user_id: string;
  role: "owner" | "partner";
  full_name: string | null;
  onboarding_done: boolean;
  history_done: boolean;
}

export interface PromiseStatus {
  members: PromiseMemberProgress[];
  promise: {
    id: string;
    clauses: PromiseClause[];
    status: "negotiating" | "active";
    generated_by: string | null;
    activated_at: string | null;
  } | null;
  responses: Array<{ user_id: string; selected: PromiseClause[]; submitted_at: string }>;
}

// ---------------------------------------------------------------------------
// Ask Seiya chat history (served from our domain, not straight from Supabase)
// ---------------------------------------------------------------------------

export interface ChatHistoryRow {
  conversations: Array<{ id: string; title: string | null; updated_at: string | null; created_at: string }>;
  messages: Array<{ id: string; conversation_id: string; role: string; content: string; created_at: string }>;
}

export const apiGetChatHistory = (hid: string) =>
  request<{ success: true } & ChatHistoryRow>(`/api/households/${hid}/chat-history`);

export const apiGetPromise = (hid: string) =>
  request<{ success: true; myUserId: string; status: PromiseStatus }>(`/api/households/${hid}/promise`);

export const apiSubmitPromiseResponse = (hid: string, selected: PromiseClause[]) =>
  request<{ success: true; myUserId: string; outcome: "waiting_partner" | "different" | "active"; status: PromiseStatus }>(
    `/api/households/${hid}/promise/response`,
    { body: { selected } }
  );

// ---------------------------------------------------------------------------
// Decision engine & settlement
// ---------------------------------------------------------------------------

export const apiGatewayDecision = (data: {
  actionType: "EXPENSE" | "BILL_PAY" | "PURCHASE" | "EXTERNAL_TRANSFER" | "PRIVACY_REQUEST";
  title: string;
  amount: number;
  currency: string;
  wallet: "shared" | "personal_a" | "personal_b";
  timeOfDay?: string;
  category?: string;
}) => request<{ success: true; decision: ApiGatewayDecision }>("/api/gateway/decision", { body: data });

export const apiGetSettlement = () =>
  request<{ success: true; settlement: { partnerBOwesA: number; partnerAOwesB: number; currency: string } }>(
    "/api/settlement"
  );

export const apiSettleUp = () =>
  request<{ success: true; settlement: { partnerBOwesA: number; partnerAOwesB: number; currency: string } }>(
    "/api/settlement/settle-up",
    { method: "POST" }
  );

// ---------------------------------------------------------------------------
// Waiting list (cooling-off held purchases)
// ---------------------------------------------------------------------------

export const apiGetWaitingList = () =>
  request<{ success: true; heldPurchases: ApiHeldPurchase[] }>("/api/waiting-list");

export const apiCreateHeldPurchase = (data: {
  title: string;
  amount: number;
  currency: string;
  wallet: "shared" | "personal_a" | "personal_b";
  requesterRole: "partner_a" | "partner_b";
  reason: string;
}) => request<{ success: true; heldPurchase: ApiHeldPurchase }>("/api/waiting-list", { body: data });

export const apiContinueHeldPurchase = (heldId: string) =>
  request<{ success: true; outcome?: string; message?: string }>(`/api/waiting-list/${heldId}/continue`, {
    method: "POST",
  });

export const apiCancelHeldPurchase = (heldId: string) =>
  request(`/api/waiting-list/${heldId}/cancel`, { method: "POST" });

// ---------------------------------------------------------------------------
// Activities, AI chat & onboarding
// ---------------------------------------------------------------------------

export const apiGetActivities = () => request<{ success: true; activities: ApiActivity[] }>("/api/activities");

export const apiSendChat = (householdId: string, message: string, conversationId?: string | null) =>
  request<ApiChatResponse>("/api/ai/chat", {
    body: { householdId, message, ...(conversationId ? { conversationId } : {}) },
  });

export const apiSaveOnboarding = (profile: OnboardingPayload["profile"], answers: OnboardingPayload["answers"]) =>
  request("/api/onboarding", { body: { profile, answers } });

export const apiGetOnboarding = () => request<{ success: true; profile: unknown; onboarding: unknown }>("/api/onboarding");

export const apiImportStatement = (hid: string, formData: FormData) =>
  request(`/api/households/${hid}/statement-import`, { formData });

// ---------------------------------------------------------------------------
// Chat attachments: bank statements (preview, then import) and receipt photos
// ---------------------------------------------------------------------------

export type StatementCategory =
  | "Food & Drinks"
  | "Shopping"
  | "Bills"
  | "Transportation"
  | "Health"
  | "Social"
  | "Others"
  | "Income";

export interface StatementTransaction {
  date: string;
  title: string;
  rawDescription?: string;
  amount: number;
  type: "expense" | "income";
  category: StatementCategory;
  currency: string;
}

/** Reads a PDF/Excel/CSV statement without saving anything. */
export const apiPreviewStatement = (hid: string, file: File) => {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("dryRun", "true");
  fd.append("useAi", "false");
  return request<{ success: true; fileName: string; extractedCount: number; transactions: StatementTransaction[] }>(
    `/api/households/${hid}/statement-import`,
    { formData: fd }
  );
};

/** Saves previewed statement rows into a wallet. */
export const apiCommitStatement = (
  hid: string,
  body: { transactions: StatementTransaction[]; walletType: "shared" | "personal"; paidBy: "partner_a" | "partner_b" }
) =>
  request<{ success: true; importedCount: number; message: string }>(`/api/households/${hid}/statement-import`, { body });

export interface ScannedReceipt {
  merchant: string | null;
  total: number | null;
  currency: string | null;
  date: string | null;
  category: Exclude<StatementCategory, "Income">;
}

/** Reads a receipt photo into a draft expense; nothing is recorded. */
export const apiScanReceipt = (hid: string, image: Blob, fileName: string) => {
  const fd = new FormData();
  fd.append("file", image, fileName);
  return request<{ success: true; receipt: ScannedReceipt }>(`/api/households/${hid}/receipt-scan`, { formData: fd });
};
