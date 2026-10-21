import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";

const MODEL = "gemini-embedding-001";
const DIMENSIONS = 768;
const ROOT = process.cwd();
const KNOWLEDGE_DIR = join(ROOT, "knowledge", "seiya");
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()?.replace(/\/+$/, "");
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY?.trim();
const SUPABASE_PRIVILEGED_KEY = process.env.SEIYA_RAG_SEED_KEY?.trim()
  || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

function fail(message) {
  console.error(`[Seiya RAG seed] ${message}`);
  process.exitCode = 1;
}

function hash(text) {
  return createHash("sha256").update(text).digest("hex");
}

function slug(value) {
  return value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}

async function loadKnowledge() {
  const names = (await readdir(KNOWLEDGE_DIR)).filter((name) => name.endsWith(".md")).sort();
  const chunks = [];

  for (const name of names) {
    const filePath = join(KNOWLEDGE_DIR, name);
    const raw = (await readFile(filePath, "utf8")).replace(/^\uFEFF/, "");
    const categoryMatch = raw.match(/^---\s*\ncategory:\s*(seiya_help|financial_education)\s*\n---\s*/);
    if (!categoryMatch) throw new Error(`Missing or invalid category front matter in ${name}`);
    const category = categoryMatch[1];
    const document = raw.slice(categoryMatch[0].length);
    const sections = document.split(/^##\s+/m).slice(1);

    for (const section of sections) {
      const lines = section.split(/\r?\n/);
      const title = (lines.shift() ?? "").trim();
      const content = lines.join("\n").trim().replace(/\n{3,}/g, "\n\n");
      if (!title || content.length < 120) continue;
      if (content.length > 4_000) throw new Error(`Section too long; split it into smaller sections: ${name} — ${title}`);
      const chunkKey = `${slug(basename(name, ".md"))}--${slug(title)}`;
      const searchableText = `${title}\n${content}`;
      const contentHash = hash(`${MODEL}\n${category}\n${searchableText}`);
      chunks.push({
        chunk_key: chunkKey,
        source_file: name,
        title,
        category,
        content,
        content_sha256: contentHash,
        embedding_model: MODEL,
        is_active: true,
        searchableText,
      });
    }
  }

  if (chunks.length === 0) throw new Error("No knowledge sections found.");
  return { sourceFiles: names, chunks };
}

function supabaseHeaders(prefer) {
  const headers = {
    apikey: SUPABASE_PRIVILEGED_KEY,
    "Content-Type": "application/json",
    ...(prefer ? { Prefer: prefer } : {}),
  };

  // New Supabase secret API keys (sb_secret_...) are not JWTs and must not
  // be sent as Bearer tokens. The API gateway uses the apikey header. Legacy
  // service_role JWT keys still need Authorization: Bearer for PostgREST.
  if (!SUPABASE_PRIVILEGED_KEY.startsWith("sb_secret_")) {
    headers.Authorization = `Bearer ${SUPABASE_PRIVILEGED_KEY}`;
  }
  return headers;
}

async function readExisting() {
  const url = new URL(`${SUPABASE_URL}/rest/v1/seiya_knowledge_chunks`);
  url.searchParams.set("select", "chunk_key,source_file,content_sha256,embedding_model,is_active");
  url.searchParams.set("limit", "1000");
  const response = await fetch(url, { headers: supabaseHeaders(), signal: AbortSignal.timeout(12_000) });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`Cannot read existing knowledge metadata (HTTP ${response.status}): ${detail}`);
  }
  const rows = await response.json();
  if (!Array.isArray(rows)) throw new Error("Supabase returned an unexpected metadata response.");
  return rows;
}

async function embedDocument(text, title) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:embedContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": GOOGLE_API_KEY },
      body: JSON.stringify({
        content: { parts: [{ text }] },
        // Compatibility: pass outputDimensionality at request root because this
        // REST endpoint may ignore the nested config field in some responses.
        // Google still documents the root field as deprecated-but-supported.
        outputDimensionality: DIMENSIONS,
        embedContentConfig: {
          taskType: "RETRIEVAL_DOCUMENT",
          title,
        },
      }),
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`Gemini embedding failed for a knowledge section (HTTP ${response.status}): ${detail}`);
  }
  const payload = await response.json();
  const rootKeys = payload && typeof payload === "object" && !Array.isArray(payload)
    ? Object.keys(payload)
    : [];
  const embedding = payload && typeof payload === "object" && !Array.isArray(payload)
    ? payload.embedding
    : undefined;
  const embeddingKeys = embedding && typeof embedding === "object" && !Array.isArray(embedding)
    ? Object.keys(embedding)
    : [];
  const values = embedding && typeof embedding === "object" && !Array.isArray(embedding)
    ? embedding.values
    : undefined;

  if (!Array.isArray(values)) {
    throw new Error(
      `Gemini embedding response shape mismatch (top-level keys: ${rootKeys.join(",") || "none"}; ` +
      `embedding keys: ${embeddingKeys.join(",") || "none"}). No database changes were made.`,
    );
  }

  const finiteNumberCount = values.filter((value) =>
    typeof value === "number" && Number.isFinite(value),
  ).length;
  if (values.length !== DIMENSIONS || finiteNumberCount !== values.length) {
    throw new Error(
      `Gemini embedding dimension/type mismatch (expected dimensions: ${DIMENSIONS}; ` +
      `received dimensions: ${values.length}; finite numeric values: ${finiteNumberCount}). ` +
      `No vector values were logged and no database changes were made.`,
    );
  }
  return values;
}

