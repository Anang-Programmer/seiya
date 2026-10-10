import { randomUUID } from "node:crypto";
import { AIProviderError } from "../errors";
import type { AICompletionResult, AIProviderAdapter, AIToolCall, ProviderGenerateRequest } from "../types";
import { asRecord, numberOrUndefined, parseArguments, postJson, textContent } from "./http";

/**
 * Cloudflare Workers AI is enabled for tool calls only with an explicit opt-in,
 * because function-calling support is model-specific. Verify the chosen model
 * in the Cloudflare catalog before setting SEIYA_AI_CLOUDFLARE_ENABLE_TOOLS=true.
 */
export const cloudflareProvider: AIProviderAdapter = {
  id: "cloudflare",
  label: "Cloudflare Workers AI",
  get model() { return process.env.SEIYA_AI_CLOUDFLARE_MODEL?.trim() || "@cf/meta/llama-3.2-1b-instruct"; },
  get supportsTools() { return process.env.SEIYA_AI_CLOUDFLARE_ENABLE_TOOLS === "true"; },
  isConfigured: () => Boolean(process.env.CLOUDFLARE_API_TOKEN?.trim() && process.env.CLOUDFLARE_ACCOUNT_ID?.trim()),
  async generate(request: ProviderGenerateRequest) {
    const token = process.env.CLOUDFLARE_API_TOKEN?.trim();
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
    if (!token || !accountId) throw new AIProviderError("Cloudflare Workers AI credentials are missing");
    if (request.tools?.length && !this.supportsTools) {
      throw new AIProviderError("Cloudflare tool calling has not been explicitly enabled", { providerUnavailable: true });
    }
    const body: Record<string, unknown> = {
      messages: request.messages.map((message) => {
        if (message.role === "tool") return { role: "tool", name: message.name, content: message.content };
        if (message.role === "assistant" && message.toolCalls?.length) {
          return {
            role: "assistant",
            content: JSON.stringify({ tool_calls: message.toolCalls.map((call) => ({ name: call.name, arguments: call.arguments })) }),
          };
        }
        return { role: message.role, content: message.content };
      }),
      max_tokens: request.maxOutputTokens,
      temperature: request.temperature,
    };
    if (request.tools?.length) {
      body.tools = request.tools.map((tool) => ({ name: tool.name, description: tool.description, parameters: tool.parameters }));
    }
    const data = await postJson<unknown>(
      `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/run/${this.model}`,
      { Authorization: `Bearer ${token}` },
      body,
      request.timeoutMs,
    );
    const root = asRecord(data);
    const result = asRecord(root?.result) ?? root;
    const rawCalls = Array.isArray(result?.tool_calls) ? result.tool_calls : [];
    const toolCalls: AIToolCall[] = rawCalls.map((value) => {
      const call = asRecord(value);
      const fn = asRecord(call?.function);
      const name = typeof call?.name === "string" ? call.name : fn?.name;
      const args = call?.arguments ?? fn?.arguments;
      if (typeof name !== "string" || !name) throw new AIProviderError("Cloudflare returned a tool call without a name", { retryable: true, providerUnavailable: true });
      return { id: typeof call?.id === "string" ? call.id : randomUUID(), name, arguments: parseArguments(args ?? {}) };
    });
    const text = textContent(result?.response ?? result?.output_text ?? result?.content);
    if (!text && toolCalls.length === 0) throw new AIProviderError("Cloudflare returned an empty completion", { retryable: true, providerUnavailable: true });
    return {
      text,
      toolCalls,
      finishReason: typeof result?.finish_reason === "string" ? result.finish_reason : undefined,
      usage: {
        inputTokens: numberOrUndefined(result?.prompt_tokens),
        outputTokens: numberOrUndefined(result?.completion_tokens),
        totalTokens: numberOrUndefined(result?.total_tokens),
      },
    };
  },
};
