import type { AIProviderAdapter, AIProviderId } from "../types";
import { cloudflareProvider } from "./cloudflare";
import { geminiProvider } from "./gemini";
import { groqProvider } from "./groq";
import { mistralProvider } from "./mistral";
import { openRouterProvider } from "./openrouter";

export const providerRegistry: Record<AIProviderId, AIProviderAdapter> = {
  groq: groqProvider,
  gemini: geminiProvider,
  mistral: mistralProvider,
  openrouter: openRouterProvider,
  cloudflare: cloudflareProvider,
};
