import { createOpenAICompatibleProvider } from "./openai-compatible";

export const mistralProvider = createOpenAICompatibleProvider({
  id: "mistral",
  label: "Mistral AI",
  endpoint: "https://api.mistral.ai/v1/chat/completions",
  keyName: "MISTRAL_API_KEY",
  modelName: "SEIYA_AI_MISTRAL_MODEL",
  defaultModel: "ministral-8b-latest",
  maxTokenField: "max_tokens",
});
