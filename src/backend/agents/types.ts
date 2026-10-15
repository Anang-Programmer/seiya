export type AIProviderId = "groq" | "gemini" | "mistral" | "openrouter" | "cloudflare";
export type AIMessageRole = "system" | "user" | "assistant" | "tool";
export type AIToolChoice = "auto" | "none" | "required";
export type AIDataClassification = "private" | "public";

export interface JSONSchemaObject {
  type: "object";
  properties?: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
  [key: string]: unknown;
}

export interface AIToolDefinition {
  name: string;
  description: string;
  parameters: JSONSchemaObject;
}

export interface AIToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface AIMessage {
  role: AIMessageRole;
  content: string;
  /** Required for role=tool when using OpenAI-compatible providers. */
  toolCallId?: string;
  /** Required for role=tool; identifies which function produced the result. */
  name?: string;
  /** Set only for assistant messages that contain a previous model tool call. */
  toolCalls?: AIToolCall[];
  /** Opaque provider-specific continuation metadata; never display or log this. */
  providerMetadata?: Record<string, unknown>;
}

export interface AICompletionRequest {
  messages: AIMessage[];
  tools?: AIToolDefinition[];
  toolChoice?: AIToolChoice;
  maxOutputTokens?: number;
  temperature?: number;
  /** Prefer the provider that produced a prior tool call, so its continuation format is preserved. */
  preferredProvider?: AIProviderId;
  /** Whole-router budget, including fallback attempts. */
  totalTimeoutMs?: number;
  /** Defaults to private; needed to protect household financial context. */
  dataClassification?: AIDataClassification;
}

export interface AIUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface AICompletionResult {
  provider: AIProviderId;
  model: string;
  text: string;
  toolCalls: AIToolCall[];
  finishReason?: string;
  usage?: AIUsage;
  /** Opaque provider-specific continuation metadata for the next turn. */
  providerMetadata?: Record<string, unknown>;
  latencyMs: number;
  attempts: number;
}

export interface ProviderGenerateRequest {
  messages: AIMessage[];
  tools?: AIToolDefinition[];
  toolChoice: AIToolChoice;
  maxOutputTokens: number;
  temperature: number;
  timeoutMs: number;
  dataClassification: AIDataClassification;
}

export interface AIProviderAdapter {
  id: AIProviderId;
  label: string;
  model: string;
  supportsTools: boolean;
  /**
   * True when the vendor signs its own functionCall parts (Gemini thought signatures) and rejects
   * tool-call messages produced by another provider. Continuation turns then stay with the original
   * provider or the turn fails over only to vendors without this requirement.
   */
  requiresToolThoughtSignature?: boolean;
  isConfigured(): boolean;
  generate(request: ProviderGenerateRequest): Promise<Omit<AICompletionResult, "provider" | "model" | "latencyMs" | "attempts">>;
}
