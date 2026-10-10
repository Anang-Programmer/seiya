import { randomUUID } from "node:crypto";
import { AIProviderError } from "../errors";
import type { AICompletionResult, AIMessage, AIProviderAdapter, AIToolCall, AIToolDefinition, ProviderGenerateRequest } from "../types";
import { asRecord, numberOrUndefined, parseArguments, postJson, textContent } from "./http";

type OpenAICompatibleConfig = {
  id: "groq" | "mistral" | "openrouter";
  label: string;
  endpoint: string;
  keyName: string;
  modelName: string;
  defaultModel: string;
  maxTokenField: "max_tokens" | "max_completion_tokens";
  extraHeaders?: Record<string, string>;
  requirePrivateDataSafeModel?: boolean;
};

function mapMessage(message: AIMessage): Record<string, unknown> {
  if (message.role === "assistant" && message.toolCalls?.length) {
    return {
      role: "assistant",
      content: message.content || null,
      tool_calls: message.toolCalls.map((call) => ({
        id: call.id,
        type: "function",
        function: { name: call.name, arguments: JSON.stringify(call.arguments) },
      })),
    };
  }
  if (message.role === "tool") {
    return {
      role: "tool",
      tool_call_id: message.toolCallId,
      name: message.name,
      content: message.content,
    };
  }
  return { role: message.role, content: message.content };
}

function mapTools(tools: AIToolDefinition[]): Record<string, unknown>[] {
  return tools.map((tool) => ({
    type: "function",
    function: { name: tool.name, description: tool.description, parameters: tool.parameters },
  }));
}

function normalize(data: unknown): Omit<AICompletionResult, "provider" | "model" | "latencyMs" | "attempts"> {
  const root = asRecord(data);
  const choices = Array.isArray(root?.choices) ? root.choices : [];
  const choice = asRecord(choices[0]);
  const message = asRecord(choice?.message);
  const rawCalls = Array.isArray(message?.tool_calls) ? message.tool_calls : [];
  const toolCalls: AIToolCall[] = rawCalls.map((raw, index) => {
    const call = asRecord(raw);
    const fn = asRecord(call?.function);
    if (typeof fn?.name !== "string" || !fn.name) {
      throw new AIProviderError("Provider returned tool call without a function name", { retryable: true, providerUnavailable: true });
    }
    return {
      id: typeof call?.id === "string" && call.id ? call.id : randomUUID(),
      name: fn.name,
      arguments: parseArguments(fn.arguments),
    };
  });
  const text = textContent(message?.content);
  if (!text && toolCalls.length === 0) {
    throw new AIProviderError("Provider returned an empty completion", { retryable: true, providerUnavailable: true });
  }

  const usage = asRecord(root?.usage);
  return {
    text,
    toolCalls,
    finishReason: typeof choice?.finish_reason === "string" ? choice.finish_reason : undefined,
    usage: usage ? {
      inputTokens: numberOrUndefined(usage.prompt_tokens),
      outputTokens: numberOrUndefined(usage.completion_tokens),
      totalTokens: numberOrUndefined(usage.total_tokens),
    } : undefined,
  };
}

export function createOpenAICompatibleProvider(config: OpenAICompatibleConfig): AIProviderAdapter {
  const key = () => process.env[config.keyName]?.trim() ?? "";
  const model = () => process.env[config.modelName]?.trim() || config.defaultModel;

  return {
    id: config.id,
    label: config.label,
    get model() { return model(); },
    supportsTools: true,
    isConfigured: () => Boolean(key()),
    async generate(request: ProviderGenerateRequest) {
      if (config.requirePrivateDataSafeModel && model().endsWith(":free") && request.dataClassification !== "public") {
        throw new AIProviderError("OpenRouter :free models are disabled for private financial context", {
          retryable: false,
          providerUnavailable: true,
        });
      }
      const body: Record<string, unknown> = {
        model: model(),
        messages: request.messages.map(mapMessage),
        [config.maxTokenField]: request.maxOutputTokens,
        temperature: request.temperature,
      };
      if (request.tools?.length) {
        body.tools = mapTools(request.tools);
        body.tool_choice = request.toolChoice === "required" ? "required" : request.toolChoice;
      }
      const data = await postJson<unknown>(config.endpoint, { Authorization: `Bearer ${key()}`, ...(config.extraHeaders ?? {}) }, body, request.timeoutMs);
      return normalize(data);
    },
  };
}