async function upsertRows(rows) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/seiya_knowledge_chunks`);
  url.searchParams.set("on_conflict", "chunk_key");
  const response = await fetch(url, {
    method: "POST",
    headers: supabaseHeaders("resolution=merge-duplicates,return=minimal"),
    body: JSON.stringify(rows),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 700);
    throw new Error(`Supabase upsert failed (HTTP ${response.status}): ${detail}`);
  }
}

async function deactivateStaleRows(existingRows, currentChunks) {
  const currentKeys = new Set(currentChunks.map((chunk) => chunk.chunk_key));
  const staleKeys = existingRows
    .filter((row) => row.is_active !== false && !currentKeys.has(row.chunk_key))
    .map((row) => row.chunk_key);

  for (const key of staleKeys) {
    const url = new URL(`${SUPABASE_URL}/rest/v1/seiya_knowledge_chunks`);
    url.searchParams.set("chunk_key", `eq.${key}`);
    const response = await fetch(url, {
      method: "PATCH",
      headers: supabaseHeaders("return=minimal"),
      body: JSON.stringify({ is_active: false }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      // The seeded rows are already valid; stale deactivation failure should still be reported.
      throw new Error(`Could not deactivate stale knowledge chunk ${key} (HTTP ${response.status}).`);
    }
  }
  return staleKeys.length;
}

async function main() {
  const { sourceFiles, chunks } = await loadKnowledge();
  if (process.argv.includes("--dry-run")) {
    console.log(`[Seiya RAG seed] Dry run only. Source files: ${sourceFiles.length}; sections: ${chunks.length}. No API/database calls performed.`);
    for (const chunk of chunks) console.log(`- ${chunk.chunk_key} [${chunk.category}] ${chunk.title} (${chunk.content.length} chars)`);
    return;
  }

  if (!SUPABASE_URL || !GOOGLE_API_KEY || !SUPABASE_PRIVILEGED_KEY) {
    fail("Set NEXT_PUBLIC_SUPABASE_URL and GOOGLE_API_KEY in .env.local, and SEIYA_RAG_SEED_KEY in the current PowerShell session. Do not put the privileged key in .env.local.");
    return;
  }

  try {
    console.log(`[Seiya RAG seed] Supabase host: ${new URL(SUPABASE_URL).host}`);
  } catch {
    fail("NEXT_PUBLIC_SUPABASE_URL is not a valid URL. Check its value in .env.local (do not print secrets)." );
    return;
  }

  const existingRows = await readExisting();
  const byKey = new Map(existingRows.map((row) => [row.chunk_key, row]));
  const changed = chunks.filter((chunk) => {
    const old = byKey.get(chunk.chunk_key);
    return !old || old.content_sha256 !== chunk.content_sha256 || old.embedding_model !== MODEL || old.is_active === false;
  });

  console.log(`[Seiya RAG seed] Knowledge sections found: ${chunks.length}`);
  console.log(`[Seiya RAG seed] Unchanged sections skipped: ${chunks.length - changed.length}`);
  console.log(`[Seiya RAG seed] New or changed sections to embed: ${changed.length}`);

  const rowsToUpsert = [];
  for (let i = 0; i < changed.length; i++) {
    const chunk = changed[i];
    console.log(`[Seiya RAG seed] Embedding section ${i + 1}/${changed.length}: ${chunk.title}`);
    const embedding = await embedDocument(chunk.searchableText, chunk.title);
    rowsToUpsert.push({
      chunk_key: chunk.chunk_key,
      source_file: chunk.source_file,
      title: chunk.title,
      category: chunk.category,
      content: chunk.content,
      content_sha256: chunk.content_sha256,
      embedding_model: MODEL,
      embedding,
      is_active: true,
    });
  }

  // Upsert only after every new embedding has succeeded, avoiding half-embedded updates.
  if (rowsToUpsert.length) await upsertRows(rowsToUpsert);
  const staleCount = await deactivateStaleRows(existingRows, chunks);
  console.log(`[Seiya RAG seed] Done. Upserted: ${rowsToUpsert.length}; stale chunks deactivated: ${staleCount}.`);
  console.log("[Seiya RAG seed] Re-run is idempotent: identical sections skip embedding requests.");
}

main().catch((error) => {
  if (error instanceof Error) {
    const causeCode = typeof error.cause?.code === "string" ? error.cause.code : null;
    const causeMessage = typeof error.cause?.message === "string" ? error.cause.message : null;
    const diagnostic = causeCode
      ? ` (cause code: ${causeCode}${causeMessage ? `; ${causeMessage.slice(0, 160)}` : ""})`
      : "";
    fail(`${error.message}${diagnostic}`);
    return;
  }
  fail("Unexpected error while seeding the knowledge base.");
});
