import { AIProviderError } from "../errors";

export function parseRetryAfter(value: string | null): number {
  if (!value) return 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? Math.max(0, (timestamp - Date.now()) / 1000) : 0;
}

function safeMessage(data: unknown, statusText: string): string {
  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;
    const err = record.error;
    if (typeof err === "string") return err.slice(0, 300);
    if (err && typeof err === "object" && typeof (err as Record<string, unknown>).message === "string") {
      return String((err as Record<string, unknown>).message).slice(0, 300);
    }
    if (typeof record.message === "string") return record.message.slice(0, 300);
    if (Array.isArray(record.errors)) {
      const messages = record.errors
        .map((item) => (item && typeof item === "object" ? (item as Record<string, unknown>).message : undefined))
        .filter((item): item is string => typeof item === "string");
      if (messages.length) return messages.join("; ").slice(0, 300);
    }
  }
  return statusText || "Provider request failed";
}

export async function postJson<T>(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  timeoutMs: number,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
  } catch (error) {
    const err = error as { name?: string; message?: string };
    throw new AIProviderError(
      err?.name === "TimeoutError" || err?.name === "AbortError" ? "Provider request timed out" : "Provider network request failed",
      { retryable: true, providerUnavailable: true, cause: error },
    );
  }

  const raw = await response.text();
  let data: unknown;
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = { message: raw.slice(0, 300) };
  }

  if (!response.ok) {
    const status = response.status;
    const retryable = [408, 425, 429].includes(status) || status >= 500;
    const providerUnavailable = [401, 402, 403, 404, 408, 409, 425, 429].includes(status) || status >= 500;
    throw new AIProviderError(`HTTP ${status}: ${safeMessage(data, response.statusText)}`, {
      status,
      retryAfterSeconds: parseRetryAfter(response.headers.get("retry-after")),
      retryable,
      providerUnavailable,
    });
  }

  const record = data as Record<string, unknown> | null;
  if (record?.success === false) {
    throw new AIProviderError("Provider returned success=false", {
      status: response.status,
      retryable: true,
      providerUnavailable: true,
    });
  }
  return data as T;
}

export function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function parseArguments(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch {
      // A malformed tool call must never be executed. Treat it as a provider protocol failure.
    }
  }
  throw new AIProviderError("Provider returned malformed tool arguments", {
    retryable: true,
    providerUnavailable: true,
  });
}

export function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function textContent(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) {
    return value.map((part) => {
      if (typeof part === "string") return part;
      const record = asRecord(part);
      return typeof record?.text === "string" ? record.text : "";
    }).join("").trim();
  }
  return "";
}
