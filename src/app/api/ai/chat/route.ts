import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { AIProviderRouterError } from "@/backend/agents";
import { runSeiyaAgent, type AgentHistoryMessage } from "@/backend/agents/agent.service";
import { consumeAgentRequestAllowance } from "@/backend/agents/request-limiter";
import { validateAgentChatInput } from "@/backend/agents/validators";
import {
  buildStylePromptBlock,
  buildWellnessPromptBlock,
  detectWellnessState,
  readPersonalizationAnswers,
} from "@/backend/personalization";

const MAX_BODY_BYTES = 16_000;
const MAX_HISTORY_MESSAGES = 6;
const MAX_HISTORY_CHARS = 5_200;
const RESPONSE_HEADERS = { "Cache-Control": "no-store, max-age=0" };

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: RESPONSE_HEADERS });
}

function mapAgentError(error: unknown): { status: number; code: string; message: string } {
  if (error instanceof AIProviderRouterError) {
    switch (error.code) {
      case "NO_PROVIDER_CONFIGURED":
      case "NO_CAPABLE_PROVIDER":
      case "ALL_PROVIDERS_FAILED":
        return { status: 503, code: error.code, message: "Seiya AI is temporarily unavailable. Please retry shortly." };
      case "DEADLINE_EXCEEDED":
        return { status: 504, code: error.code, message: "The request timed out. Please try asking a more specific question." };
      case "INVALID_REQUEST":
        return { status: 502, code: error.code, message: "The AI model could not process this request in a safe format." };
    }
  }
  return { status: 500, code: "AGENT_INTERNAL_ERROR", message: "An error occurred while processing the message. Please try again later." };
}

type StoredHistoryRow = { role: "user" | "assistant"; content: string; created_at: string };

