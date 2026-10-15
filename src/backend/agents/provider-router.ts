import "server-only";
import { AIProviderError, AIProviderRouterError } from "./errors";
import { providerRegistry } from "./providers";
import type { AICompletionRequest, AICompletionResult, AIProviderId, AIProviderAdapter, ProviderGenerateRequest } from "./types";

const DEFAULT_PROVIDER_ORDER: AIProviderId[] = ["groq", "gemini", "mistral", "openrouter", "cloudflare"];
// Only vendors explicitly reviewed for private household-finance context are eligible by default.
const DEFAULT_PRIVATE_PROVIDER_ALLOWLIST: AIProviderId[] = ["groq", "gemini", "mistral"];
const PROVIDER_COOLDOWN_UNTIL = new Map<AIProviderId, number>();

function parseProviderOrder(): AIProviderId[] {
  const raw = process.env.SEIYA_AI_PROVIDER_ORDER?.trim();
  if (!raw) return DEFAULT_PROVIDER_ORDER;
  const ids = raw.split(",").map((id) => id.trim().toLowerCase()).filter(Boolean);
  const valid = ids.filter((id): id is AIProviderId => Object.prototype.hasOwnProperty.call(providerRegistry, id));
  return valid.length ? [...new Set(valid)] : DEFAULT_PROVIDER_ORDER;
}

function boundedInt(value: number | undefined, fallback: number, min: number, max: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function privateProviderAllowlist(): Set<AIProviderId> {
  const raw = process.env.SEIYA_AI_PRIVATE_PROVIDER_ALLOWLIST?.trim();
  if (!raw) return new Set(DEFAULT_PRIVATE_PROVIDER_ALLOWLIST);
  const allowed = raw.split(",").map((id) => id.trim().toLowerCase())
    .filter((id): id is AIProviderId => Object.prototype.hasOwnProperty.call(providerRegistry, id));
  return new Set(allowed);
}

function validateRequest(request: AICompletionRequest): void {
  if (!Array.isArray(request.messages) || request.messages.length === 0) {
    throw new AIProviderRouterError("INVALID_REQUEST", "AI request must contain at least one message.");
  }
  if (request.messages.some((message) => typeof message.content !== "string")) {
    throw new AIProviderRouterError("INVALID_REQUEST", "Every message must have string content.");
  }
  const tools = request.tools ?? [];
  const names = new Set<string>();
  for (const tool of tools) {
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(tool.name) || names.has(tool.name)) {
      throw new AIProviderRouterError("INVALID_REQUEST", "Tool names must be unique and use letters, numbers, and underscores.");
    }
    if (!tool.description.trim() || !tool.parameters || tool.parameters.type !== "object") {
      throw new AIProviderRouterError("INVALID_REQUEST", `Tool schema is invalid: ${tool.name}`);
    }
    names.add(tool.name);
  }
  for (const message of request.messages) {
    if (message.role === "tool" && (!message.toolCallId || !message.name)) {
      throw new AIProviderRouterError("INVALID_REQUEST", "Tool result messages require toolCallId and name.");
    }
  }
}

function cooldownMs(error: AIProviderError): number {
  const configured = boundedInt(Number(process.env.SEIYA_AI_PROVIDER_COOLDOWN_MS), 30_000, 5_000, 600_000);
  if (error.retryAfterSeconds > 0) {
    return Math.min(600_000, Math.max(configured, Math.ceil(error.retryAfterSeconds * 1_000)));
  }
  return configured;
}

function shouldCooldown(error: AIProviderError): boolean {
  return error.providerUnavailable || error.status === 429;
}

function publicFailure(error: unknown): { reason: string; status?: number } {
  if (error instanceof AIProviderError) return { reason: error.message.slice(0, 220), ...(error.status ? { status: error.status } : {}) };
  return { reason: "Unexpected provider failure" };
}

/**
 * Server-only provider router. It returns proposed tool calls; it NEVER executes them.
 * The agent orchestrator must validate every call and invoke approved backend services.
 */
