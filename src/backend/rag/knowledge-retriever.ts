import "server-only";
import { createHash } from "node:crypto";
import type { createClient } from "@/lib/supabase/server";

type UserScopedSupabaseClient = Awaited<ReturnType<typeof createClient>>;

const EMBEDDING_MODEL = "gemini-embedding-001";
const EMBEDDING_DIMENSIONS = 768;
const MAX_QUERY_CHARS = 280;
const MAX_RESULTS = 3;
const MAX_CONTEXT_CHARS = 3_400;
const CACHE_TTL_MS = 5 * 60 * 1_000;
const MAX_CACHE_ENTRIES = 128;
const EMBEDDING_TIMEOUT_MS = 6_000;

export interface SeiyaKnowledgeChunk {
  chunkKey: string;
  title: string;
  category: "seiya_help" | "financial_education";
  content: string;
  similarity: number;
}

export interface SeiyaKnowledgeRetrieval {
  status: "skipped" | "hit" | "miss" | "unavailable";
  cacheHit: boolean;
  latencyMs: number;
  queryEmbeddingTokens?: number;
  chunks: SeiyaKnowledgeChunk[];
}

type CacheValue = {
  expiresAt: number;
  value: Omit<SeiyaKnowledgeRetrieval, "cacheHit" | "latencyMs">;
};

const retrievalCache = new Map<string, CacheValue>();

/**
 * RAG only runs for general, knowledge-oriented questions in the static Seiya FAQ
 * and financial-education scope. Clear personal/account-specific cues and explicit
 * currency/number values are excluded before embedding; this is a narrow heuristic,
 * not a universal PII detector. Live facts must use the authenticated SQL tools.
 */
export function shouldRetrieveSeiyaKnowledge(message: string): boolean {
  const text = message.trim().slice(0, MAX_QUERY_CHARS);
  if (!text) return false;

  const generalIntent = /\b(apa itu|apa maksud|maksud dari|arti dari|definisi|jelaskan|bagaimana (cara|kerja|mengatur|menyusun|membuat|memulai)|cara kerja|cara mengatur|cara membangun|cara menyiapkan|tips|konsep|kenapa|mengapa|bedanya|apa bedanya|contoh|what is|explain|how does|how to)\b/i.test(text);
  if (!generalIntent) return false;

  const personalContext = /\b(aku|saya|kami|kita|milik saya|milik kami|punya saya|punya kami|rumah tangga kami|akun saya|wallet saya|saldo saya|budget saya|anggaran saya|tagihan saya|tagihan kami|data kami|tercatat|di akun saya|penghasilan|pendapatan|gaji|pinjaman saya|utang saya|keluarga saya|pasangan saya|kondisi saya|our|we|i|me|my|our household|my wallet|my balance|my budget|my bills|my income|my salary)\b/i.test(text);
  if (personalContext) return false;
  // Do not send currency amounts, dates, or household-specific numbers to the embedding API.
  // The one supported numeric framework is the generic 50/30/20 budgeting rule.
  const withoutGenericRatio = text.replace(/50\s*[\/-]\s*30\s*[\/-]\s*20/gi, "budgeting ratio");
  if (/\d|\b(Rp|IDR|USD|EUR)\b/i.test(withoutGenericRatio)) return false;

  const supportedTopic = /\b(seiya|wallet|dompet|shared wallet|personal wallet|dual[ -]?key|cooling[ -]?off|approval|persetujuan pasangan|approval threshold|batas persetujuan|budget|anggaran|tagihan|bill|financial agreement|kesepakatan keuangan|dana darurat|emergency fund|utang|debt|kartu kredit|paylater|50\s*[\/-]\s*30\s*[\/-]\s*20|anggaran bulanan|diskusi uang|ngobrol soal uang|keuangan pasangan)\b/i.test(text);
  return supportedTopic;
}

