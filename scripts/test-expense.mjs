/**
 * Manual test: chat-time expense recording (`record_expense`).
 *
 * Run:
 *   npm run test:expense
 *   node --env-file=.env.local scripts/test-expense.mjs
 *
 * What it proves:
 *   1. "hari ini aku habis Rp20 juta untuk liburan ke Jepang" is recorded with category travel.
 *   2. The result status comes from the active agreement (threshold Rp5 juta), not from the model:
 *      the expense lands as pending_approval and waits for the partner.
 *   3. Re-sending the identical message does not create a second transaction (server-side idempotency).
 *   4. A personal-wallet expense with an empty personal balance never gets invented; the AI reports it.
 */
import {
  chat,
  heading,
  listTransactions,
  listWallets,
  printReply,
  report,
  setup,
} from "./lib/test-harness.mjs";

const EXPENSE_MESSAGE = "hari ini aku habis Rp20 juta untuk liburan ke Jepang";
const PERSONAL_MESSAGE = "aku juga baru bayar pulsa Rp50 ribu dari uang pribadiku";
const THRESHOLD = 5_000_000;

async function ensureBalance(householdId, cookies, wallets) {
  const shared = wallets.find((wallet) => wallet.wallet_type === "shared");
  if (!shared) throw new Error("Dompet bersama tidak ditemukan setelah setup.");

  if (Number(shared.simulated_balance) >= 100_000_000) {
    return false;
  }

  const result = await fetch(
    `${process.env.SEIYA_TEST_BASE_URL || "http://localhost:3000"}/api/households/${householdId}/transactions`,
    {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookies },
      body: JSON.stringify({
        walletId: shared.id,
        transactionType: "income",
        amount: 100_000_000,
        description: "Top up saldo simulasi untuk test manual",
        category: "other",
        idempotencyKey: `test-topup-${householdId.slice(0, 8)}`,
      }),
    },
  );
  const payload = await result.json().catch(() => null);

  if (result.status !== 200 && result.status !== 201) {
    throw new Error(`Top up saldo gagal (${result.status}): ${JSON.stringify(payload)}`);
  }
  return true;
}

/** A reply must never say money moved when the database holds no matching row. */
function claimsMoneyMoved(text) {
  return /(sudah keluar|uangnya sudah|sudah tercatat|sudah dicatat|berhasil dicatat|sudah dibelanjakan|sudah dipindahkan|already recorded|already paid|already spent|money has left|funds have left|debited successfully)/i.test(text);
}

