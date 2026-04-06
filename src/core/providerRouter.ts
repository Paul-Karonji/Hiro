import type { LanguageModel } from "ai";
import { parseModelId } from "./modelState";
import type { RuntimeConfig } from "./types";
import type { PluginRegistry } from "../plugins/registry";

export class ProviderRouter {
  constructor(
    private readonly registry: PluginRegistry,
    private readonly runtimeConfig: RuntimeConfig,
  ) {}

  isProviderEnabled(providerId: string) {
    return this.runtimeConfig.enabledProviders.includes(providerId);
  }

  validateModelSelection(modelId: string) {
    try {
      const { providerId } = parseModelId(modelId);
      if (!this.isProviderEnabled(providerId)) {
        return { ok: false as const, error: `Provider "${providerId}" is disabled in runtime config.` };
      }

      const provider = this.registry.getProvider(providerId);
      if (!provider) {
        return { ok: false as const, error: `Provider "${providerId}" is not registered.` };
      }

      if (!provider.isConfigured()) {
        return { ok: false as const, error: `Provider "${providerId}" is not configured with credentials.` };
      }

      return { ok: true as const };
    } catch (error: any) {
      return { ok: false as const, error: error.message || String(error) };
    }
  }

  assertModelSelection(modelId: string) {
    const validation = this.validateModelSelection(modelId);
    if (!validation.ok) {
      throw new Error(validation.error);
    }
  }

  resolveChatModel(modelId: string): LanguageModel {
    this.assertModelSelection(modelId);

    const { providerId, modelName } = parseModelId(modelId);
    const provider = this.registry.getProvider(providerId)!;
    return provider.createChatModel(modelName);
  }

  resolveEmbeddingModels(modelId: string) {
    const preferredProviderId = parseModelId(modelId).providerId;
    const orderedProviderIds = [preferredProviderId, "google", "openai", "mistral"];
    const seen = new Set<string>();
    const candidates: Array<{ providerId: string; model: any }> = [];

    for (const providerId of orderedProviderIds) {
      if (seen.has(providerId)) {
        continue;
      }
      seen.add(providerId);

      const provider = this.registry.getProvider(providerId);
      if (provider?.createEmbeddingModel && provider.isConfigured() && this.isProviderEnabled(providerId)) {
        candidates.push({
          providerId,
          model: provider.createEmbeddingModel(),
        });
      }
    }

    if (candidates.length === 0) {
      throw new Error("No embedding-capable provider is configured.");
    }

    return candidates;
  }

  resolveEmbeddingModel(modelId: string) {
    return this.resolveEmbeddingModels(modelId)[0].model;
  }
}