function normalizedCacheKey(query: string): string {
  return createHash("sha256")
    .update(query.toLocaleLowerCase("id-ID").replace(/\s+/g, " ").trim())
    .digest("hex");
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

async function createQueryEmbedding(query: string): Promise<{ values: number[]; tokens?: number }> {
  const apiKey = process.env.GOOGLE_API_KEY?.trim();
  if (!apiKey) throw new Error("RAG embedding provider is not configured");

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        content: { parts: [{ text: query }] },
        // Keep query vectors at the same dimension as stored document vectors.
        // The REST root field is deprecated but supported; use it explicitly
        // because the nested config was ignored by the observed endpoint response.
        outputDimensionality: EMBEDDING_DIMENSIONS,
        embedContentConfig: {
          taskType: "RETRIEVAL_QUERY",
        },
      }),
      signal: AbortSignal.timeout(EMBEDDING_TIMEOUT_MS),
      cache: "no-store",
    },
  );

  if (!response.ok) {
    // Never log the user's query or the provider's raw response body here.
    throw new Error(`RAG embedding request failed with HTTP ${response.status}`);
  }

  const payload: unknown = await response.json();
  if (!payload || typeof payload !== "object") throw new Error("Invalid RAG embedding response");
  const root = payload as Record<string, unknown>;
  const embedding = root.embedding && typeof root.embedding === "object"
    ? root.embedding as Record<string, unknown>
    : null;
  const values = embedding?.values;
  if (!Array.isArray(values) || values.length !== EMBEDDING_DIMENSIONS
    || !values.every((value) => typeof value === "number" && Number.isFinite(value))) {
    throw new Error("RAG embedding response has an unexpected vector shape");
  }

  const usageMetadata = root.usageMetadata && typeof root.usageMetadata === "object"
    ? root.usageMetadata as Record<string, unknown>
    : null;
  return {
    values: values as number[],
    ...(readNumber(usageMetadata?.promptTokenCount) !== undefined
      ? { tokens: readNumber(usageMetadata?.promptTokenCount) }
      : {}),
  };
}

function readChunks(value: unknown): SeiyaKnowledgeChunk[] {
  if (!Array.isArray(value)) return [];
  const chunks: SeiyaKnowledgeChunk[] = [];
  let contentChars = 0;

  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    if (typeof row.chunk_key !== "string" || typeof row.title !== "string"
      || typeof row.content !== "string"
      || (row.category !== "seiya_help" && row.category !== "financial_education")) continue;

    const similarity = typeof row.similarity === "number" && Number.isFinite(row.similarity)
      ? row.similarity
      : 0;
    const remaining = MAX_CONTEXT_CHARS - contentChars;
    if (remaining <= 0) break;
    const content = row.content.slice(0, Math.min(1_500, remaining));
    if (!content.trim()) continue;
    chunks.push({
      chunkKey: row.chunk_key.slice(0, 120),
      title: row.title.slice(0, 160),
      category: row.category,
      content,
      similarity,
    });
    contentChars += content.length;
    if (chunks.length >= MAX_RESULTS) break;
  }
  return chunks;
}

function putCache(key: string, value: CacheValue): void {
  if (retrievalCache.size >= MAX_CACHE_ENTRIES) {
    const firstKey = retrievalCache.keys().next().value;
    if (typeof firstKey === "string") retrievalCache.delete(firstKey);
  }
  retrievalCache.set(key, value);
}

export async function retrieveSeiyaKnowledge(
  supabase: UserScopedSupabaseClient,
  rawQuery: string,
): Promise<SeiyaKnowledgeRetrieval> {
  const startedAt = Date.now();
  if (!shouldRetrieveSeiyaKnowledge(rawQuery)) {
    return { status: "skipped", cacheHit: false, latencyMs: 0, chunks: [] };
  }

  const query = rawQuery.trim().replace(/\s+/g, " ").slice(0, MAX_QUERY_CHARS);
  const cacheKey = normalizedCacheKey(query);
  const cached = retrievalCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return {
      ...cached.value,
      queryEmbeddingTokens: 0,
      cacheHit: true,
      latencyMs: Date.now() - startedAt,
    };
  }
  if (cached) retrievalCache.delete(cacheKey);

  try {
    const embedding = await createQueryEmbedding(query);
    const { data, error } = await supabase.rpc("match_seiya_knowledge_chunks", {
      query_embedding: embedding.values,
      match_threshold: 0.42,
      match_count: MAX_RESULTS,
    });

    if (error) {
      console.warn("[Seiya RAG] vector search failed", { code: error.code ?? "unknown" });
      return {
        status: "unavailable",
        cacheHit: false,
        latencyMs: Date.now() - startedAt,
        ...(embedding.tokens !== undefined ? { queryEmbeddingTokens: embedding.tokens } : {}),
        chunks: [],
      };
    }

    const chunks = readChunks(data);
    const value: CacheValue["value"] = {
      status: chunks.length > 0 ? "hit" : "miss",
      ...(embedding.tokens !== undefined ? { queryEmbeddingTokens: embedding.tokens } : {}),
      chunks,
    };
    // Cache successful lookups and misses, not provider/database errors.
    putCache(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, value });
    return {
      ...value,
      cacheHit: false,
      latencyMs: Date.now() - startedAt,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    console.warn("[Seiya RAG] retrieval unavailable", {
      reason: message.startsWith("RAG embedding request failed with HTTP ")
        ? message.slice("RAG embedding request failed with HTTP ".length)
        : "embedding_or_network_error",
    });
    return {
      status: "unavailable",
      cacheHit: false,
      latencyMs: Date.now() - startedAt,
      chunks: [],
    };
  }
}
