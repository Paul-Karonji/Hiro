import { executeMcpTool, initializeMCPBridge, mcpDynamicTools, setMcpToolRegistrationHandler } from "../tools/mcp_bridge";
import type { RuntimeTool } from "../core/types";
import type { ToolPlugin } from "./types";

function createRuntimeTool(definition: any): RuntimeTool {
  return {
    definition,
    execute: async (args) => executeMcpTool(definition.name, args),
  };
}

export const mcpToolsPlugin: ToolPlugin = {
  id: "mcp-tools",
  async initialize(context) {
    setMcpToolRegistrationHandler((definition) => {
      context.toolRegistry.register(createRuntimeTool(definition));
    });

    await initializeMCPBridge();
  },
  getTools() {
    return mcpDynamicTools.map<RuntimeTool>((definition: any) => createRuntimeTool(definition));
  },
};
