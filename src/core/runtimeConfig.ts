import fs from "fs";
import path from "path";
import { config } from "../config";
import type { RuntimeConfig } from "./types";

const runtimeConfigPath = path.resolve(process.cwd(), "data/runtime_config.json");
const DEFAULT_MESH_COLLABORATION_MODELS = [
  "alibaba:qwen3.6-plus",
  "openrouter:qwen/qwen3.6-plus:free",
  "google:gemini-2.5-flash",
  "mistral:mistral-large-latest",
  "groq:llama-3.3-70b-versatile",
  "resurge:grok-4.1-thinking",
  "alibaba:qwen3.5-plus",
  "openrouter:qwen/qwen3.5-plus-02-15",
];

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

export function createDefaultRuntimeConfig(): RuntimeConfig {
  return {
    defaultActiveModel: config.ACTIVE_MODEL || "alibaba:qwen3.6-plus",
    enabledProviders: ["google", "openai", "anthropic", "mistral", "groq", "deepseek", "resurge", "openrouter", "alibaba"],
    channel: config.ACTIVE_CHANNEL,
    memory: "default-memory",
    toolPlugins: ["builtin-tools", "mcp-tools"],
    roleModelOverrides: {},
    sessions: {
      routingEnabled: true,
      idleResetHours: 18,
      dailyResetHour: null,
      timezone: config.PROACTIVE_TIMEZONE,
    },
    agent: {
      maxSteps: 15,
      recentMessages: 20,
      maxTokens: 32768,
    },
    swarm: {
      maxParallel: 2,
    },
    mesh: {
      maxSteps: 6,
      collaborationModels: DEFAULT_MESH_COLLABORATION_MODELS,
    },
  };
}

export function loadRuntimeConfig(): RuntimeConfig {
  const defaults = createDefaultRuntimeConfig();

  if (!fs.existsSync(runtimeConfigPath)) {
    return defaults;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(runtimeConfigPath, "utf8")) as Partial<RuntimeConfig>;

    return {
      defaultActiveModel: parsed.defaultActiveModel || defaults.defaultActiveModel,
      enabledProviders: unique(parsed.enabledProviders || defaults.enabledProviders),
      channel: parsed.channel || defaults.channel,
      memory: parsed.memory || defaults.memory,
      toolPlugins: unique(parsed.toolPlugins || defaults.toolPlugins),
      roleModelOverrides: parsed.roleModelOverrides || defaults.roleModelOverrides,
      sessions: {
        routingEnabled: parsed.sessions?.routingEnabled ?? defaults.sessions.routingEnabled,
        idleResetHours: parsed.sessions?.idleResetHours ?? defaults.sessions.idleResetHours,
        dailyResetHour: parsed.sessions?.dailyResetHour ?? defaults.sessions.dailyResetHour,
        timezone: parsed.sessions?.timezone ?? defaults.sessions.timezone,
      },
      agent: {
        maxSteps: parsed.agent?.maxSteps ?? defaults.agent.maxSteps,
        recentMessages: parsed.agent?.recentMessages ?? defaults.agent.recentMessages,
        maxTokens: parsed.agent?.maxTokens ?? defaults.agent.maxTokens,
      },
      swarm: {
        maxParallel: parsed.swarm?.maxParallel ?? defaults.swarm.maxParallel,
      },
      mesh: {
        maxSteps: parsed.mesh?.maxSteps ?? defaults.mesh.maxSteps,
        collaborationModels: unique(parsed.mesh?.collaborationModels || defaults.mesh.collaborationModels || []),
      },
    };
  } catch (error) {
    console.error("[Runtime Config] Failed to load data/runtime_config.json. Falling back to defaults.", error);
    return defaults;
  }
}
