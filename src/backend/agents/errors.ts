export class AIProviderError extends Error {
  readonly status: number;
  readonly retryAfterSeconds: number;
  readonly retryable: boolean;
  readonly providerUnavailable: boolean;

  constructor(
    message: string,
    options: {
      status?: number;
      retryAfterSeconds?: number;
      retryable?: boolean;
      providerUnavailable?: boolean;
      cause?: unknown;
    } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "AIProviderError";
    this.status = options.status ?? 0;
    this.retryAfterSeconds = options.retryAfterSeconds ?? 0;
    this.retryable = options.retryable ?? false;
    this.providerUnavailable = options.providerUnavailable ?? false;
  }
}

export class AIProviderRouterError extends Error {
  readonly code:
    | "NO_PROVIDER_CONFIGURED"
    | "NO_CAPABLE_PROVIDER"
    | "DEADLINE_EXCEEDED"
    | "ALL_PROVIDERS_FAILED"
    | "INVALID_REQUEST";
  readonly attempts: Array<{ provider: string; reason: string; status?: number }>;

  constructor(
    code: AIProviderRouterError["code"],
    message: string,
    attempts: Array<{ provider: string; reason: string; status?: number }> = [],
  ) {
    super(message);
    this.name = "AIProviderRouterError";
    this.code = code;
    this.attempts = attempts;
  }
}
