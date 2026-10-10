import { randomUUID } from "node:crypto";
import { AIProviderError } from "../errors";
import type { AICompletionResult, AIMessage, AIProviderAdapter, AIToolCall, AIUsage, ProviderGenerateRequest } from "../types";
import { asRecord, numberOrUndefined, parseArguments, postJson } from "./http";

type GeminiPart = Record<string, unknown>;

function parseToolResult(content: string): unknown {
  try { return JSON.parse(content) as unknown; } catch { return { result: content }; }
}

function buildGeminiContents(messages: AIMessage[]): { systemInstruction?: { parts: { text: string }[] }; contents: Record<string, unknown>[] } {
  const systemText = messages.filter((message) => message.role === "system").map((message) => message.content).join("\n\n").trim();
  const contents: Record<string, unknown>[] = [];

  for (const message of messages) {
    if (message.role === "system") continue;
    if (message.role === "user") {
      contents.push({ role: "user", parts: [{ text: message.content }] });
      continue;
    }
    if (message.role === "assistant") {
      // Gemini 3 requires provider-returned thought signatures and part ordering to
      // be echoed exactly. Preserve the original model parts on continuation turns.
      const providerMetadata = asRecord(message.providerMetadata);
      const geminiMetadata = asRecord(providerMetadata?.gemini);
      const originalParts = geminiMetadata?.modelParts;
      if (Array.isArray(originalParts)) {
        contents.push({ role: "model", parts: originalParts });
        continue;
      }
      const parts: GeminiPart[] = [];
      if (message.content) parts.push({ text: message.content });
      for (const call of message.toolCalls ?? []) {
        parts.push({ functionCall: { id: call.id, name: call.name, args: call.arguments } });
      }
      if (parts.length) contents.push({ role: "model", parts });
      continue;
    }
    // Gemini's REST API represents function responses as user-role parts.
    // The response id must match the functionCall id from the model.
    const functionResponse: Record<string, unknown> = {
      name: message.name ?? "unknown_tool",
      response: parseToolResult(message.content),
    };
    if (message.toolCallId) functionResponse.id = message.toolCallId;
    const lastContent = contents[contents.length - 1];
    const lastParts = Array.isArray(lastContent?.parts) ? lastContent.parts as GeminiPart[] : undefined;
    // Batch adjacent tool results into one user turn, as expected by Gemini.
    if (lastContent?.role === "user" && lastParts?.some((part) => "functionResponse" in part)) {
      lastParts.push({ functionResponse });
    } else {
      contents.push({ role: "user", parts: [{ functionResponse }] });
    }
  }

  return {
    ...(systemText ? { systemInstruction: { parts: [{ text: systemText }] } } : {}),
    contents,
  };
}

function normalize(data: unknown): Omit<AICompletionResult, "provider" | "model" | "latencyMs" | "attempts"> {
  const root = asRecord(data);
  const candidates = Array.isArray(root?.candidates) ? root.candidates : [];
  const candidate = asRecord(candidates[0]);
  const content = asRecord(candidate?.content);
  const parts = Array.isArray(content?.parts) ? content.parts : [];
  let text = "";
  const toolCalls: AIToolCall[] = [];
  for (const item of parts) {
    const part = asRecord(item);
    if (typeof part?.text === "string") text += part.text;
    const fc = asRecord(part?.functionCall);
    if (typeof fc?.name === "string" && fc.name) {
      toolCalls.push({
        id: typeof fc.id === "string" && fc.id ? fc.id : randomUUID(),
        name: fc.name,
        arguments: parseArguments(fc.args ?? {}),
      });
    }
  }
  text = text.trim();
  if (!text && toolCalls.length === 0) {
    throw new AIProviderError("Gemini returned no usable candidate", {
      retryable: true,
      providerUnavailable: true,
    });
  }
  const usageMeta = asRecord(root?.usageMetadata);
  const usage: AIUsage | undefined = usageMeta ? {
    inputTokens: numberOrUndefined(usageMeta.promptTokenCount),
    outputTokens: numberOrUndefined(usageMeta.candidatesTokenCount),
    totalTokens: numberOrUndefined(usageMeta.totalTokenCount),
  } : undefined;
  return {
    text,
    toolCalls,
    finishReason: typeof candidate?.finishReason === "string" ? candidate.finishReason : undefined,
    usage,
    // Preserve the exact response parts (including thought signatures) for Gemini
    // continuation. The orchestrator must copy this metadata onto the assistant
    // history message paired with these tool calls; never log or expose it.
    providerMetadata: { gemini: { modelParts: parts } },
  };
}

export const geminiProvider: AIProviderAdapter = {
  id: "gemini",
  label: "Google Gemini",
  get model() { return process.env.SEIYA_AI_GEMINI_MODEL?.trim() || "gemini-3.8-flash"; },
  supportsTools: true,
  isConfigured: () => Boolean(process.env.GOOGLE_API_KEY?.trim()),
  async generate(request: ProviderGenerateRequest) {
    const apiKey = process.env.GOOGLE_API_KEY?.trim();
    if (!apiKey) throw new AIProviderError("Google API key is missing");
    const model = this.model;
    const body: Record<string, unknown> = {
      ...buildGeminiContents(request.messages),
      generationConfig: { maxOutputTokens: request.maxOutputTokens },
    };
    if (request.tools?.length) {
      body.tools = [{ functionDeclarations: request.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        // The agent registry uses JSON Schema (including additionalProperties: false).
        // Gemini's `parameters` field expects its narrower Schema proto and rejects
        // JSON-Schema-only fields. Use `parametersJsonSchema` for the JSON Schema form.
        parametersJsonSchema: tool.parameters,
      })) }];
      body.toolConfig = { functionCallingConfig: {
        mode: request.toolChoice === "none" ? "NONE" : request.toolChoice === "required" ? "ANY" : "AUTO",
      } };
    }
    const data = await postJson<unknown>(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      { "x-goog-api-key": apiKey },
      body,
      request.timeoutMs,
    );
    return normalize(data);
  },
};
