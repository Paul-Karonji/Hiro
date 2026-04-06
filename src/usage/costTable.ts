/**
 * Estimated cost rates per 1,000 tokens in USD.
 * Falls back to $0 for unknown models (free-tier or untracked).
 */

export interface ModelRate {
  inputPer1k: number;
  outputPer1k: number;
}

const COST_TABLE: Record<string, ModelRate> = {
  // Google Gemini
  "google:gemini-2.5-flash": { inputPer1k: 0.000075, outputPer1k: 0.0003 },
  "google:gemini-2.0-flash": { inputPer1k: 0.000075, outputPer1k: 0.0003 },
  "google:gemini-1.5-pro": { inputPer1k: 0.00125, outputPer1k: 0.005 },
  "google:gemini-1.5-flash": { inputPer1k: 0.000075, outputPer1k: 0.0003 },

  // Mistral
  "mistral:mistral-large-latest": { inputPer1k: 0.003, outputPer1k: 0.009 },
  "mistral:mistral-small-latest": { inputPer1k: 0.001, outputPer1k: 0.003 },
  "mistral:mistral-7b-instruct": { inputPer1k: 0.00025, outputPer1k: 0.00025 },

  // Groq (effectively free tier)
  "groq:llama-3.3-70b-versatile": { inputPer1k: 0.00059, outputPer1k: 0.00079 },
  "groq:llama-3.1-70b-versatile": { inputPer1k: 0.00059, outputPer1k: 0.00079 },
  "groq:llama-3.1-8b-instant": { inputPer1k: 0.00005, outputPer1k: 0.00008 },

  // OpenRouter — Claude
  "openrouter:anthropic/claude-3.5-sonnet-20241022": { inputPer1k: 0.003, outputPer1k: 0.015 },
  "openrouter:anthropic/claude-3-haiku": { inputPer1k: 0.00025, outputPer1k: 0.00125 },

  // OpenRouter — GPT
  "openrouter:openai/gpt-4o": { inputPer1k: 0.005, outputPer1k: 0.015 },
  "openrouter:openai/gpt-4o-mini": { inputPer1k: 0.00015, outputPer1k: 0.0006 },

  // OpenRouter — DeepSeek (free)
  "openrouter:deepseek/deepseek-chat-v3-0324": { inputPer1k: 0, outputPer1k: 0 },
  "openrouter:deepseek/deepseek-r1:free": { inputPer1k: 0, outputPer1k: 0 },

  // OpenRouter — Meta Llama (free)
  "openrouter:meta-llama/llama-3.3-70b-instruct:free": { inputPer1k: 0, outputPer1k: 0 },
  "openrouter:google/gemini-2.0-flash-exp:free": { inputPer1k: 0, outputPer1k: 0 },
  "openrouter:mistralai/mistral-7b-instruct:free": { inputPer1k: 0, outputPer1k: 0 },
};

const FALLBACK_RATE: ModelRate = { inputPer1k: 0, outputPer1k: 0 };

export function getRateForModel(modelId: string): ModelRate {
  return COST_TABLE[modelId] ?? FALLBACK_RATE;
}

export function estimateCost(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const rate = getRateForModel(modelId);
  return (inputTokens / 1000) * rate.inputPer1k + (outputTokens / 1000) * rate.outputPer1k;
}
