import "server-only";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface AgentChatInput {
  householdId: string;
  conversationId?: string;
  message: string;
}

export type AgentChatValidation =
  | { ok: true; data: AgentChatInput }
  | { ok: false; message: string };

export function validateAgentChatInput(value: unknown): AgentChatValidation {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, message: "Request body must be a JSON object." };
  }

  const body = value as Record<string, unknown>;
  const allowedKeys = new Set(["householdId", "conversationId", "message"]);
  if (Object.keys(body).some((key) => !allowedKeys.has(key))) {
    return { ok: false, message: "Request contains an unsupported field." };
  }

  if (typeof body.householdId !== "string" || !UUID_PATTERN.test(body.householdId)) {
    return { ok: false, message: "A valid householdId is required." };
  }

  if (body.conversationId !== undefined &&
      (typeof body.conversationId !== "string" || !UUID_PATTERN.test(body.conversationId))) {
    return { ok: false, message: "conversationId must be a valid UUID when provided." };
  }

  if (typeof body.message !== "string") {
    return { ok: false, message: "message must be a string." };
  }

  const message = body.message.trim();
  if (!message) return { ok: false, message: "Please enter a message." };
  if (message.length > 2_000) {
    return { ok: false, message: "Message is too long. Keep it under 2,000 characters." };
  }

  return {
    ok: true,
    data: {
      householdId: body.householdId,
      ...(typeof body.conversationId === "string" ? { conversationId: body.conversationId } : {}),
      message,
    },
  };
}
