/**
 * Manual test: same situation, three onboarding profiles.
 *
 * Run:
 *   npm run test:personalization
 *   node --env-file=.env.local scripts/test-personalization.mjs
 *
 * What it proves:
 *   1. Every reply is personalization-free of internal labels (never shown to the user).
 *   2. Emoji usage follows the profile rules (tightwad ~none, unconflicted none, spendthrift max one).
 *   3. Length ordering: unconflicted answers stay the shortest.
 *   4. The write tool `record_expense` is never offered for these discussion messages.
 * Style differences are model-driven, so wording checks are WARN; label leakage is a hard FAIL.
 */
import {
  PROFILES,
  FORBIDDEN_REPLY_WORDS,
  chat,
  countEmoji,
  heading,
  printReply,
  report,
  setOnboarding,
  setup,
} from "./lib/test-harness.mjs";

const SITUATIONS = [
  {
    title: "Situasi 1 — Pembelian di atas batas diskusi",
    message:
      "Aku lagi lihat jaket yang harganya Rp2,5 juta, padahal batas diskusi kita Rp2 juta. " +
      "Uang saku bulan ini sisa Rp1,8 juta dan dana rumah sudah 62%. Gimana menurutmu?",
  },
  {
    title: "Situasi 2 — Gajian masuk",
    message:
      "Gaji Rp8 juta barusan masuk. Auto-save Rp1,5 juta ke dana rumah dan Rp2,5 juta ke tagihan bersama " +
      "sudah jalan, uang saku Rp3,5 juta, pos bebas rasa bersalah Rp500 ribu.",
  },
  {
    title: "Situasi 9 — Tujuan tercapai",
    message:
      "Dana darurat sudah 3 bulan pengeluaran, 2 bulan lebih cepat dari target. " +
      "Ada tiga pilihan: rayakan berdua, naikkan target ke 6 bulan, atau alihkan auto-save ke dana rumah.",
  },
];

const EMOJI_LIMIT = { tightwad: 1, unconflicted: 0, spendthrift: 1 };

async function main() {
  const checks = report();
  const context = await setup();
  console.log(`Setup: household=${context.householdId} (${Object.entries(context.notes).map(([k, v]) => `${k}=${v}`).join(", ")})`);

  /** results[situationTitle][profileKey] = { reply, toolsUsed, latencyMs } */
  const results = new Map();

  for (const situation of SITUATIONS) {
    results.set(situation.title, new Map());

    for (const profile of PROFILES) {
      await setOnboarding(profile.personalization);
      const answer = await chat(context.householdId, context.cookiesA, situation.message);
      results.get(situation.title).set(profile.key, answer);
    }
  }

  for (const situation of SITUATIONS) {
    heading(situation.title);
    console.log(`Pesan: ${situation.message}\n`);

    let shortest = null;

    for (const profile of PROFILES) {
      const answer = results.get(situation.title).get(profile.key);
      printReply(profile.key, answer.reply, answer.toolsUsed, answer.latencyMs);

      const bandKey = profile.key.split(" ")[0];
      const emoji = countEmoji(answer.reply);
      const length = answer.reply.length;

      checks.check(
        !FORBIDDEN_REPLY_WORDS.test(answer.reply),
        `${bandKey}: label internal tidak muncul`,
        { detail: answer.reply.match(FORBIDDEN_REPLY_WORDS)?.[0] ?? "", soft: false },
      );
      checks.check(
        !answer.toolsUsed.includes("record_expense"),
        `${bandKey}: record_expense tidak ditawarkan untuk pesan diskusi`,
        { detail: answer.toolsUsed.join(",") || "none" },
      );
      checks.check(emoji <= EMOJI_LIMIT[bandKey], `${bandKey}: jumlah emoji ${emoji} (batas ${EMOJI_LIMIT[bandKey]})`, {
        soft: true,
      });

      if (!shortest || length < shortest.length) shortest = { bandKey, length };
      console.log(
        `    len=${length} chars | emoji=${emoji} | tools=${answer.toolsUsed.join(",") || "none"}`,
      );
    }

    checks.check(
      shortest?.bandKey === "unconflicted",
      `urutan panjang: unconflicted paling pendek (aktual terpendek: ${shortest?.bandKey} ${shortest?.length} char)`,
      { soft: true },
    );
  }

  checks.summary();
  console.log(
    "\nCatatan: cek nada/framing dibaca manual dari balasan di atas — fakta dan pilihan harus identik, " +
      "yang berbeda hanya bingkai, panjang, dan alasan yang ditekankan.",
  );
}

main().catch((error) => {
  console.error(`\nGAGAL: ${error.message}`);
  process.exitCode = 1;
});
