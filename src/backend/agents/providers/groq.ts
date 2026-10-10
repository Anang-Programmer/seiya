import { createOpenAICompatibleProvider } from "./openai-compatible";

export const groqProvider = createOpenAICompatibleProvider({
  id: "groq",
  label: "Groq",
  endpoint: "https://api.groq.com/openai/v1/chat/completions",
  keyName: "GROQ_API_KEY",
  modelName: "SEIYA_AI_GROQ_MODEL",
  defaultModel: "openai/gpt-oss-20b",
  maxTokenField: "max_completion_tokens",
});
