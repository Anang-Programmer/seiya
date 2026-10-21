#!/usr/bin/env node
/**
 * Sequential AI provider/model fallback router.
 * Requires Node.js 20+ (uses built-in fetch). No npm dependencies.
 * Reads .env.local first, then .env, from the current directory or this file's directory.
 *
 * Run:
 *   node scripts/tools/ai-fallback.mjs "Tes"
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { performance } from 'node:perf_hooks';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const TIMEOUT_MS = 25_000;
const MAX_OUTPUT_TOKENS = 700;
const RATE_LIMIT_FALLBACK_WAIT_MS = 1_500;

function parseEnvFile(contents) {
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;

    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;

    let value = rawValue.trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
      if (rawValue.trim().startsWith('"')) {
        value = value.replace(/\\n/g, '\n').replace(/\\r/g, '\r');
      }
    } else {
      value = value.replace(/\s+#.*$/, '').trim();
    }
    process.env[key] = value;
  }
}

function loadEnv() {

  const candidates = [
    path.resolve(process.cwd(), '.env.local'),
    path.resolve(process.cwd(), '.env'),
    path.join(SCRIPT_DIR, '.env.local'),
    path.join(SCRIPT_DIR, '.env'),
  ];
  const seen = new Set();
  for (const envPath of candidates) {
    if (seen.has(envPath)) continue;
    seen.add(envPath);
    if (!fs.existsSync(envPath)) continue;
    try {
      parseEnvFile(fs.readFileSync(envPath, 'utf8'));
      console.log(`[CONFIG] Membaca konfigurasi dari ${envPath}`);
      return;
    } catch (error) {
      console.warn(`[WARN] Tidak bisa membaca ${envPath}: ${error.message}`);
    }
  }
  console.log('[INFO] File .env.local/.env tidak ditemukan; memakai environment variables dari shell atau --env-file.');
}

loadEnv();

function envValue(name) {
  const value = process.env[name]?.trim();
  return value || '';
}

function redact(text) {
  let result = String(text ?? 'Unknown error');
  for (const key of [
    'CLOUDFLARE_API_TOKEN',
    'MISTRAL_API_KEY',
    'GOOGLE_API_KEY',
    'GROQ_API_KEY',
    'OPENROUTER_API_KEY',
  ]) {
    const secret = envValue(key);
    if (secret.length >= 6) result = result.split(secret).join('[REDACTED]');
  }
  return result.replace(/\s+/g, ' ').slice(0, 360);
}

class ProviderError extends Error {
  constructor(message, status = 0, retryAfterSeconds = 0) {
    super(message);
    this.name = 'ProviderError';
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function parseRetryAfter(value) {
  if (!value) return 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? Math.max(0, (timestamp - Date.now()) / 1000) : 0;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function postJson(url, headers, body) {
  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    throw new ProviderError(error?.name === 'TimeoutError' || error?.name === 'AbortError'
      ? `Request timeout setelah ${TIMEOUT_MS / 1000} detik`
      : error.message);
  }

  const raw = await response.text();
  let data;
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = { message: raw };
  }

  if (!response.ok) {
    const message =
      data?.error?.message ??
      data?.message ??
      data?.errors?.[0]?.message ??
      response.statusText ??
      'Request gagal';
    throw new ProviderError(`HTTP ${response.status}: ${redact(message)}`, response.status, parseRetryAfter(response.headers.get('retry-after')));
  }

  if (data?.success === false) {
    const message = data?.errors?.map((error) => error?.message).filter(Boolean).join('; ') || 'Cloudflare API returned success=false';
    throw new ProviderError(redact(message), response.status);
  }
  return data;
}

function extractText(value) {
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) {
    return value.map((part) => {
      if (typeof part === 'string') return part;
      if (typeof part?.text === 'string') return part.text;
      return '';
    }).join('').trim();
  }
  return '';
}

function geminiText(data) {
  const parts = data?.candidates?.[0]?.content?.parts;
  return extractText(Array.isArray(parts) ? parts.map((part) => part?.text ?? '') : '');
}

function chatText(data) {
  return extractText(data?.choices?.[0]?.message?.content);
}

const providers = [
  // Order is based on the user's observed full-request timings:
  // Cloudflare 731 ms, Groq 1,222 ms, OpenRouter 3,979 ms,
  // Gemini 8,948-12,688 ms. Prompts/output lengths differed, so treat this
  // as a useful initial ordering—not a controlled benchmark. Mistral has no
  // successful timing yet and is placed last until its standard models work.
  {
    name: 'Cloudflare Workers AI',
    keyName: 'CLOUDFLARE_API_TOKEN',
    observedLatency: '731 ms (Llama 3.2 1B, prompt "Hai")',
    models: [
      '@cf/meta/llama-3.2-1b-instruct',
      '@cf/meta/llama-3.2-3b-instruct',
      '@cf/meta/llama-3.1-8b-instruct-fp8-fast',
    ],
    ready() {
      return Boolean(envValue('CLOUDFLARE_API_TOKEN') && envValue('CLOUDFLARE_ACCOUNT_ID'));
    },
    async generate(model, prompt) {
      const accountId = envValue('CLOUDFLARE_ACCOUNT_ID');
      const token = envValue('CLOUDFLARE_API_TOKEN');
      const data = await postJson(
        `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/run/${model}`,
        { Authorization: `Bearer ${token}` },
        { messages: [{ role: 'user', content: prompt }], max_tokens: MAX_OUTPUT_TOKENS },
      );
      return extractText(data?.result?.response ?? data?.result?.output_text ?? data?.result?.content);
    },
  },
  {
    name: 'Groq',
    keyName: 'GROQ_API_KEY',
    observedLatency: '1,222 ms (GPT-OSS 20B) / 1,998 ms (GPT-OSS 120B)',
    models: [
      'openai/gpt-oss-20b',
      'openai/gpt-oss-120b',
      'qwen/qwen3.8-27b',
    ],
    async generate(model, prompt) {
      const data = await postJson(
        'https://api.groq.com/openai/v1/chat/completions',
        { Authorization: `Bearer ${envValue(this.keyName)}` },
        { model, messages: [{ role: 'user', content: prompt }], max_tokens: MAX_OUTPUT_TOKENS },
      );
      return chatText(data);
    },
  },
  {
    name: 'OpenRouter',
    keyName: 'OPENROUTER_API_KEY',
    observedLatency: '3,979 ms (Nemotron 3.5 Lightning, prompt "Hai")',
    models: [
      // This one already succeeded in the user's own test.
      'nvidia/nemotron-3.5-lightning:free',
      'inclusionai/ling-3.1-flash:free',
      'nvidia/nemotron-3-ultra-550b-a55b:free',
    ],
    async generate(model, prompt) {
      const data = await postJson(
        'https://openrouter.ai/api/v1/chat/completions',
        { Authorization: `Bearer ${envValue(this.keyName)}` },
        { model, messages: [{ role: 'user', content: prompt }], max_tokens: MAX_OUTPUT_TOKENS },
      );
      return chatText(data);
    },
  },
  {
    name: 'Google Gemini',
    keyName: 'GOOGLE_API_KEY',
    observedLatency: '8,948 ms (Gemini 3.8 Flash) / 12,688 ms (Gemini 3.6 Flash)',
    models: [
      // Google's docs describe Flash-Lite as the low-latency model.
      // The other two have user-observed timings of ~8.9 s and ~12.7 s.
      'gemini-3.5-flash-lite',
      'gemini-3.8-flash',
      'gemini-3.6-flash',
    ],
    async generate(model, prompt) {
      const data = await postJson(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        { 'x-goog-api-key': envValue(this.keyName) },
        {
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: MAX_OUTPUT_TOKENS },
        },
      );
      return geminiText(data);
    },
  },
  {
    name: 'Mistral AI',
    keyName: 'MISTRAL_API_KEY',
    observedLatency: 'belum ada request yang berhasil',
    // Avoid experimental Labs-only models. These are standard model IDs;
    // mistral-small-latest is also used in Mistral's official Free-mode quickstart.
    models: [
      'ministral-3b-2512',
      'ministral-8b-2512',
      'mistral-small-latest',
    ],
    async generate(model, prompt) {
      const data = await postJson(
        'https://api.mistral.ai/v1/chat/completions',
        { Authorization: `Bearer ${envValue(this.keyName)}` },
        { model, messages: [{ role: 'user', content: prompt }], max_tokens: MAX_OUTPUT_TOKENS },
      );
      return chatText(data);
    },
  },
];

async function maybePromptCloudflareAccountId() {
  if (!envValue('CLOUDFLARE_API_TOKEN') || envValue('CLOUDFLARE_ACCOUNT_ID')) return;
  const rl = readline.createInterface({ input, output });
  try {
    const id = (await rl.question('CLOUDFLARE_API_TOKEN terisi, tetapi CLOUDFLARE_ACCOUNT_ID belum ada. Masukkan Account ID (Enter untuk skip Cloudflare): ')).trim();
    if (id) process.env.CLOUDFLARE_ACCOUNT_ID = id;
  } finally {
    rl.close();
  }
}

function isProviderWideFailure(error) {
  if ([401, 403, 402].includes(error?.status)) return true;
  // Google may report invalid API keys as HTTP 400 instead of 401/403.
  return /API_KEY_INVALID|API key not valid|invalid api key|invalid_api_key|insufficient_quota|billing.*disabled/i
    .test(String(error?.message ?? ''));
}

async function main() {
  const args = process.argv.slice(2);
  let providerFilter = '';
  const providerFlag = args.findIndex((arg) => arg === '--provider');
  if (providerFlag >= 0) {
    providerFilter = args[providerFlag + 1] || '';
    args.splice(providerFlag, providerFilter ? 2 : 1);
  }
  const prompt = args.join(' ').trim() ||
    'Jelaskan cara kerja AI dalam bahasa Indonesia secara singkat.';
  console.log('\n=== AI SEQUENTIAL FAILOVER ===');
  console.log(`Prompt: ${prompt}`);
  if (providerFilter) console.log(`Mode: hanya vendor yang cocok dengan "${providerFilter}".`);
  else console.log('Mode: sequential — berhenti saat model pertama berhasil.');
  console.log('Urutan latensi awal: Cloudflare → Groq → OpenRouter → Gemini → Mistral.');
  console.log('Catatan: timing sebelumnya berasal dari prompt/output berbeda; urutan bersifat indikatif.\n');

  const selectedProviders = providerFilter
    ? providers.filter((provider) => provider.name.toLowerCase().includes(providerFilter.toLowerCase()))
    : providers;
  if (providerFilter && selectedProviders.length === 0) {
    console.error(`Vendor tidak dikenal: ${providerFilter}. Pilih Cloudflare, Groq, OpenRouter, Gemini, atau Mistral.`);
    process.exitCode = 1;
    return;
  }

  // Ask for Cloudflare's Account ID only when Cloudflare is in this run.
  if (selectedProviders.some((provider) => provider.name === 'Cloudflare Workers AI')) {
    await maybePromptCloudflareAccountId();
  }

  const configured = selectedProviders.some((provider) => {
    if (provider.name === 'Cloudflare Workers AI') return provider.ready();
    return Boolean(envValue(provider.keyName));
  });
  if (!configured) {
    console.error('Belum ada API key yang terisi untuk vendor yang dipilih. Isi nilai di file .env.local (atau .env), lalu jalankan ulang.');
    console.error('Dibutuhkan minimal satu: GOOGLE_API_KEY, MISTRAL_API_KEY, GROQ_API_KEY, OPENROUTER_API_KEY, atau CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID.');
    process.exitCode = 1;
    return;
  }

  for (const provider of selectedProviders) {
    const ready = provider.ready ? provider.ready() : Boolean(envValue(provider.keyName));
    if (!ready) {
      console.log(`[SKIP VENDOR] ${provider.name}: key atau konfigurasi belum tersedia.`);
      continue;
    }

    let skipVendor = false;
    for (const model of provider.models) {
      console.log(`[TRY] ${provider.name} → ${model}`);
      const start = performance.now();
      try {
        const answer = await provider.generate(model, prompt);
        if (!answer) throw new ProviderError('Respons kosong dari model.');
        const elapsed = Math.round(performance.now() - start);

        console.log(`\n[SUCCESS] ${provider.name} / ${model} (${elapsed} ms)\n`);
        console.log('--- JAWABAN AI ---\n');
        console.log(answer);
        console.log('\n--- SELESAI: provider berikutnya tidak dipanggil ---');
        return;
      } catch (error) {
        console.error(`[FAIL] ${provider.name} / ${model}: ${redact(error.message)}`);
        if (error.status === 429) {
          const hasNextModel = provider.models.indexOf(model) < provider.models.length - 1;
          if (hasNextModel) {
            // Honor Retry-After when short; if absent, pause briefly to avoid
            // immediately tripping a requests-per-second limit on free mode.
            const waitSeconds = error.retryAfterSeconds > 0 ? error.retryAfterSeconds : RATE_LIMIT_FALLBACK_WAIT_MS / 1000;
            if (waitSeconds > 10) {
              console.log(`[RATE LIMIT] Retry-After ${waitSeconds.toFixed(1)}s; skip sisa model vendor ini dan lanjut vendor berikutnya.\n`);
              skipVendor = true;
              break;
            }
            const waitMs = Math.max(RATE_LIMIT_FALLBACK_WAIT_MS, Math.ceil(waitSeconds * 1000));
            console.log(`[RATE LIMIT] Menunggu ${(waitMs / 1000).toFixed(1)} detik sebelum model cadangan berikutnya...\n`);
            await sleep(waitMs);
            continue;
          }
        }
        if (isProviderWideFailure(error)) {
          console.log(`[SKIP SISA MODEL] HTTP ${error.status}: kemungkinan key/izin/billing vendor ini bermasalah; pindah vendor.\n`);
          skipVendor = true;
          break;
        }
        console.log('Mencoba model berikutnya secara berurutan...\n');
      }
    }
    if (skipVendor) continue;
  }

  console.error('Tidak ada model yang berhasil. Cek key, izin model, kuota, dan pesan error di atas.');
  process.exitCode = 1;
}

main().catch((error) => {
  console.error('[FATAL]', redact(error?.message ?? error));
  process.exitCode = 1;
});
