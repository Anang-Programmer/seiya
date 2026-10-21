/**
 * Manual test: one-shot environment/setup check.
 *
 * Run:
 *   npm run test:setup
 *   node --env-file=.env.local scripts/test/setup.mjs
 *
 * Creates (or reuses) the test accounts, household, partner membership, active finance agreement,
 * and wallets, then prints the ids. Run this first when another test script fails during setup.
 */
import { NAME_A, NAME_B, PASSWORD, heading, report, setup } from "./lib/test-harness.mjs";

async function main() {
  const checks = report();

  heading("Setup");
  const context = await setup();
  console.log(`householdId : ${context.householdId}`);
  console.log(`akun A      : ${NAME_A}`);
  console.log(`akun B      : ${NAME_B} (password sama: ${PASSWORD})`);
  for (const [key, value] of Object.entries(context.notes)) {
    console.log(`${key.padEnd(11)}: ${value}`);
  }

  checks.check(Boolean(context.householdId), "household siap");
  checks.check(true, `keanggotaan pasangan: ${context.notes.partner}`, { soft: true });
  checks.check(["already-active", "activated"].includes(context.notes.agreement), `kesepakatan aktif: ${context.notes.agreement}`, {
    soft: true,
  });

  checks.summary();
  console.log("\nSelanjutnya: npm run test:personalization | test:wellness | test:expense");
}

main().catch((error) => {
  console.error(`\nGAGAL: ${error.message}`);
  process.exitCode = 1;
});
