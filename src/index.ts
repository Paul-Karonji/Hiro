import { AgentRuntime } from "./agent/runtime";
import { initializeScheduler } from "./agent/scheduler";
import { initializeProactiveSystem } from "./agent/proactive";
import { validateConfig } from "./config";
import { getAppContext, setAppContext, updateAppContext } from "./core/appContext";
import { ActiveModelState } from "./core/modelState";
import { ProviderRouter } from "./core/providerRouter";
import { loadRuntimeConfig } from "./core/runtimeConfig";
import { ToolRegistry } from "./core/toolRegistry";
import { initializePostgres } from "./memory/postgres";
import { MeshWorkflowService } from "./mesh/service";
import { DefaultMemoryService } from "./memory/service";
import { builtinChannelPlugin } from "./plugins/builtinChannel";
import { whatsappChannelPlugin } from "./plugins/whatsappChannel";
import { dualChannelPlugin, type DualChannelService } from "./plugins/dualChannel";
import { defaultMemoryPlugin } from "./plugins/builtinMemory";
import { getBuiltinProviderPlugins } from "./plugins/builtinProviders";
import { builtinToolsPlugin } from "./plugins/builtinTools";
import { mcpToolsPlugin } from "./plugins/mcpTools";
import { PluginRegistry } from "./plugins/registry";
import { initializeWebServer } from "./server";
import { SessionService } from "./sessions/service";
import { SwarmCoordinator } from "./swarm/coordinator";
import { usageTracker } from "./usage/tracker";

async function main() {
  console.log("Starting Hiro Setup Phase...");

  validateConfig();
  console.log("[Config] Loaded and validated successfully.");

  await initializePostgres();

  const runtimeConfig = loadRuntimeConfig();
  const plugins = new PluginRegistry();

  for (const providerPlugin of getBuiltinProviderPlugins()) {
    plugins.registerProvider(providerPlugin);
  }
  plugins.registerMemory(defaultMemoryPlugin);
  plugins.registerChannel(builtinChannelPlugin);
  plugins.registerChannel(whatsappChannelPlugin);
  plugins.registerChannel(dualChannelPlugin);
  plugins.registerTool(builtinToolsPlugin);
  plugins.registerTool(mcpToolsPlugin);

  const memoryPlugin = plugins.getMemory(runtimeConfig.memory);
  if (!memoryPlugin) {
    throw new Error(`Unknown memory plugin "${runtimeConfig.memory}".`);
  }

  const memory = memoryPlugin.createService({ runtimeConfig }) as DefaultMemoryService;
  const modelState = new ActiveModelState(runtimeConfig.defaultActiveModel);
  const providerRouter = new ProviderRouter(plugins, runtimeConfig);
  providerRouter.assertModelSelection(modelState.getCurrentModel());

  const toolRegistry = new ToolRegistry();
  const sessions = new SessionService(memory, modelState, runtimeConfig);
  const runtime = new AgentRuntime({
    memory,
    sessions,
    toolRegistry,
    providerRouter,
    modelState,
    runtimeConfig,
  });
  sessions.attachRuntime(runtime);

  const swarm = new SwarmCoordinator(runtime, sessions, runtimeConfig);
  const mesh = new MeshWorkflowService(
    runtime,
    sessions,
    swarm,
    memory,
    providerRouter,
    modelState,
    runtimeConfig,
  );

  setAppContext({
    runtimeConfig,
    plugins,
    providerRouter,
    modelState,
    toolRegistry,
    memory,
    sessions,
    runtime,
    swarm,
    mesh,
    usageTracker,
    channels: {},
  });

  for (const toolPluginId of runtimeConfig.toolPlugins) {
    const toolPlugin = plugins.getTool(toolPluginId);
    if (!toolPlugin) {
      throw new Error(`Unknown tool plugin "${toolPluginId}".`);
    }

    if (toolPlugin.initialize) {
      await toolPlugin.initialize(getAppContext());
    }

    const tools = await toolPlugin.getTools(getAppContext());
    for (const tool of tools) {
      toolRegistry.register(tool);
    }
  }

  const channelPlugin = plugins.getChannel(runtimeConfig.channel);
  if (!channelPlugin) {
    throw new Error(`Unknown channel plugin "${runtimeConfig.channel}".`);
  }

  const channel = channelPlugin.createService(getAppContext());
  const namedChannels: Record<string, import("./plugins/types").ChannelService> = {};
  if (channel.id === "dual") {
    const dual = channel as DualChannelService;
    namedChannels["telegram"] = dual.telegram;
    namedChannels["whatsapp"] = dual.whatsapp;
  } else {
    namedChannels[channel.id] = channel;
  }
  updateAppContext({ channel, channels: namedChannels });

  initializeScheduler();
  initializeProactiveSystem();
  initializeWebServer();

  await channel.start();
}

main().catch((error) => {
  console.error("[Startup Error]", error);
  process.exit(1);
});
