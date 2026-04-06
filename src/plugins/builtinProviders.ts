import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import { createMistral } from "@ai-sdk/mistral";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { config } from "../config";
import type { ProviderPlugin } from "./types";

const googleAI = createGoogleGenerativeAI({ apiKey: config.GEMINI_API_KEY });
const anthropicAI = createAnthropic({ apiKey: config.ANTHROPIC_API_KEY });
const openaiAI = createOpenAI({ apiKey: config.OPENAI_API_KEY });
const mistralAI = createMistral({ apiKey: config.MISTRAL_API_KEY });
const groqAI = createGroq({ apiKey: config.GROQ_API_KEY });
const alibabaAI = createOpenAI({
  apiKey: config.ALIBABA_API_KEY,
  baseURL: config.ALIBABA_BASE_URL,
});
const deepseekAI = createOpenAI({
  apiKey: config.DEEPSEEK_API_KEY,
  baseURL: "https://api.deepseek.com/v1",
});
const resurgeAI = createOpenAI({
  apiKey: config.RESURGE_API_KEY,
  baseURL: "https://api.resurge.one/v1",
});
const openrouterAI = createOpenRouter({ apiKey: config.OPENROUTER_API_KEY });

function provider(id: string, isConfigured: () => boolean, createChatModel: (modelName: string) => any, createEmbeddingModel?: () => any): ProviderPlugin {
  return {
    id,
    isConfigured,
    createChatModel,
    createEmbeddingModel,
  };
}

export function getBuiltinProviderPlugins(): ProviderPlugin[] {
  return [
    provider("alibaba", () => Boolean(config.ALIBABA_API_KEY), (modelName) => alibabaAI.chat(modelName)),
    provider("google", () => Boolean(config.GEMINI_API_KEY), (modelName) => googleAI(modelName), () => googleAI.textEmbeddingModel("text-embedding-005")),
    provider("anthropic", () => Boolean(config.ANTHROPIC_API_KEY), (modelName) => anthropicAI(modelName)),
    provider("openai", () => Boolean(config.OPENAI_API_KEY), (modelName) => openaiAI(modelName), () => openaiAI.textEmbeddingModel("text-embedding-3-small")),
    provider("mistral", () => Boolean(config.MISTRAL_API_KEY), (modelName) => mistralAI(modelName), () => mistralAI.textEmbeddingModel("mistral-embed")),
    provider("groq", () => Boolean(config.GROQ_API_KEY), (modelName) => groqAI(modelName)),
    provider("deepseek", () => Boolean(config.DEEPSEEK_API_KEY), (modelName) => deepseekAI(modelName)),
    provider("resurge", () => Boolean(config.RESURGE_API_KEY), (modelName) => resurgeAI(modelName)),
    provider("openrouter", () => Boolean(config.OPENROUTER_API_KEY), (modelName) => openrouterAI(modelName)),
  ];
}