export async function generateWithFallback(request: AICompletionRequest): Promise<AICompletionResult> {
  validateRequest(request);

  const totalTimeoutMs = boundedInt(request.totalTimeoutMs, 25_000, 2_000, 45_000);
  const perProviderTimeoutMs = boundedInt(Number(process.env.SEIYA_AI_PROVIDER_TIMEOUT_MS), 7_000, 1_500, 12_000);
  const maxAttempts = boundedInt(Number(process.env.SEIYA_AI_MAX_PROVIDER_ATTEMPTS), 4, 1, 5);
  const maxOutputTokens = boundedInt(request.maxOutputTokens, 350, 32, 1_000);
  const temperature = request.temperature === undefined || !Number.isFinite(request.temperature)
    ? 0.2
    : Math.max(0, Math.min(1, request.temperature));
  const dataClassification = request.dataClassification ?? "private";
  const startedAt = Date.now();
  const deadline = startedAt + totalTimeoutMs;
  const configuredOrder = parseProviderOrder();
  const order = request.preferredProvider && configuredOrder.includes(request.preferredProvider)
    ? [request.preferredProvider, ...configuredOrder.filter((id) => id !== request.preferredProvider)]
    : configuredOrder;
  const tools = request.tools ?? [];
  // A continuation turn replays assistant tool calls plus tool results. Vendors that sign their own
  // functionCall parts reject messages whose calls came from another provider (HTTP 400), so those
  // vendors are only eligible for the first model call of a turn.
  const hasToolRound = request.messages.some((message) => message.role === "tool");
  const candidates: AIProviderAdapter[] = [];
  const privateAllowlist = privateProviderAllowlist();

  for (const id of order) {
    const provider = providerRegistry[id];
    if (!provider.isConfigured()) continue;
    if (dataClassification === "private" && !privateAllowlist.has(id)) continue;
    if (tools.length && !provider.supportsTools) continue;
    if (hasToolRound && provider.requiresToolThoughtSignature && request.preferredProvider !== id) continue;
    if (id === "openrouter" && provider.model.endsWith(":free") && dataClassification !== "public") continue;
    candidates.push(provider);
  }

  const configuredCount = order.filter((id) => providerRegistry[id].isConfigured()).length;
  if (configuredCount === 0) {
    throw new AIProviderRouterError("NO_PROVIDER_CONFIGURED", "No AI provider is configured. Set at least one server-side provider API key.");
  }
  if (candidates.length === 0) {
    throw new AIProviderRouterError(
      "NO_CAPABLE_PROVIDER",
      tools.length
        ? hasToolRound
          ? "No configured provider can continue this tool round: the vendor that produced the tool call is unavailable, and vendors with their own tool-call signatures cannot take it over. Check tool support, model IDs, and SEIYA_AI_PRIVATE_PROVIDER_ALLOWLIST."
          : "No configured provider is eligible for function calling and this request's data classification. Check tool support, model IDs, and SEIYA_AI_PRIVATE_PROVIDER_ALLOWLIST."
        : "No configured provider is eligible for this request. Check SEIYA_AI_PRIVATE_PROVIDER_ALLOWLIST for private context.",
    );
  }

  const attempts: Array<{ provider: string; reason: string; status?: number }> = [];
  let actualAttempts = 0;
  let sawNonRetryable = false;
  for (const provider of candidates) {
    if (actualAttempts >= maxAttempts) break;
    const now = Date.now();
    if (now >= deadline) break;
    const cooldownUntil = PROVIDER_COOLDOWN_UNTIL.get(provider.id) ?? 0;
    if (cooldownUntil > now) {
      attempts.push({ provider: provider.id, reason: "Provider temporarily cooling down after a recent failure" });
      continue;
    }
    const remainingMs = deadline - now;
    if (remainingMs < 1_000) break;

    const providerRequest: ProviderGenerateRequest = {
      messages: request.messages,
      ...(tools.length ? { tools } : {}),
      toolChoice: request.toolChoice ?? "auto",
      maxOutputTokens,
      temperature,
      timeoutMs: Math.max(1_000, Math.min(perProviderTimeoutMs, remainingMs - 100)),
      dataClassification,
    };
    actualAttempts += 1;
    const attemptStarted = Date.now();

    try {
      const result = await provider.generate(providerRequest);
      const latencyMs = Date.now() - attemptStarted;
      // Do not log prompts, responses, tool arguments, or household/financial data.
      console.info("[Seiya AI] provider success", { provider: provider.id, model: provider.model, latencyMs, attempts: actualAttempts });
      return { ...result, provider: provider.id, model: provider.model, latencyMs: Date.now() - startedAt, attempts: actualAttempts };
    } catch (error) {
      const failure = publicFailure(error);
      attempts.push({ provider: provider.id, ...failure });
      console.warn("[Seiya AI] provider failed", { provider: provider.id, model: provider.model, status: failure.status, reason: failure.reason });

      if (error instanceof AIProviderError) {
        if (shouldCooldown(error)) PROVIDER_COOLDOWN_UNTIL.set(provider.id, Date.now() + cooldownMs(error));
        // A non-retryable rejection (400/413/422, content block, schema the vendor refuses) is
        // vendor-specific more often than not. Keep trying the remaining providers instead of
        // letting one picky vendor take the whole chat down; surface INVALID_REQUEST only when
        // nobody could serve the request, so a genuine client/schema mistake stays visible.
        if (!error.retryable && !error.providerUnavailable) {
          sawNonRetryable = true;
          continue;
        }
      } else {
        PROVIDER_COOLDOWN_UNTIL.set(provider.id, Date.now() + 15_000);
      }
    }
  }

  if (sawNonRetryable) {
    throw new AIProviderRouterError(
      "INVALID_REQUEST",
      "AI provider rejected the request. Check the tool schema and provider/model compatibility.",
      attempts,
    );
  }
  if (Date.now() >= deadline) {
    throw new AIProviderRouterError("DEADLINE_EXCEEDED", "AI provider time budget was exhausted before a provider succeeded.", attempts);
  }
  throw new AIProviderRouterError("ALL_PROVIDERS_FAILED", "All eligible AI providers failed. No financial action was executed by the provider router.", attempts);
}
