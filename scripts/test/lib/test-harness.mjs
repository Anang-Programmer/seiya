/**
 * Shared harness for manual Seiya tests run from the terminal.
 *
 * Usage: scripts import this module, then run with `node --env-file=.env.local <script>`.
 * The Next dev server must already be running (`npm run dev`) on SEIYA_TEST_BASE_URL.
 *
 * Everything here talks to the real API the same way a browser would: signup/signin cookies for
 * Next routes, plus a user-scoped Supabase client (RLS) for reading ids the API does not list.
 */
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

export const BASE_URL = String(process.env.SEIYA_TEST_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const PASSWORD = process.env.SEIYA_TEST_PASSWORD || "SeiyaTest123!";
// Accounts sign in with a full name; the internal Supabase email is derived from it
// exactly like src/backend/services/auth.service.ts does.
export const NAME_A = process.env.SEIYA_TEST_NAME_A || "Seiya Tester A";
export const NAME_B = process.env.SEIYA_TEST_NAME_B || "Seiya Tester B";
const INTERNAL_EMAIL_DOMAIN = process.env.SEIYA_USERNAME_EMAIL_DOMAIN?.trim() || "users.seiya.invalid";

export function usernameToEmail(fullName) {
  const key = fullName.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
  return `u-${createHash("sha256").update(key).digest("hex").slice(0, 32)}@${INTERNAL_EMAIL_DOMAIN}`;
}

export const EMAIL_A = usernameToEmail(NAME_A);
export const EMAIL_B = usernameToEmail(NAME_B);
const ADMIN_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

/** Internal band keys. These words must NEVER appear in a model reply. */
export const FORBIDDEN_REPLY_WORDS = /\b(tightwad|unconflicted|spendthrift|spendthrift–?tightwad|scale|band|skor|score)\b/i;

if (!SUPABASE_URL || !PUBLISHABLE_KEY) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY missing. Run with: node --env-file=.env.local <script>");
}

/* ------------------------------------------------------------------ *\
   Part A + Part B payloads (onboarding questions are English in the UI) *
\* ------------------------------------------------------------------ */

/** Raw answers only; the band label is derived server-side and never stored or returned. */
export const PROFILES = [
  {
    key: "tightwad (total 7)",
    personalization: {
      spendingHabit: 3,
      paymentPain: 1,
      planOvershoot: 2,
      wishPurchaseReaction: 1,
      moneyMeaning: "rasa_aman",
      commStyle: "lewat_tulisan",
      permaGoal: "pencapaian",
    },
  },
  {
    key: "unconflicted (total 15)",
    personalization: {
      spendingHabit: 6,
      paymentPain: 3,
      planOvershoot: 3,
      wishPurchaseReaction: 3,
      moneyMeaning: "pengakuan",
      commStyle: "langsung",
      permaGoal: "emosi_positif",
    },
  },
  {
    key: "spendthrift (total 24)",
    personalization: {
      spendingHabit: 10,
      paymentPain: 5,
      planOvershoot: 4,
      wishPurchaseReaction: 5,
      moneyMeaning: "kebebasan",
      commStyle: "langsung",
      permaGoal: "keasyikan",
    },
  },
];

/* ------------------------------------------------------------------ *\
   Low-level helpers                                                    *
\* ------------------------------------------------------------------ */

export function fail(message) {
  throw new Error(message);
}

export async function requireServer() {
  try {
    const res = await fetch(`${BASE_URL}/`, { method: "GET" });
    if (res.status < 500) return;
  } catch {
    // fall through
  }
  fail(`Dev server belum jalan di ${BASE_URL}. Jalankan "npm run dev" di terminal lain, lalu ulangi.`);
}