function isValidHistoryRow(value: unknown): value is StoredHistoryRow {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return (row.role === "user" || row.role === "assistant")
    && typeof row.content === "string"
    && typeof row.created_at === "string";
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      if (new URL(origin).origin !== new URL(request.url).origin) {
        return json({ success: false, message: "Cross-origin requests are not allowed." }, 403);
      }
    } catch {
      return json({ success: false, message: "Invalid request origin." }, 403);
    }
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
    return json({ success: false, message: "Request body is too large." }, 413);
  }

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return json({ success: false, message: "Login required." }, 401);
  }

  const allowance = consumeAgentRequestAllowance(user.id);
  if (!allowance.allowed) {
    return NextResponse.json(
      { success: false, message: "Rate limit exceeded. Please wait a moment before sending another message." },
      { status: 429, headers: { ...RESPONSE_HEADERS, "Retry-After": String(allowance.retryAfterSeconds) } },
    );
  }

  let body: unknown;
  try {
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
      return json({ success: false, message: "Request body is too large." }, 413);
    }
    body = JSON.parse(rawBody) as unknown;
  } catch {
    return json({ success: false, message: "Invalid JSON body." }, 400);
  }

  const validation = validateAgentChatInput(body);
  if (!validation.ok) return json({ success: false, message: validation.message }, 400);
  const input = validation.data;

  // Bind every request to the authenticated user's active membership; never trust a client-supplied user ID.
  const { data: membership, error: membershipError } = await supabase
    .from("household_members")
    .select("id")
    .eq("household_id", input.householdId)
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  if (membershipError) {
    console.warn("[Seiya Agent] membership lookup failed", { code: membershipError.code ?? "unknown" });
    return json({ success: false, message: "Unable to verify household access." }, 500);
  }
  if (!membership) return json({ success: false, message: "Active household membership is required." }, 403);

  let history: AgentHistoryMessage[] = [];
  if (input.conversationId) {
    const { data: conversation, error: conversationError } = await supabase
      .from("agent_conversations")
      .select("id, household_id, user_id, visibility")
      .eq("id", input.conversationId)
      .eq("household_id", input.householdId)
      .eq("user_id", user.id)
      .eq("visibility", "private")
      .maybeSingle();

    if (conversationError) {
      console.warn("[Seiya Agent] conversation lookup failed", { code: conversationError.code ?? "unknown" });
      return json({ success: false, message: "Unable to load this conversation." }, 500);
    }
    if (!conversation) return json({ success: false, message: "Conversation not found or not accessible." }, 404);

    const { data: rows, error: historyError } = await supabase
      .from("agent_messages")
      .select("role, content, created_at")
      .eq("conversation_id", input.conversationId)
      .in("role", ["user", "assistant"])
      .order("created_at", { ascending: false })
      .limit(MAX_HISTORY_MESSAGES);

    if (historyError) {
      console.warn("[Seiya Agent] history lookup failed", { code: historyError.code ?? "unknown" });
      return json({ success: false, message: "Unable to load conversation history." }, 500);
    }

    history = (rows ?? [])
      .filter(isValidHistoryRow)
      .reverse()
      .map((row: StoredHistoryRow) => ({
        role: row.role,
        content: row.content.slice(0, row.role === "user" ? 1_600 : 2_000),
      }));

    // Keep total history small even when several assistant replies are near the maximum length.
    let historyCharacters = 0;
    const compacted: AgentHistoryMessage[] = [];
    for (const item of history.slice().reverse()) {
      const content = item.content.slice(0, Math.max(0, MAX_HISTORY_CHARS - historyCharacters));
      if (!content) break;
      compacted.push({ ...item, content });
      historyCharacters += content.length;
    }
    history = compacted.reverse();
  }

  // Wellbeing takes priority over profiling: in those states no style block is built at all.
  const wellness = detectWellnessState(input.message);
  let styleContext: string | null = null;

  if (!wellness) {
    const { data: onboarding, error: onboardingError } = await supabase
      .from("onboarding_responses")
      .select("answers")
      .eq("user_id", user.id)
      .not("completed_at", "is", null)
      .order("response_version", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (onboardingError) {
      console.warn("[Seiya Agent] onboarding lookup failed", { code: onboardingError.code ?? "unknown" });
    } else {
      styleContext = buildStylePromptBlock(readPersonalizationAnswers(onboarding?.answers));
    }
  }

  let agentResult;
  try {
    agentResult = await runSeiyaAgent({
      supabase,
      householdId: input.householdId,
      userId: user.id,
      message: input.message,
      history,
      styleContext: buildWellnessPromptBlock(wellness) ?? styleContext,
      wellness,
    });
  } catch (error) {
    const mapped = mapAgentError(error);
    console.warn("[Seiya Agent] turn failed", { code: mapped.code });
    return json({ success: false, code: mapped.code, message: mapped.message }, mapped.status);
  }

  // Persist only the user turn and final assistant answer. Raw tool results and provider continuation
  // metadata (including Gemini thought signatures) are intentionally not saved to chat history.
  const { data: conversationId, error: saveError } = await supabase.rpc("append_agent_conversation_turn", {
    p_household_id: input.householdId,
    p_conversation_id: input.conversationId ?? null,
    p_user_content: input.message,
    p_assistant_content: agentResult.message,
  });

  if (saveError || typeof conversationId !== "string") {
    console.warn("[Seiya Agent] conversation persistence failed", { code: saveError?.code ?? "unknown" });
    // The generated answer remains useful; explicitly tell the client that history was not persisted.
    return json({
      success: true,
      message: agentResult.message,
      ...(agentResult.cardType ? { cardType: agentResult.cardType } : {}),
      ...(agentResult.cardData ? { cardData: agentResult.cardData } : {}),
      conversationId: input.conversationId ?? null,
      historySaved: false,
      warning: "Response generated, but conversation history could not be saved. Subsequent messages might lack this context.",
      meta: {
        provider: agentResult.provider,
        latencyMs: agentResult.latencyMs,
        toolsUsed: agentResult.toolsUsed,
        ...(agentResult.usage ? { usage: agentResult.usage } : {}),
        ...(agentResult.usageByProvider ? { usageByProvider: agentResult.usageByProvider } : {}),
        modelCalls: agentResult.modelCalls,
        rag: agentResult.rag,
      },
    });
  }

  return json({
    success: true,
    message: agentResult.message,
    ...(agentResult.cardType ? { cardType: agentResult.cardType } : {}),
    ...(agentResult.cardData ? { cardData: agentResult.cardData } : {}),
    conversationId,
    historySaved: true,
    meta: {
      provider: agentResult.provider,
      latencyMs: agentResult.latencyMs,
      toolsUsed: agentResult.toolsUsed,
      ...(agentResult.usage ? { usage: agentResult.usage } : {}),
      ...(agentResult.usageByProvider ? { usageByProvider: agentResult.usageByProvider } : {}),
      modelCalls: agentResult.modelCalls,
      rag: agentResult.rag,
    },
  });
}
