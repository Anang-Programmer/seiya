/**
 * Removes the QA household used by the test scripts, so the app is not full of
 * "QA ..." goals, transactions and chats. Only the household whose ACTIVE
 * members are exactly the two harness accounts is touched; real households are
 * never matched. Everything in it (wallets, transactions, approvals, bills,
 * goals, chats) is deleted through ON DELETE CASCADE.
 *
 * Run:
 *   node --env-file=.env.local scripts/cleanup-test-data.mjs            # dry run: shows what would go
 *   node --env-file=.env.local scripts/cleanup-test-data.mjs --confirm  # deletes it
 *
 * Afterwards `npm run test:setup` creates a fresh, empty QA household.
 * Needs SUPABASE_SERVICE_ROLE_KEY in .env.local. Deletion is permanent.
 */
import { createClient } from "@supabase/supabase-js";
import { EMAIL_A, EMAIL_B, NAME_A, NAME_B } from "./lib/test-harness.mjs";

const confirm = process.argv.includes("--confirm");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in .env.local.");

const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

async function userId(email) {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    const found = data.users.find((u) => u.email?.toLowerCase() === email);
    if (found) return found.id;
    if (data.users.length < 200) break;
  }
  return null;
}

const idA = await userId(EMAIL_A);
const idB = await userId(EMAIL_B);
if (!idA || !idB) {
  console.log(`Test accounts not found (${NAME_A}: ${Boolean(idA)}, ${NAME_B}: ${Boolean(idB)}). Nothing to do.`);
  process.exit(0);
}

const { data: memberships, error: memberError } = await admin
  .from("household_members")
  .select("household_id")
  .eq("user_id", idA)
  .eq("status", "active");
if (memberError) throw new Error(memberError.message);

const targets = [];
for (const { household_id: householdId } of memberships ?? []) {
  const { data: members } = await admin
    .from("household_members")
    .select("user_id")
    .eq("household_id", householdId)
    .eq("status", "active");
  const ids = new Set((members ?? []).map((m) => m.user_id));
  // Exactly the two QA accounts, nobody else.
  if (ids.size === 2 && ids.has(idA) && ids.has(idB)) targets.push(householdId);
}

if (!targets.length) {
  console.log("No QA household found. Nothing to do.");
  process.exit(0);
}

const count = async (table, householdId) =>
  (await admin.from(table).select("id", { count: "exact", head: true }).eq("household_id", householdId)).count ?? 0;

for (const householdId of targets) {
  const { data: household } = await admin.from("households").select("name").eq("id", householdId).single();
  const summary = {};
  for (const table of ["transactions", "approvals", "plans", "bills", "activities", "agent_conversations", "held_purchases"]) {
    summary[table] = await count(table, householdId);
  }
  console.log(`QA household "${household?.name}" (${householdId}) — members: ${NAME_A}, ${NAME_B}`);
  console.table(summary);

  if (!confirm) {
    console.log("Dry run. Re-run with --confirm to delete this household and everything in it.");
    continue;
  }
  const { error } = await admin.from("households").delete().eq("id", householdId);
  if (error) throw new Error(`Delete failed: ${error.message}`);
  console.log("Deleted. Run `npm run test:setup` to create a fresh QA household.");
}
