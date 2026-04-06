import type { AgentRuntime } from "../agent/runtime";
import type { MeshWorkflowService } from "../mesh/service";
import type { DefaultMemoryService } from "../memory/service";
import type { ChannelService } from "../plugins/types";
import type { PluginRegistry } from "../plugins/registry";
import type { SessionService } from "../sessions/service";
import type { SwarmCoordinator } from "../swarm/coordinator";
import type { UsageTracker } from "../usage/tracker";
import type { ActiveModelState } from "./modelState";
import type { ProviderRouter } from "./providerRouter";
import type { RuntimeConfig } from "./types";
import type { ToolRegistry } from "./toolRegistry";

export interface AppContext {
  runtimeConfig: RuntimeConfig;
  plugins: PluginRegistry;
  providerRouter: ProviderRouter;
  modelState: ActiveModelState;
  toolRegistry: ToolRegistry;
  memory: DefaultMemoryService;
  sessions: SessionService;
  runtime: AgentRuntime;
  swarm: SwarmCoordinator;
  mesh: MeshWorkflowService;
  usageTracker: UsageTracker;
  channel?: ChannelService;
}

let appContext: AppContext | null = null;

export function setAppContext(next: AppContext) {
  appContext = next;
}

export function updateAppContext(patch: Partial<AppContext>) {
  if (!appContext) {
    throw new Error("App context has not been initialized.");
  }

  appContext = { ...appContext, ...patch };
}

export function getAppContext(): AppContext {
  if (!appContext) {
    throw new Error("App context has not been initialized.");
  }

  return appContext;
}
