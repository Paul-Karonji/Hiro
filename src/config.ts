import dotenv from "dotenv";
import { resolve } from "path";

// Load .env file
dotenv.config({ path: resolve(process.cwd(), ".env") });

export const config = {
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || "",
  ALLOWED_USER_ID: process.env.ALLOWED_USER_ID ? parseInt(process.env.ALLOWED_USER_ID, 10) : 0,
  PORT: process.env.PORT ? parseInt(process.env.PORT, 10) : 8080,
  PUBLIC_BASE_URL: process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || "8080"}`,
  OPERATOR_TOKEN: process.env.OPERATOR_TOKEN || "",
  WEBHOOK_SECRET: process.env.WEBHOOK_SECRET || "",

  // WhatsApp
  WHATSAPP_ALLOWED_JID: process.env.WHATSAPP_ALLOWED_JID || "",
  ACTIVE_CHANNEL: process.env.ACTIVE_CHANNEL || "telegram",

  // Agent Multi-Model Core
  ACTIVE_MODEL: process.env.ACTIVE_MODEL || "alibaba:qwen3-235b-a22b", // Default fallback if not set
  ALIBABA_API_KEY: process.env.ALIBABA_API_KEY || "",
  ALIBABA_BASE_URL: process.env.ALIBABA_BASE_URL || "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || "",
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || "",
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || "",
  MISTRAL_API_KEY: process.env.MISTRAL_API_KEY || "",
  DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY || "",
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || "",
  RESURGE_API_KEY: process.env.RESURGE_API_KEY || "",

  // External Services
  PINECONE_API_KEY: process.env.PINECONE_API_KEY || "",
  NEON_DATABASE_URL: process.env.NEON_DATABASE_URL || "",
  GROQ_API_KEY: process.env.GROQ_API_KEY || "",
  ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY || "",
  GOOGLE_TTS_PROJECT_ID: process.env.GOOGLE_TTS_PROJECT_ID || "",
  GOOGLE_TTS_CREDENTIALS_B64: process.env.GOOGLE_TTS_CREDENTIALS_B64 || "",
  GOOGLE_TTS_CREDENTIALS_JSON: process.env.GOOGLE_TTS_CREDENTIALS_JSON || "",
  GOOGLE_TTS_VOICE_NAME: process.env.GOOGLE_TTS_VOICE_NAME || "en-US-Wavenet-D",
  GOOGLE_TTS_LANGUAGE_CODE: process.env.GOOGLE_TTS_LANGUAGE_CODE || "en-US",
  GOOGLE_TTS_MONTHLY_CHAR_LIMIT: process.env.GOOGLE_TTS_MONTHLY_CHAR_LIMIT ? parseInt(process.env.GOOGLE_TTS_MONTHLY_CHAR_LIMIT, 10) : 3500000,
  GOOGLE_TTS_MAX_BYTES_PER_REQUEST: process.env.GOOGLE_TTS_MAX_BYTES_PER_REQUEST ? parseInt(process.env.GOOGLE_TTS_MAX_BYTES_PER_REQUEST, 10) : 4800,
  TAVILY_API_KEY: process.env.TAVILY_API_KEY || "",

  // Proactive System
  PROACTIVE_MORNING_BRIEFING_TIME: process.env.PROACTIVE_MORNING_BRIEFING_TIME || "08:00",
  PROACTIVE_EVENING_RECAP_TIME: process.env.PROACTIVE_EVENING_RECAP_TIME || "20:00",
  PROACTIVE_HEARTBEAT_INTERVAL_HOURS: process.env.PROACTIVE_HEARTBEAT_INTERVAL_HOURS ? parseInt(process.env.PROACTIVE_HEARTBEAT_INTERVAL_HOURS, 10) : 5,
  PROACTIVE_TIMEZONE: process.env.PROACTIVE_TIMEZONE || "Africa/Nairobi",
};

export function validateConfig() {
  const missing: string[] = [];
  const channel = config.ACTIVE_CHANNEL;

  if (channel === "telegram" || channel === "dual") {
    if (!config.TELEGRAM_BOT_TOKEN) missing.push("TELEGRAM_BOT_TOKEN");
    if (!config.ALLOWED_USER_ID) missing.push("ALLOWED_USER_ID");
  }

  if (channel === "whatsapp" || channel === "dual") {
    if (!config.WHATSAPP_ALLOWED_JID) missing.push("WHATSAPP_ALLOWED_JID");
  }

  // We no longer strictly validate GEMINI_API_KEY since ACTIVE_MODEL defines the provider.
  // The system will complain at runtime if the ACTIVE_MODEL provider is missing its key.

  if (missing.length > 0) {
    console.error(`Missing required environment variables for channel "${channel}": ${missing.join(", ")}`);
    process.exit(1);
  }
}
