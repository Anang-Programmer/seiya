import { createOpenAICompatibleProvider } from "./openai-compatible";

export const openRouterProvider = createOpenAICompatibleProvider({
  id: "openrouter",
  label: "OpenRouter",
  endpoint: "https://openrouter.ai/api/v1/chat/completions",
  keyName: "OPENROUTER_API_KEY",
  modelName: "SEIYA_AI_OPENROUTER_MODEL",
  defaultModel: "nvidia/nemotron-3.5-lightning",
  maxTokenField: "max_tokens",
  extraHeaders: {
    "X-Title": "Seiya",
    ...(process.env.APP_BASE_URL ? { "HTTP-Referer": process.env.APP_BASE_URL } : {}),
  },
  requirePrivateDataSafeModel: true,
});
