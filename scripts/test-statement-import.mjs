import { BASE_URL, heading, report, setup } from "./lib/test-harness.mjs";
import * as XLSX from "xlsx";

async function main() {
  const checks = report();
  const context = await setup();
  console.log(`Setup: household=${context.householdId}`);

  heading("Statement Import: CSV Dry-Run Preview");

  const sampleCsv = `Tanggal,Keterangan,Mutasi,Saldo
15/10/2026,TRSF E-BKG 1234/F&B/KOPI KENANGAN JKT,25000.00 DB,5000000.00
16/10/2026,PEMBELIAN TOKOPEDIA 987654321,150000.00 DB,4850000.00
17/10/2026,TAGIHAN PLN LISTRIK PASCABAYAR,350000.00 DB,4500000.00
18/10/2026,GRAB TRANSPORT JAKARTA PUSAT,35000.00 DB,4465000.00
19/10/2026,PAYROLL GAJI BULANAN OKTOBER,15000000.00 CR,19465000.00`;

  const blob = new Blob([sampleCsv], { type: "text/csv" });
  const form = new FormData();
  form.append("file", blob, "mutasi_bca_oktober.csv");
  form.append("dryRun", "true");
  form.append("walletType", "shared");

  const dryRunRes = await fetch(`${BASE_URL}/api/households/${context.householdId}/statement-import`, {
    method: "POST",
    headers: { cookie: context.cookiesA },
    body: form,
  });

  const dryRunData = await dryRunRes.json();
  checks.check(dryRunRes.status === 200, `dry-run status 200 (actual: ${dryRunRes.status})`);
  checks.check(dryRunData.success === true, "dry-run success true");
  checks.check(dryRunData.extractedCount === 5, `extracted 5 transactions (actual: ${dryRunData.extractedCount})`);

  const txs = dryRunData.transactions || [];
  const kopi = txs.find((t) => t.rawDescription.includes("KOPI KENANGAN"));
  checks.check(kopi && kopi.category === "Food & Drinks", `Kopi Kenangan -> Food & Drinks (actual: ${kopi?.category})`);

  const toped = txs.find((t) => t.rawDescription.includes("TOKOPEDIA"));
  checks.check(toped && toped.category === "Shopping", `Tokopedia -> Shopping (actual: ${toped?.category})`);

  const pln = txs.find((t) => t.rawDescription.includes("PLN"));
  checks.check(pln && pln.category === "Bills", `PLN -> Bills (actual: ${pln?.category})`);

  const grab = txs.find((t) => t.rawDescription.includes("GRAB"));
  checks.check(grab && grab.category === "Transportation", `Grab -> Transportation (actual: ${grab?.category})`);

  const payroll = txs.find((t) => t.rawDescription.includes("PAYROLL"));
  checks.check(payroll && payroll.category === "Income" && payroll.type === "income", `Payroll -> Income (actual: ${payroll?.category})`);

  heading("Statement Import: Excel (.xlsx) Dry-Run Preview");

  const wsData = [
    ["Date", "Description", "Debit", "Credit"],
    ["2026-10-15", "STARBUCKS COFFEE INDONESIA", 65000, 0],
    ["2026-10-16", "HALODOC KONSULTASI DOKTER", 50000, 0],
  ];
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  const xlsxBuf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  const xlsxBlob = new Blob([xlsxBuf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const xlsxForm = new FormData();
  xlsxForm.append("file", xlsxBlob, "mutasi_mandiri.xlsx");
  xlsxForm.append("dryRun", "true");

  const xlsxRes = await fetch(`${BASE_URL}/api/households/${context.householdId}/statement-import`, {
    method: "POST",
    headers: { cookie: context.cookiesA },
    body: xlsxForm,
  });

  const xlsxData = await xlsxRes.json();
  checks.check(xlsxRes.status === 200, `xlsx dry-run status 200 (actual: ${xlsxRes.status})`);
  checks.check(xlsxData.extractedCount === 2, `xlsx extracted 2 transactions (actual: ${xlsxData.extractedCount})`);

  const starbucks = (xlsxData.transactions || []).find((t) => t.rawDescription.includes("STARBUCKS"));
  checks.check(starbucks && starbucks.category === "Food & Drinks", `Starbucks -> Food & Drinks (actual: ${starbucks?.category})`);

  const halodoc = (xlsxData.transactions || []).find((t) => t.rawDescription.includes("HALODOC"));
  checks.check(halodoc && halodoc.category === "Health", `Halodoc -> Health (actual: ${halodoc?.category})`);

  heading("Statement Import: Commit Batch to Database");

  const commitForm = new FormData();
  commitForm.append("file", blob, "mutasi_bca_commit.csv");
  commitForm.append("dryRun", "false");
  commitForm.append("walletType", "shared");

  const commitRes = await fetch(`${BASE_URL}/api/households/${context.householdId}/statement-import`, {
    method: "POST",
    headers: { cookie: context.cookiesA },
    body: commitForm,
  });

  const commitData = await commitRes.json();
  checks.check(commitRes.status === 201, `commit status 201 (actual: ${commitRes.status})`);
  checks.check(commitData.success === true, "commit success true");
  checks.check(commitData.importedCount === 5, `imported 5 transactions (actual: ${commitData.importedCount})`);

  const listRes = await fetch(`${BASE_URL}/api/households/${context.householdId}/transactions?limit=100`, {
    headers: { cookie: context.cookiesA },
  });
  const listData = await listRes.json();
  const dbTxs = listData.transactions || [];
  const foundKopi = dbTxs.find((t) => (t.title || "").toLowerCase().includes("kopi kenangan") || (t.description || "").toLowerCase().includes("kopi kenangan"));
  checks.check(Boolean(foundKopi), "committed transaction persisted and queryable in transactions table");

  checks.summary();
  console.log("\nStatement import verification completed!");
}

main().catch((err) => {
  console.error("Test execution failed:", err);
  process.exitCode = 1;
});
