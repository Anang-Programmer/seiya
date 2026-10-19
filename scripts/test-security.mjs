/**
 * Manual test: privacy, IDOR, Dual-Key PIN, undo, bill idempotency, and plan deletion.
 *
 * The last section locks Partner A's PIN checks for 15 minutes (DB lockout test).
 * A rerun inside that window reports A's PIN as a warning; that is expected.
 *
 * Run (dev server must be running):
 *   npm run test:security
 *   node --env-file=.env.local scripts/test-security.mjs
 *
 * Uses the two harness accounts (Partner A and Partner B) in their test household.
 */
import { randomUUID } from "node:crypto";
import { NAME_B, EMAIL_B, api, heading, listWallets, login, report, sbSession, setup } from "./lib/test-harness.mjs";

const TEST_PIN = process.env.SEIYA_TEST_PIN || "246810";
const WRONG_PIN = TEST_PIN === "111111" ? "222222" : "111111";

async function ensurePin(cookies, label, checks) {
  const status = await api("/api/auth/pin/status", { cookies });
  if (!status.data?.hasPin) {
    const set = await api("/api/auth/pin/setup", { method: "POST", cookies, body: { pin: TEST_PIN } });
    checks.check(set.status === 200, `${label}: PIN dibuat`, { detail: `status ${set.status}` });
  }
  const verify = await api("/api/auth/pin/verify", { method: "POST", cookies, body: { pin: TEST_PIN } });
  return verify.status === 200;
}

async function balanceOf(client, householdId, type) {
  const wallets = await listWallets(client, householdId);
  return Number(wallets.find((w) => w.wallet_type === type)?.simulated_balance ?? NaN);
}

