import "server-only";

type Bucket = { windowStartedAt: number; count: number };
const buckets = new Map<string, Bucket>();
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 10;
const MAX_BUCKETS = 5_000;

/**
 * Process-local guard for demo/MVP cost control. Not a distributed security boundary:
 * use a shared limiter or database quota ledger before running multiple server instances.
 */
export function consumeAgentRequestAllowance(userId: string, now = Date.now()): {
  allowed: boolean;
  retryAfterSeconds: number;
} {
  let bucket = buckets.get(userId);
  if (!bucket || now - bucket.windowStartedAt >= WINDOW_MS || now < bucket.windowStartedAt) {
    bucket = { windowStartedAt: now, count: 0 };
    buckets.set(userId, bucket);
  }

  if (bucket.count >= MAX_REQUESTS_PER_WINDOW) {
    const remainingMs = Math.max(1_000, WINDOW_MS - (now - bucket.windowStartedAt));
    return { allowed: false, retryAfterSeconds: Math.ceil(remainingMs / 1_000) };
  }

  bucket.count += 1;

  if (buckets.size > MAX_BUCKETS) {
    for (const [key, value] of buckets) {
      if (now - value.windowStartedAt >= WINDOW_MS || now < value.windowStartedAt) buckets.delete(key);
      if (buckets.size <= MAX_BUCKETS) break;
    }
    while (buckets.size > MAX_BUCKETS) {
      const oldestKey = buckets.keys().next().value;
      if (typeof oldestKey !== "string") break;
      buckets.delete(oldestKey);
    }
  }

  return { allowed: true, retryAfterSeconds: 0 };
}
