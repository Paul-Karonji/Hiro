import type { LanguageModel } from "ai";
import type { AppContext } from "../core/appContext";
import type { RuntimeTool } from "../core/types";
import type { DefaultMemoryService } from "../memory/service";

export interface ProviderPlugin {
  id: string;
  isConfigured(): boolean;
  createChatModel(modelName: string): LanguageModel;
  createEmbeddingModel?(): any;
}

export interface ChannelService {
  id: string;
  start(): Promise<void>;
  sendText(text: string, options?: { markdown?: boolean }): Promise<void>;
}

export interface ChannelPlugin {
  id: string;
  createService(context: AppContext): ChannelService;
}

export interface ToolPlugin {
  id: string;
  initialize?(context: AppContext): Promise<void> | void;
  getTools(context: AppContext): Promise<RuntimeTool[]> | RuntimeTool[];
}

export interface MemoryPlugin {
  id: string;
  createService(context: Pick<AppContext, "runtimeConfig">): DefaultMemoryService;
}