function mergeCookies(previous, response) {
  const header = response.headers;
  const setCookies = typeof header.getSetCookie === "function" ? header.getSetCookie() : [];
  const jar = new Map();

  for (const cookie of [...(previous || "").split(";").map((part) => part.trim()).filter(Boolean), ...setCookies.map((item) => item.split(";")[0])]) {
    const index = cookie.indexOf("=");
    if (index > 0) jar.set(cookie.slice(0, index), cookie.slice(index + 1));
  }
  return [...jar.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
}

export async function api(path, { method = "GET", body, cookies, timeoutMs = 45_000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        ...(cookies ? { cookie: cookies } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }
    return { status: res.status, data, cookies: mergeCookies(cookies, res) };
  } finally {
    clearTimeout(timer);
  }
}

async function signin(fullName) {
  return api("/api/auth/signin", { method: "POST", body: { fullName, password: PASSWORD } });
}

async function signup(fullName) {
  return api("/api/auth/signup", { method: "POST", body: { fullName, password: PASSWORD } });
}

/**
 * When a service-role key is available, create (or confirm) the two test accounts directly so the
 * run never depends on confirmation emails or the SMTP quota. Without it, signup needs a confirmed
 * inbox on first run.
 */
export async function ensureConfirmedUsers() {
  if (!ADMIN_KEY) return "no-admin-key";

  const admin = createClient(SUPABASE_URL, ADMIN_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: listed, error: listError } = await admin.auth.admin.listUsers({ perPage: 200 });
  if (listError) fail(`Admin listUsers gagal: ${listError.message}`);

  for (const [email, fullName] of [[EMAIL_A, NAME_A], [EMAIL_B, NAME_B]]) {
    const existing = (listed?.users ?? []).find((user) => user.email?.toLowerCase() === email);
    if (existing) {
      if (!existing.email_confirmed_at) {
        const { error } = await admin.auth.admin.updateUserById(existing.id, { email_confirm: true });
        if (error) fail(`Konfirmasi email ${email} gagal: ${error.message}`);
      }
      continue;
    }
    const { error } = await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (error) fail(`Admin createUser gagal untuk ${email}: ${error.message}`);
  }
  return "admin-bootstrap";
}

/** Returns the Next session cookie jar for a test user. */
export async function login(email, fullName) {
  const first = await signin(fullName);
  if (first.status === 200) return first.cookies;

  const created = await signup(fullName);
  if (created.status === 201) {
    if (created.data?.needsEmailConfirmation) {
      fail(
        `${email} dibuat tetapi masih menunggu konfirmasi email. Pilih salah satu lalu jalankan lagi:\n` +
          `  (a) buka inbox ${email} dan klik link konfirmasi,\n` +
          `  (b) tambahkan SUPABASE_SECRET_KEY (service role) ke .env.local supaya harness membuat/mengonfirmasi user otomatis,\n` +
          `  (c) matikan "Confirm email" sementara di Supabase Auth settings.\n` +
          `Atau arahkan SEIYA_TEST_NAME_A / SEIYA_TEST_NAME_B + SEIYA_TEST_PASSWORD ke akun yang sudah jadi.`,
      );
    }
    return created.cookies;
  }

  const retry = await signin(fullName);
  if (retry.status === 200) return retry.cookies;
  fail(
    `Gagal login ${email}: signin ${first.status} ${JSON.stringify(first.data)}, signup ${created.status} ${JSON.stringify(created.data)}\n` +
      `Kemungkinan: email belum dikonfirmasi, domain email ditolak GoTrue, atau kuota email project habis.\n` +
      `Solusi: tambahkan SUPABASE_SECRET_KEY ke .env.local (harness konfirmasi user otomatis), ` +
      `atau set SEIYA_TEST_NAME_A / SEIYA_TEST_NAME_B + SEIYA_TEST_PASSWORD ke akun yang sudah dikonfirmasi.`,
  );
}

export function sbClient() {
  return createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** User-scoped client used only for reading ids through RLS. */
export async function sbSession(email) {
  const client = sbClient();
  const { data, error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error || !data.session) {
    const { data: signedUp, error: signUpError } = await client.auth.signUp({ email, password: PASSWORD });
    if (signUpError || !signedUp.session) {
      fail(`Supabase auth gagal untuk ${email}: ${signUpError?.message ?? "butuh konfirmasi email"}.`);
    }
    return { client, session: signedUp.session };
  }
  return { client, session: data.session };
}

function ruleStatuses(payload) {
  const rules = Array.isArray(payload?.rules) ? payload.rules : [];
  return rules.map((rule) => ({
    id: rule?.id ?? null,
    status: rule?.status ?? null,
    rules: rule?.rules ?? null,
  }));
}

/* ------------------------------------------------------------------ *\
   Setup: household + partner + agreement + wallets                     *
\* ------------------------------------------------------------------ */

const DEFAULT_RULES = {
  walletMode: "shared_and_personal",
  expenseSplit: { mode: "equal", ownerPercent: 50, partnerPercent: 50 },
  approval: { requirePartnerApprovalAboveThreshold: true, sharedWalletThreshold: 5_000_000 },
  coolingOff: { enabled: false, threshold: 10_000_000, durationHours: 8 },
};

export async function setOnboarding(personalization) {
  const cookies = await login(EMAIL_A, NAME_A);
  const result = await api("/api/onboarding", {
    method: "POST",
    cookies,
    body: {
      profile: { city: "Jakarta", country: "Indonesia", preferredLanguage: "id" },
      answers: {
        childrenCategory: "none",
        partner: { name: NAME_B },
        partnerAwareness: "yes_supportive",
        moneyTalkFrequency: "weekly",
        moneyTalkDuration: "15_30_min",
        hasDiscussedFamilyFinances: "yes",
        incomeSource: "both_partners",
        accountStructure: "both",
        financialChallenges: ["saving_for_shared_goal"],
        otherChallengeDescription: null,
        personalization,
      },
    },
  });
  if (result.status !== 200 && result.status !== 201) {
    fail(`Onboarding gagal (${result.status}): ${JSON.stringify(result.data)}`);
  }
  return result;
}

async function findHousehold(client) {
  const { data, error } = await client
    .from("household_members")
    .select("household_id, status")
    .eq("status", "active")
    .limit(1);
  if (error) fail(`Gagal membaca household_members: ${error.message}`);
  return data?.[0]?.household_id ?? null;
}

async function ensureAgreement(householdId, cookiesA, cookiesB) {
  const current = await api(`/api/households/${householdId}/finance-rules`, { cookies: cookiesA });
  if (current.status !== 200) {
    fail(`GET finance-rules gagal (${current.status}): ${JSON.stringify(current.data)}`);
  }

  let statuses = ruleStatuses(current.data);
  if (statuses.some((rule) => rule.status === "active")) return "already-active";

  let pending = statuses.find((rule) => rule.status === "pending_approval");
  if (!pending) {
    const proposed = await api(`/api/households/${householdId}/finance-rules`, {
      method: "POST",
      cookies: cookiesA,
      body: { rules: DEFAULT_RULES },
    });
    if (proposed.status !== 201) {
      fail(`Proposal aturan gagal (${proposed.status}): ${JSON.stringify(proposed.data)}`);
    }
    const rule = proposed.data?.rule;
    pending = {
      id: rule?.id ?? rule?.rule?.id ?? null,
      status: rule?.status ?? "pending_approval",
    };
  }

  if (!pending.id) {
    // The GET response is the source of truth for ids when the POST shape differs.
    const refreshed = await api(`/api/households/${householdId}/finance-rules`, { cookies: cookiesA });
    pending = ruleStatuses(refreshed.data).find((rule) => rule.status === "pending_approval");
  }
  if (!pending?.id) fail("Tidak menemukan rule pending_approval untuk disetujui pasangan.");

  const decision = await api(`/api/households/${householdId}/finance-rules/${pending.id}/decision`, {
    method: "POST",
    cookies: cookiesB,
    body: { decision: "approved", note: "Approved by test partner." },
  });
  if (decision.status !== 200 && decision.status !== 201) {
    fail(`Pasangan gagal approve (${decision.status}): ${JSON.stringify(decision.data)}`);
  }

  const verify = await api(`/api/households/${householdId}/finance-rules`, { cookies: cookiesA });
  if (!ruleStatuses(verify.data).some((rule) => rule.status === "active")) {
    fail("Kesepakatan belum aktif setelah approval. Cek jumlah anggota aktif household.");
  }
  return "activated";
}

async function ensurePartner(householdId, cookiesA, cookiesB) {
  const invited = await api("/api/households/invitations", {
    method: "POST",
    cookies: cookiesA,
    body: { householdId, invitedName: NAME_B },
  });

  if (invited.status === 409 && invited.data?.message?.toLowerCase().includes("invitation")) {
    return "invitation-pending-unknown";
  }
  if (invited.status !== 201) {
    fail(`Invite pasangan gagal (${invited.status}): ${JSON.stringify(invited.data)}`);
  }

  const token =
    invited.data?.invitation?.token ??
    invited.data?.token ??
    (typeof invited.data?.inviteUrl === "string"
      ? new URL(invited.data.inviteUrl).searchParams.get("token")
      : null);
  if (!token) fail(`Tidak menemukan token undangan: ${JSON.stringify(invited.data)}`);

  const accepted = await api("/api/households/invitations/accept", {
    method: "POST",
    cookies: cookiesB,
    body: { token },
  });
  if (accepted.status !== 200 && accepted.status !== 201) {
    if (accepted.status === 409) return "already-member";
    fail(`Terima undangan gagal (${accepted.status}): ${JSON.stringify(accepted.data)}`);
  }
  return "invited-and-accepted";
}

/** Idempotent: creates/uses one test household with two members, an active agreement, and wallets. */
export async function setup() {
  await requireServer();

  const bootstrapNote = await ensureConfirmedUsers();
  const cookiesA = await login(EMAIL_A, NAME_A);
  const cookiesB = await login(EMAIL_B, NAME_B);
  const sessionA = await sbSession(EMAIL_A);
  await sbSession(EMAIL_B);

  // Onboarding must exist before household setup.
  await setOnboarding(PROFILES[0].personalization);

  let householdId = await findHousehold(sessionA.client);
  let householdNote = "existing";

  if (!householdId) {
    const created = await api("/api/households", {
      method: "POST",
      cookies: cookiesA,
      body: { name: "Seiya Manual Test", country: "Indonesia", baseCurrency: "IDR" },
    });
    householdId = created.data?.household?.id ?? created.data?.household?.household?.id ?? null;
    if (created.status !== 201 || !householdId) {
      fail(`Buat household gagal (${created.status}): ${JSON.stringify(created.data)}`);
    }
    householdNote = "created";
  }

  const members = await sessionA.client
    .from("household_members")
    .select("user_id, status")
    .eq("household_id", householdId)
    .eq("status", "active");
  if (members.error) fail(`Gagal membaca anggota: ${members.error.message}`);

  let partnerNote = "present";
  if ((members.data ?? []).length < 2) {
    partnerNote = await ensurePartner(householdId, cookiesA, cookiesB);
  }

  const agreementNote = await ensureAgreement(householdId, cookiesA, cookiesB);

  const wallets = await api(`/api/households/${householdId}/wallets`, { method: "POST", cookies: cookiesA });
  if (wallets.status !== 200 && wallets.status !== 201) {
    fail(`Init wallet gagal (${wallets.status}): ${JSON.stringify(wallets.data)}`);
  }

  return {
    householdId,
    cookiesA,
    sbA: sessionA.client,
    notes: { bootstrap: bootstrapNote, household: householdNote, partner: partnerNote, agreement: agreementNote },
  };
}

/* ------------------------------------------------------------------ *\
   Reusable steps                                                       *
\* ------------------------------------------------------------------ */

export async function chat(householdId, cookies, message) {
  const started = Date.now();
  const transient = new Set([429, 502, 503, 504]);
  // Vendor rate limits (e.g. Groq TPM) recover within a minute; back off accordingly.
  const backoffMs = [4_000, 10_000, 20_000];
  let result;

  for (let attempt = 0; attempt <= backoffMs.length; attempt += 1) {
    result = await api("/api/ai/chat", {
      method: "POST",
      cookies,
      body: { householdId, message },
      timeoutMs: 60_000,
    });
    if (result.status === 200 && result.data?.success) break;
    if (!transient.has(result.status) || attempt === backoffMs.length) break;
    console.log(
      `  (chat ${result.status}, coba lagi ${attempt + 2}/${backoffMs.length + 1} dalam ${backoffMs[attempt] / 1000}s — lihat log "[Seiya AI] provider failed" di terminal dev server bila tetap gagal)`,
    );
    await new Promise((resolve) => setTimeout(resolve, backoffMs[attempt]));
  }

  if (result.status !== 200 || !result.data?.success) {
    fail(`Chat gagal (${result.status}): ${JSON.stringify(result.data)}`);
  }
  return {
    reply: String(result.data.message ?? ""),
    toolsUsed: result.data.meta?.toolsUsed ?? [],
    conversationId: result.data.conversationId,
    latencyMs: Date.now() - started,
  };
}

export async function listWallets(sbA, householdId) {
  const { data, error } = await sbA
    .from("wallets")
    .select("id, wallet_type, name, currency, simulated_balance")
    .eq("household_id", householdId)
    .eq("status", "active")
    .order("wallet_type", { ascending: true });
  if (error) fail(`Gagal membaca wallets: ${error.message}`);
  return data ?? [];
}

export async function listTransactions(householdId, cookies, limit = 5) {
  const result = await api(`/api/households/${householdId}/transactions?limit=${limit}`, { cookies });
  if (result.status !== 200) fail(`GET transactions gagal (${result.status}): ${JSON.stringify(result.data)}`);
  return result.data?.transactions ?? [];
}

/* ------------------------------------------------------------------ *\
   Reporting                                                            *
\* ------------------------------------------------------------------ */

const PASS = "PASS";
const FAIL = "FAIL";
const WARN = "WARN";

export function report() {
  const rows = [];
  return {
    add(result, label, detail = "") {
      rows.push({ result, label, detail });
      const marker = result === PASS ? "  ok " : result === WARN ? " warn" : " FAIL";
      console.log(`[${marker}] ${label}${detail ? ` — ${detail}` : ""}`);
    },
    check(condition, label, { detail = "", soft = false } = {}) {
      this.add(condition ? PASS : soft ? WARN : FAIL, label, detail);
      return Boolean(condition);
    },
    summary() {
      const failed = rows.filter((row) => row.result === FAIL).length;
      const warned = rows.filter((row) => row.result === WARN).length;
      console.log("\nRingkasan: " + `${rows.length - failed - warned} PASS, ${warned} WARN, ${failed} FAIL`);
      if (failed > 0) process.exitCode = 1;
      return failed === 0;
    },
  };
}

export function countEmoji(text) {
  return (text.match(/\p{Extended_Pictographic}/gu) ?? []).length;
}

export function currencyMentions(text) {
  return text.match(/(?:Rp\s?[\d.,]+|\b\d{1,3}(?:[.,]\d{3})+\b|\b\d+\s*(?:juta|ribu)\b)/gi) ?? [];
}

export function heading(title) {
  console.log(`\n=== ${title} ===`);
}

export function printReply(label, reply, toolsUsed, latencyMs) {
  console.log(`\n--- ${label} ---`);
  console.log(reply);
  console.log(`(tools: ${toolsUsed.length ? toolsUsed.join(", ") : "none"} | ${latencyMs}ms)`);
}
