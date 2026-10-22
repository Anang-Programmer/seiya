/**
 * Manual test: both partners can continue a shared Ask Seiya conversation,
 * while a private one stays owner-only.
 *
 * Run (dev server must be running):
 *   npm run test:shared-chat
 *   node --env-file=.env.local scripts/test/shared-chat.mjs
 *
 * Sends three short questions to Seiya (uses AI tokens) and deletes the test
 * conversation at the end.
 */
import { NAME_B, EMAIL_B, api, chat, heading, login, report, sbSession, setup } from "./lib/test-harness.mjs";

async function send(householdId, cookies, message, conversationId) {
  return api("/api/ai/chat", {
    method: "POST",
    cookies,
    body: { householdId, message, conversationId },
    timeoutMs: 60_000,
  });
}

async function main() {
  const checks = report();
  const { householdId, cookiesA, sbA } = await setup();
  const cookiesB = await login(EMAIL_B, NAME_B);
  const { client: sbB } = await sbSession(EMAIL_B);
  const { data: userA } = await sbA.auth.getUser();
  const { data: userB } = await sbB.auth.getUser();

  heading("A memulai chat lalu membagikannya");
  const first = await chat(householdId, cookiesA, "QA shared chat: tagihan apa saja yang jatuh tempo bulan ini?");
  const conversationId = first.conversationId;
  checks.check(Boolean(conversationId), "A: percakapan tersimpan", { detail: conversationId });

  const privateTry = await send(householdId, cookiesB, "QA: boleh saya ikut tanya?", conversationId);
  checks.check(privateTry.status === 404, "B tidak bisa menulis di chat pribadi A", { detail: `status ${privateTry.status}` });

  const share = await api(`/api/households/${householdId}/chat-history/${conversationId}`, {
    method: "PATCH",
    cookies: cookiesA,
    body: { visibility: "shared" },
  });
  checks.check(share.status === 200, "A membagikan chat", { detail: `status ${share.status}` });

  heading("B melanjutkan chat yang dibagikan");
  const reply = await send(householdId, cookiesB, "QA shared chat: berapa saldo dompet bersama kita sekarang?", conversationId);
  checks.check(reply.status === 200 && reply.data?.success, "B: Seiya menjawab di chat bersama", { detail: `status ${reply.status}` });
  checks.check(reply.data?.historySaved === true, "B: giliran B tersimpan di percakapan yang sama", {
    detail: `historySaved=${reply.data?.historySaved}`,
  });
  checks.check(reply.data?.conversationId === conversationId, "B: tetap di percakapan milik A");

  heading("Riwayat terlihat sama oleh A dan B");
  for (const [label, cookies] of [["A", cookiesA], ["B", cookiesB]]) {
    const history = await api(`/api/households/${householdId}/chat-history`, { cookies });
    const rows = (history.data?.messages ?? []).filter((m) => m.conversation_id === conversationId);
    const userRows = rows.filter((m) => m.role === "user");
    checks.check(rows.length === 4, `${label}: 2 pertanyaan + 2 jawaban`, { detail: `${rows.length} pesan` });
    checks.check(
      userRows[0]?.sender_user_id === userA.user?.id && userRows[1]?.sender_user_id === userB.user?.id,
      `${label}: tiap pertanyaan tercatat dengan pengirimnya (A lalu B)`,
    );
    checks.check(rows[0]?.role === "user" && rows[1]?.role === "assistant", `${label}: pertanyaan tampil sebelum jawaban`);
  }

  heading("A menjadikan chat pribadi lagi");
  const unshare = await api(`/api/households/${householdId}/chat-history/${conversationId}`, {
    method: "PATCH",
    cookies: cookiesA,
    body: { visibility: "private" },
  });
  checks.check(unshare.status === 200, "A menjadikan chat pribadi", { detail: `status ${unshare.status}` });
  const blocked = await send(householdId, cookiesB, "QA: masih bisa?", conversationId);
  checks.check(blocked.status === 404, "B tidak bisa menulis lagi setelah chat jadi pribadi", { detail: `status ${blocked.status}` });

  const direct = await sbB.rpc("append_agent_conversation_turn", {
    p_household_id: householdId,
    p_conversation_id: conversationId,
    p_user_content: "QA direct",
    p_assistant_content: "QA direct",
  });
  checks.check(Boolean(direct.error), "RPC langsung oleh B ke chat pribadi A ditolak database", { detail: direct.error?.message });

  heading("Bersih-bersih");
  const removed = await api(`/api/households/${householdId}/chat-history/${conversationId}`, { method: "DELETE", cookies: cookiesA });
  checks.check(removed.status === 200, "chat uji dihapus", { detail: `status ${removed.status}` });

  checks.summary();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
