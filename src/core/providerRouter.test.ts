import test from "node:test";
import assert from "node:assert/strict";
import { PluginRegistry } from "../plugins/registry";
import type { ProviderPlugin } from "../plugins/types";
import { ProviderRouter } from "./providerRouter";

function createMockProvider(id: string, configured = true, withEmbedding = false) {
  const provider: ProviderPlugin = {
    id,
    isConfigured: () => configured,
    createChatModel: () => ({ provider: id } as any),
  };

  if (withEmbedding) {
    provider.createEmbeddingModel = () => ({ provider: id, type: "embedding" } as any);
  }

  return provider;
}

test("ProviderRouter validates enabled configured providers", () => {
  const registry = new PluginRegistry();
  registry.registerProvider(createMockProvider("google"));

  const router = new ProviderRouter(registry, {
    defaultActiveModel: "google:gemini-2.5-flash",
    enabledProviders: ["google"],
    channel: "telegram",
    memory: "default-memory",
    toolPlugins: ["builtin-tools"],
    roleModelOverrides: {},
    sessions: {
      routingEnabled: true,
      idleResetHours: 18,
      dailyResetHour: null,
      timezone: "Africa/Nairobi",
    },
    agent: { maxSteps: 10, recentMessages: 20, maxTokens: 1024 },
    swarm: { maxParallel: 2 },
    mesh: { maxSteps: 6 },
  });

  assert.deepEqual(router.validateModelSelection("google:gemini-2.5-flash"), { ok: true });
});

test("ProviderRouter rejects disabled or unconfigured providers", () => {
  const registry = new PluginRegistry();
  registry.registerProvider(createMockProvider("openrouter", false));

  const router = new ProviderRouter(registry, {
    defaultActiveModel: "google:gemini-2.5-flash",
    enabledProviders: ["google"],
    channel: "telegram",
    memory: "default-memory",
    toolPlugins: ["builtin-tools"],
    roleModelOverrides: {},
    sessions: {
      routingEnabled: true,
      idleResetHours: 18,
      dailyResetHour: null,
      timezone: "Africa/Nairobi",
    },
    agent: { maxSteps: 10, recentMessages: 20, maxTokens: 1024 },
    swarm: { maxParallel: 2 },
    mesh: { maxSteps: 6 },
  });

  const disabled = router.validateModelSelection("openrouter:deepseek/deepseek-r1:free");
  assert.equal(disabled.ok, false);
  assert.match(disabled.error, /disabled/);
});

test("ProviderRouter resolves embedding candidates in fallback order", () => {
  const registry = new PluginRegistry();
  registry.registerProvider(createMockProvider("openrouter"));
  registry.registerProvider(createMockProvider("google", true, true));
  registry.registerProvider(createMockProvider("mistral", true, true));

  const router = new ProviderRouter(registry, {
    defaultActiveModel: "alibaba:qwen3.6-plus",
    enabledProviders: ["alibaba", "openrouter", "google", "mistral"],
    channel: "telegram",
    memory: "default-memory",
    toolPlugins: ["builtin-tools"],
    roleModelOverrides: {},
    sessions: {
      routingEnabled: true,
      idleResetHours: 18,
      dailyResetHour: null,
      timezone: "Africa/Nairobi",
    },
    agent: { maxSteps: 10, recentMessages: 20, maxTokens: 1024 },
    swarm: { maxParallel: 2 },
    mesh: { maxSteps: 6 },
  });

  const candidates = router.resolveEmbeddingModels("alibaba:qwen3.6-plus");
  assert.deepEqual(
    candidates.map((candidate) => candidate.providerId),
    ["google", "mistral"],
  );
});