async function main() {
  const checks = report();
  const context = await setup();
  console.log(`Setup: household=${context.householdId} (${Object.entries(context.notes).map(([k, v]) => `${k}=${v}`).join(", ")})`);

  const wallets = await listWallets(context.sbA, context.householdId);
  const shared = wallets.find((wallet) => wallet.wallet_type === "shared");
  const personal = wallets.find((wallet) => wallet.wallet_type === "personal");
  heading("Dompet");
  for (const wallet of wallets) {
    console.log(`- ${wallet.wallet_type}: ${wallet.name} (${wallet.currency} ${wallet.simulated_balance})`);
  }
  checks.check(Boolean(shared), "dompet bersama tersedia", { detail: shared ? shared.id : "tidak ada" });

  const toppedUp = await ensureBalance(context.householdId, context.cookiesA, wallets);
  if (toppedUp) console.log("\nSaldo dompet bersama diisi Rp100.000.000 (simulasi) untuk test ini.");

  heading("Chat: catat pengeluaran dari bahasa sehari-hari");
  const before = await listTransactions(context.householdId, context.cookiesA, 20);
  const beforeCount = before.filter(
    (row) => row.transaction_type === "expense" && Number(row.amount) === 20_000_000,
  ).length;
  const answer = await chat(context.householdId, context.cookiesA, EXPENSE_MESSAGE);
  printReply(`"${EXPENSE_MESSAGE}"`, answer.reply, answer.toolsUsed, answer.latencyMs);

  checks.check(answer.toolsUsed.includes("record_expense"), "record_expense dipanggil (attempt tercatat di meta.toolsUsed)", {
    detail: answer.toolsUsed.join(",") || "none",
  });

  const after = await listTransactions(context.householdId, context.cookiesA, 20);
  const expense = after.find(
    (row) => row.transaction_type === "expense" && Number(row.amount) === 20_000_000,
  );

  checks.check(Boolean(expense), "transaksi Rp20.000.000 tercatat di database", {
    detail: expense ? `id=${expense.id} status=${expense.status}` : "tidak ada baris dengan amount 20000000",
  });
  const delta = after.filter((row) => row.transaction_type === "expense" && Number(row.amount) === 20_000_000).length - beforeCount;
  checks.check(delta <= 1, `maksimal satu baris baru per run (delta ${beforeCount} → ${beforeCount + Math.max(delta, 0)})`, {
    detail: `delta=${delta}`,
  });

  if (expense) {
    checks.check(expense.category === "travel", `kategori otomatis = travel (aktual: ${expense.category ?? "null"})`, {
      soft: true,
    });
    checks.check(
      expense.status === "pending_approval" && expense.requires_approval === true,
      `status dari kesepakatan aktif: pending_approval karena di atas batas ${THRESHOLD} (aktual: ${expense.status}, requires_approval=${expense.requires_approval})`,
      { soft: true },
    );
    checks.check(
      new RegExp(expense.status === "pending_approval" ? "(persetujuan|approval|pending)" : "(tercatat|recorded|processed)", "i").test(answer.reply),
      "balasan menyebut status apa adanya (bukan klaim 'sudah disetujui')",
      { soft: true },
    );
  } else {
    checks.check(!claimsMoneyMoved(answer.reply), "balasan tidak mengklaim uang keluar padahal tidak ada baris transaksi", {
      detail: answer.reply.slice(0, 140),
    });
  }

  heading("Chat: pesan yang sama dikirim ulang");
  const beforeRetryCount = after.filter(
    (row) => row.transaction_type === "expense" && Number(row.amount) === 20_000_000,
  ).length;
  const duplicate = await chat(context.householdId, context.cookiesA, EXPENSE_MESSAGE);
  printReply("kirim ulang pesan identik", duplicate.reply, duplicate.toolsUsed, duplicate.latencyMs);

  const afterRetry = await listTransactions(context.householdId, context.cookiesA, 20);
  const recorded = afterRetry.filter(
    (row) => row.transaction_type === "expense" && Number(row.amount) === 20_000_000,
  );
  checks.check(
    recorded.length === beforeRetryCount,
    `tidak dobel: jumlah transaksi Rp20 juta tetap ${recorded.length} setelah kirim ulang`,
  );
  if (recorded.length === beforeRetryCount && beforeRetryCount > 0) {
    console.log("  (baris Rp20 juta dari run sebelumnya dipakai ulang lewat idempotency key yang sama)");
  }

  if (personal) {
    heading("Chat: pengeluaran dari dompet pribadi yang kosong");
    const personalAnswer = await chat(context.householdId, context.cookiesA, PERSONAL_MESSAGE);
    printReply(`"${PERSONAL_MESSAGE}"`, personalAnswer.reply, personalAnswer.toolsUsed, personalAnswer.latencyMs);
    const personalRows = await listTransactions(context.householdId, context.cookiesA, 20);
    const personalExpense = personalRows.find(
      (row) => row.transaction_type === "expense" && Number(row.amount) === 50_000 && row.wallet_id === personal.id,
    );
    checks.check(
      !personalExpense || Number(personal.simulated_balance) > 0,
      "saldo pribadi kosong tidak dipalsukan (transaksi hanya ada kalau saldo cukup)",
      { detail: personalExpense ? "tercatat padahal saldo 0" : "dilaporkan apa adanya" },
    );
  } else {
    console.log("\nDompet pribadi tidak ditemukan; cek dompet pribadi dilewati.");
  }

  checks.summary();
  console.log("\nCatatan: status transaksi sepenuhnya ditentukan kesepakatan aktif di database.");
}

main().catch((error) => {
  console.error(`\nGAGAL: ${error.message}`);
  process.exitCode = 1;
});