async function main() {
  const checks = report();
  const ctx = await setup();
  const { householdId, cookiesA, sbA } = ctx;
  const cookiesB = await login(EMAIL_B, NAME_B);
  const { client: sbB } = await sbSession(EMAIL_B);

  heading("Auth");
  const wrong = await api("/api/auth/signin", { method: "POST", body: { fullName: "Seiya Tester A", password: "wrong-password-1" } });
  checks.check(wrong.status === 401 && !/stack|error:/i.test(JSON.stringify(wrong.data)), "password salah → 401 tanpa detail server", {
    detail: wrong.data?.message,
  });
  const short = await api("/api/auth/signup", { method: "POST", body: { fullName: "QA Short Pass", password: "123" } });
  checks.check(short.status === 400, "password < 8 karakter ditolak sebelum akun dibuat", { detail: short.data?.message });
  const noAuth = await api(`/api/households/${householdId}/wallets`);
  checks.check(noAuth.status === 401, "tanpa login → 401", { detail: `status ${noAuth.status}` });

  heading("Privasi dompet (A vs B)");
  const walletsA = await listWallets(sbA, householdId);
  const walletsB = await listWallets(sbB, householdId);
  checks.check(walletsA.filter((w) => w.wallet_type === "personal").length === 1, "RLS: A hanya melihat 1 dompet pribadi (miliknya)");
  checks.check(walletsB.filter((w) => w.wallet_type === "personal").length === 1, "RLS: B hanya melihat 1 dompet pribadi (miliknya)");
  const personalA = walletsA.find((w) => w.wallet_type === "personal");
  const personalB = walletsB.find((w) => w.wallet_type === "personal");
  checks.check(personalA && personalB && personalA.id !== personalB.id, "dompet pribadi A ≠ dompet pribadi B");

  const apiWalletsA = await api(`/api/households/${householdId}/wallets`, { cookies: cookiesA });
  const payload = JSON.stringify(apiWalletsA.data ?? {});
  checks.check(apiWalletsA.status === 200 && !payload.includes(personalB?.id ?? "none"), "API wallets milik A tidak memuat id dompet pribadi B", {
    detail: `status ${apiWalletsA.status}`,
  });

  // B records private income; A must not see it anywhere.
  const secretTitle = `QA private ${Date.now()}`;
  const privateTx = await api(`/api/households/${householdId}/transactions`, {
    method: "POST",
    cookies: cookiesB,
    body: {
      walletId: personalB.id,
      transactionType: "income",
      amount: 12345,
      description: secretTitle,
      category: "income",
      idempotencyKey: `qa-private-${randomUUID()}`,
    },
  });
  checks.check(privateTx.status === 201, "B mencatat pemasukan di dompet pribadinya", { detail: `status ${privateTx.status}` });
  const listA = await api(`/api/households/${householdId}/transactions?limit=100`, { cookies: cookiesA });
  const listA2 = await api(`/api/transactions?limit=100`, { cookies: cookiesA });
  const activityA = await api(`/api/households/${householdId}/activities`, { cookies: cookiesA });
  checks.check(!JSON.stringify(listA.data).includes(secretTitle), "A tidak melihat transaksi pribadi B (households/…/transactions)");
  checks.check(!JSON.stringify(listA2.data).includes(secretTitle), "A tidak melihat transaksi pribadi B (/api/transactions)");
  checks.check(!JSON.stringify(activityA.data).includes(secretTitle), "A tidak melihat transaksi pribadi B di activity log", {
    detail: `status ${activityA.status}`,
  });
  const { data: directTx } = await sbA.from("transactions").select("id, description").eq("wallet_id", personalB.id);
  checks.check((directTx ?? []).length === 0, "RLS langsung: A tidak bisa SELECT transaksi dompet B");

  const spoof = await api(`/api/households/${householdId}/transactions`, {
    method: "POST",
    cookies: cookiesA,
    body: {
      walletId: personalB.id,
      transactionType: "expense",
      amount: 1000,
      description: "QA spoof",
      category: "others",
      idempotencyKey: `qa-spoof-${randomUUID()}`,
    },
  });
  checks.check(spoof.status >= 400, "A tidak bisa belanja dari dompet pribadi B", { detail: `status ${spoof.status}` });

  heading("IDOR household lain");
  const otherHousehold = randomUUID();
  for (const path of ["wallets", "transactions", "bills", "plans", "approvals", "settlement", "chat-history", "activities", "budgets", "promise"]) {
    const res = await api(`/api/households/${otherHousehold}/${path}`, { cookies: cookiesA });
    checks.check(res.status === 403 || res.status === 404, `GET ${path} household lain → 403/404`, { detail: `status ${res.status}` });
  }

  heading("Dual-Key PIN");
  const pinA = await ensurePin(cookiesA, "A", checks);
  const pinB = await ensurePin(cookiesB, "B", checks);
  checks.check(pinA && pinB, `PIN test (${TEST_PIN}) valid untuk A dan B`, { soft: true });
  const overwrite = await api("/api/auth/pin/setup", { method: "POST", cookies: cookiesB, body: { pin: "135790" } });
  checks.check(overwrite.status === 409, "PIN yang sudah ada tidak bisa ditimpa tanpa PIN lama", { detail: `status ${overwrite.status}` });
  const userIdB = (await sbB.auth.getUser()).data.user?.id;
  const { error: directPinWrite } = await sbB.from("user_pins").upsert({ user_id: userIdB, pin_hash: "forged" });
  checks.check(Boolean(directPinWrite), "RLS: user_pins tidak bisa ditulis langsung", {
    detail: directPinWrite ? directPinWrite.message : "no error returned",
  });
  const { error: hashRead } = await sbB.from("user_pins").select("pin_hash").eq("user_id", userIdB);
  checks.check(Boolean(hashRead), "pin_hash tidak bisa dibaca lewat API", { detail: hashRead ? hashRead.message : "hash readable" });
  const { error: directSetPin } = await sbB.rpc("set_user_pin", { p_pin: "135790" });
  const stillValid = await api("/api/auth/pin/verify", { method: "POST", cookies: cookiesB, body: { pin: TEST_PIN } });
  checks.check(!directSetPin && stillValid.status === 200, "RPC set_user_pin tanpa PIN lama tidak mengganti PIN", {
    detail: `${directSetPin?.message ?? "rpc ok"}, verify ${stillValid.status}`,
  });

  // Big shared expense → pending approval.
  const shared = walletsA.find((w) => w.wallet_type === "shared");
  const before = await balanceOf(sbA, householdId, "shared");
  const big = await api(`/api/households/${householdId}/transactions`, {
    method: "POST",
    cookies: cookiesA,
    body: {
      walletId: shared.id,
      transactionType: "expense",
      amount: 7_500_000,
      description: "QA laptop baru",
      category: "shopping",
      idempotencyKey: `qa-big-${randomUUID()}`,
    },
  });
  const bigTx = big.data?.transaction;
  checks.check(big.status === 201 && bigTx?.status === "pending_approval", "Rp7,5 jt di atas batas → pending_approval", {
    detail: `status ${big.status} ${bigTx?.status}`,
  });
  checks.check((await balanceOf(sbA, householdId, "shared")) === before, "saldo bersama belum terpotong saat pending");

  const approvalsB = await api(`/api/households/${householdId}/approvals`, { cookies: cookiesB });
  const approval = (approvalsB.data?.approvals ?? []).find((a) => a.target_id === bigTx?.id || a.targetId === bigTx?.id);
  checks.check(Boolean(approval), "B melihat permintaan approval di antreannya", { detail: `status ${approvalsB.status}` });

  if (approval) {
    const self = await api(`/api/approvals/${approval.id}/decision`, { method: "POST", cookies: cookiesA, body: { decision: "approved", pin: TEST_PIN } });
    checks.check(self.status === 403, "A tidak bisa approve permintaannya sendiri", { detail: `status ${self.status}` });
    const noPin = await api(`/api/approvals/${approval.id}/decision`, { method: "POST", cookies: cookiesB, body: { decision: "approved" } });
    checks.check(noPin.status === 401, "approve tanpa PIN ditolak", { detail: `status ${noPin.status} ${noPin.data?.message}` });
    const bad = await api(`/api/approvals/${approval.id}/decision`, { method: "POST", cookies: cookiesB, body: { decision: "approved", pin: WRONG_PIN } });
    checks.check(bad.status === 401, "approve dengan PIN salah ditolak", { detail: `status ${bad.status} ${bad.data?.message}` });
    const bypass = await api(`/api/transactions/${bigTx.id}/decision`, { method: "POST", cookies: cookiesB, body: { decision: "approved" } });
    checks.check(bypass.status === 401, "jalur /api/transactions/:id/decision juga butuh PIN", { detail: `status ${bypass.status}` });

    // The same rules hold when B calls the database directly with their own session.
    const { error: oldApprove } = await sbB.rpc("decide_household_approval", {
      p_approval_id: approval.id,
      p_decision: "approved",
    });
    checks.check(Boolean(oldApprove), "RPC langsung: decide_household_approval tanpa PIN tidak bisa dipanggil", {
      detail: oldApprove ? `${oldApprove.code} ${oldApprove.message}` : "no error returned",
    });
    const { error: oldTxApprove } = await sbB.rpc("decide_simulated_transaction", {
      p_transaction_id: bigTx.id,
      p_decision: "approved",
    });
    checks.check(Boolean(oldTxApprove), "RPC langsung: decide_simulated_transaction tanpa PIN tidak bisa dipanggil", {
      detail: oldTxApprove ? `${oldTxApprove.code} ${oldTxApprove.message}` : "no error returned",
    });
    const { data: rpcNoPin, error: rpcNoPinError } = await sbB.rpc("decide_household_approval_with_pin", {
      p_approval_id: approval.id,
      p_decision: "approved",
    });
    checks.check(rpcNoPin?.ok === false && rpcNoPin?.reason === "pin_required", "RPC langsung: approve tanpa PIN → pin_required", {
      detail: rpcNoPinError ? rpcNoPinError.message : JSON.stringify(rpcNoPin),
    });
    const { data: rpcBadPin, error: rpcBadPinError } = await sbB.rpc("decide_simulated_transaction_with_pin", {
      p_transaction_id: bigTx.id,
      p_decision: "approved",
      p_pin: WRONG_PIN,
    });
    checks.check(rpcBadPin?.ok === false && rpcBadPin?.reason === "invalid_pin", "RPC langsung: approve transaksi dengan PIN salah → invalid_pin", {
      detail: rpcBadPinError ? rpcBadPinError.message : JSON.stringify(rpcBadPin),
    });
    checks.check((await balanceOf(sbA, householdId, "shared")) === before, "saldo tetap utuh setelah percobaan gagal");

    if (pinB) {
      const ok = await api(`/api/approvals/${approval.id}/decision`, { method: "POST", cookies: cookiesB, body: { decision: "approved", pin: TEST_PIN } });
      checks.check(ok.status === 200, "B approve dengan PIN benar", { detail: `status ${ok.status} ${ok.data?.message}` });
      const after = await balanceOf(sbA, householdId, "shared");
      checks.check(Math.abs(before - after - 7_500_000) < 0.01, "saldo bersama terpotong tepat Rp7.500.000", { detail: `${before} → ${after}` });
    }
  }

  // Decline flow.
  const decl = await api(`/api/households/${householdId}/transactions`, {
    method: "POST",
    cookies: cookiesA,
    body: { walletId: shared.id, transactionType: "expense", amount: 6_000_000, description: "QA decline", category: "shopping", idempotencyKey: `qa-decl-${randomUUID()}` },
  });
  const declApprovals = await api(`/api/households/${householdId}/approvals`, { cookies: cookiesB });
  const declItem = (declApprovals.data?.approvals ?? []).find((a) => (a.target_id ?? a.targetId) === decl.data?.transaction?.id);
  if (declItem) {
    const res = await api(`/api/approvals/${declItem.id}/decision`, { method: "POST", cookies: cookiesB, body: { decision: "declined", reason: "QA" } });
    checks.check(res.status === 200 && res.data?.status === "declined", "B menolak (decline) tanpa PIN → declined", { detail: `status ${res.status}` });
  } else {
    checks.check(false, "approval untuk transaksi decline ditemukan");
  }

  heading("Batalkan permintaan & update approval langsung");
  const toCancel = await api(`/api/households/${householdId}/transactions`, {
    method: "POST",
    cookies: cookiesA,
    body: { walletId: shared.id, transactionType: "expense", amount: 5_200_000, description: "QA cancel", category: "shopping", idempotencyKey: `qa-cancel-${randomUUID()}` },
  });
  const cancelTxId = toCancel.data?.transaction?.id;
  const { data: cancelItem } = await sbA.from("approvals").select("id, status").eq("target_id", cancelTxId).maybeSingle();
  if (cancelItem) {
    const { data: forged } = await sbA.from("approvals").update({ status: "approved" }).eq("id", cancelItem.id).select("id");
    checks.check((forged ?? []).length === 0, "RLS: pemohon tidak bisa set status approval langsung", { detail: `rows ${forged?.length ?? 0}` });
    const byB = await api(`/api/approvals/${cancelItem.id}/cancel`, { method: "POST", cookies: cookiesB });
    checks.check(byB.status === 403, "B tidak bisa membatalkan permintaan A", { detail: `status ${byB.status}` });
    const byA = await api(`/api/approvals/${cancelItem.id}/cancel`, { method: "POST", cookies: cookiesA });
    const { data: afterCancel } = await sbA.from("approvals").select("status").eq("id", cancelItem.id).single();
    const { data: cancelTx } = await sbA.from("transactions").select("status").eq("id", cancelTxId).single();
    checks.check(byA.status === 200 && afterCancel?.status === "cancelled" && cancelTx?.status === "cancelled", "A membatalkan permintaannya → approval & transaksi cancelled", {
      detail: `status ${byA.status} ${afterCancel?.status}/${cancelTx?.status}`,
    });
  } else {
    checks.check(false, "approval untuk transaksi cancel ditemukan");
  }

  heading("Cooling-off tidak bisa dilewati");
  const held = await api(`/api/households/${householdId}/waiting-list`, {
    method: "POST",
    cookies: cookiesA,
    body: {
      title: "QA sepatu impian",
      amount: 1_500_000,
      currency: "IDR",
      wallet: "shared",
      // A past hold end from the browser must be ignored.
      holdUntil: new Date(Date.now() - 3600e3).toISOString(),
      reason: "QA cooling-off",
    },
  });
  const heldId = held.data?.heldPurchase?.id;
  const heldUntil = new Date(held.data?.heldPurchase?.holdUntil ?? 0).getTime();
  checks.check(Boolean(heldId), "pembelian masuk waiting list", { detail: `status ${held.status}` });
  checks.check(heldUntil > Date.now(), "holdUntil di masa lalu dari klien diabaikan, hold dihitung server", {
    detail: held.data?.heldPurchase?.holdUntil ?? "none",
  });
  if (heldId) {
    const early = await api(`/api/waiting-list/${heldId}/continue`, { method: "POST", cookies: cookiesA });
    checks.check(early.status >= 400, "continue sebelum masa hold habis ditolak", { detail: `status ${early.status} ${early.data?.message ?? ""}` });
    const { data: moved } = await sbA
      .from("held_purchases")
      .update({ hold_until: new Date(Date.now() - 3600e3).toISOString() })
      .eq("id", heldId)
      .select("id");
    const afterMove = await api(`/api/waiting-list/${heldId}/continue`, { method: "POST", cookies: cookiesA });
    checks.check((moved ?? []).length === 0 && afterMove.status >= 400, "RLS: hold_until tidak bisa dimundurkan langsung", {
      detail: `rows ${moved?.length ?? 0}, continue ${afterMove.status}`,
    });
    const cancelHeld = await api(`/api/waiting-list/${heldId}/cancel`, { method: "POST", cookies: cookiesA });
    checks.check(cancelHeld.status === 200, "cancel purchase menghapus item tanpa memotong saldo", { detail: `status ${cancelHeld.status}` });
  }

  const userIdA = (await sbA.auth.getUser()).data.user?.id;
  const { data: directHeld, error: directHeldError } = await sbA
    .from("held_purchases")
    .insert({
      household_id: householdId,
      title: "QA hold langsung",
      amount: 1_500_000,
      currency: "IDR",
      wallet: "shared",
      requester_id: userIdA,
      hold_until: new Date(Date.now() - 3600e3).toISOString(),
      status: "held",
    })
    .select("id, hold_until")
    .single();
  checks.check(Boolean(directHeld) && new Date(directHeld.hold_until).getTime() > Date.now(), "insert langsung dengan hold_until lampau tetap terkunci", {
    detail: directHeldError ? directHeldError.message : directHeld?.hold_until,
  });
  if (directHeld) {
    const { error: directContinue } = await sbA.rpc("continue_held_purchase", { p_held_id: directHeld.id });
    checks.check(Boolean(directContinue), "continue_held_purchase langsung ditolak selama hold", {
      detail: directContinue ? directContinue.message : "continued",
    });
    await api(`/api/waiting-list/${directHeld.id}/cancel`, { method: "POST", cookies: cookiesA });
  }

  heading("Undo transaksi");
  const small = await api(`/api/households/${householdId}/transactions`, {
    method: "POST",
    cookies: cookiesA,
    body: { walletId: shared.id, transactionType: "expense", amount: 25_000, description: "QA kopi", category: "food", idempotencyKey: `qa-undo-${randomUUID()}` },
  });
  const beforeUndo = await balanceOf(sbA, householdId, "shared");
  const undo = await api(`/api/transactions/${small.data?.transaction?.id}/undo`, { method: "POST", cookies: cookiesA });
  const afterUndo = await balanceOf(sbA, householdId, "shared");
  checks.check(undo.status === 200 && Math.abs(afterUndo - beforeUndo - 25_000) < 0.01, "undo mengembalikan saldo Rp25.000", {
    detail: `status ${undo.status} ${beforeUndo} → ${afterUndo}`,
  });
  const undoByB = await api(`/api/households/${householdId}/transactions`, {
    method: "POST",
    cookies: cookiesA,
    body: { walletId: shared.id, transactionType: "expense", amount: 10_000, description: "QA undo B", category: "food", idempotencyKey: `qa-undob-${randomUUID()}` },
  });
  const undoOther = await api(`/api/transactions/${undoByB.data?.transaction?.id}/undo`, { method: "POST", cookies: cookiesB });
  checks.check(undoOther.status === 403, "B tidak bisa undo transaksi milik A", { detail: `status ${undoOther.status}` });

  heading("Tagihan: bayar dua kali (idempotency)");
  const bill = await api(`/api/households/${householdId}/bills`, {
    method: "POST",
    cookies: cookiesA,
    body: { title: "QA WiFi Rumah", payee: "ISP", amount: 450_000, currency: "IDR", dueDate: new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10), recurrence: "monthly" },
  });
  const billId = bill.data?.bill?.id;
  checks.check(bill.status === 201 && Boolean(billId), "tagihan dibuat", { detail: `status ${bill.status} ${bill.data?.message ?? ""}` });
  if (billId) {
    const beforePay = await balanceOf(sbA, householdId, "shared");
    const key = `qa-bill-${randomUUID()}`;
    const [p1, p2] = await Promise.all([
      api(`/api/households/${householdId}/bills/${billId}/pay`, { method: "POST", cookies: cookiesA, body: { walletId: shared.id, idempotencyKey: key } }),
      api(`/api/households/${householdId}/bills/${billId}/pay`, { method: "POST", cookies: cookiesA, body: { walletId: shared.id, idempotencyKey: key } }),
    ]);
    const p3 = await api(`/api/households/${householdId}/bills/${billId}/pay`, { method: "POST", cookies: cookiesA, body: { walletId: shared.id, idempotencyKey: `qa-bill-${randomUUID()}` } });
    const afterPay = await balanceOf(sbA, householdId, "shared");
    checks.check(Math.abs(beforePay - afterPay - 450_000) < 0.01, "double-click bayar hanya memotong sekali", {
      detail: `${p1.status}/${p2.status}/${p3.status} ${beforePay} → ${afterPay}`,
    });
  }

  heading("Rencana tabungan: hapus butuh dua kunci");
  const plan = await api(`/api/households/${householdId}/plans`, {
    method: "POST",
    cookies: cookiesA,
    body: {
      title: "QA Dana Liburan Jepang",
      category: "Travel",
      targetAmount: 30_000_000,
      currentAmount: 0,
      currency: "IDR",
      targetDate: new Date(Date.now() + 365 * 864e5).toISOString().slice(0, 10),
      recommendedMonthly: 2_500_000,
      splitPartnerA: 50,
      splitPartnerB: 50,
      walletFunding: "shared",
      status: "Active",
    },
  });
  const planId = plan.data?.plan?.id;
  checks.check(plan.status === 201 && Boolean(planId), "rencana dibuat", { detail: `status ${plan.status} ${plan.data?.message ?? ""}` });
  if (planId) {
    const del = await api(`/api/households/${householdId}/plans/${planId}`, { method: "DELETE", cookies: cookiesA });
    const still = await api(`/api/households/${householdId}/plans`, { cookies: cookiesA });
    const exists = JSON.stringify(still.data).includes(planId);
    checks.check(exists && del.status >= 400, "DELETE sepihak ditolak, rencana tetap ada", { detail: `DELETE status ${del.status}` });
    const { error: directDelete } = await sbA.from("plans").delete().eq("id", planId);
    const stillDirect = await api(`/api/households/${householdId}/plans`, { cookies: cookiesA });
    checks.check(JSON.stringify(stillDirect.data).includes(planId), "RLS: DELETE langsung ke tabel plans tidak menghapus rencana", {
      detail: directDelete ? directDelete.message : "no error returned",
    });
    const req = await api(`/api/households/${householdId}/plans/${planId}/request-delete`, { method: "POST", cookies: cookiesA, body: {} });
    const after = await api(`/api/households/${householdId}/plans`, { cookies: cookiesA });
    checks.check(JSON.stringify(after.data).includes(planId), "request-delete membuat permintaan, rencana belum terhapus", {
      detail: `status ${req.status} ${req.data?.message ?? ""}`,
    });
  }

  heading("Settlement");
  const settlement = await api(`/api/households/${householdId}/settlement`, { cookies: cookiesA });
  checks.check(settlement.status === 200, "settlement bisa dibaca", { detail: JSON.stringify(settlement.data).slice(0, 200) });

  // Last on purpose: this locks A's PIN checks for 15 minutes.
  heading("PIN lockout lintas request (database)");
  const statuses = [];
  for (let i = 0; i < 5; i += 1) {
    const res = await api("/api/auth/pin/verify", { method: "POST", cookies: cookiesA, body: { pin: WRONG_PIN } });
    statuses.push(res.status);
    if (res.status === 429) break;
  }
  checks.check(statuses.at(-1) === 429 && statuses.slice(0, -1).every((status) => status === 401), "PIN salah ke-5 mengunci PIN A", {
    detail: statuses.join(","),
  });
  const correctWhileLocked = await api("/api/auth/pin/verify", { method: "POST", cookies: cookiesA, body: { pin: TEST_PIN } });
  checks.check(correctWhileLocked.status === 429, "PIN benar tetap ditolak selama terkunci", { detail: `status ${correctWhileLocked.status}` });
  const { data: lockedRpc, error: lockedRpcError } = await sbA.rpc("verify_user_pin", { p_pin: TEST_PIN });
  checks.check(lockedRpc === "locked", "kunci tersimpan di database (RPC langsung juga locked)", {
    detail: lockedRpcError ? lockedRpcError.message : String(lockedRpc),
  });

  checks.summary();
}

main().catch((error) => {
  console.error(`\nGAGAL: ${error.message}`);
  process.exitCode = 1;
});
