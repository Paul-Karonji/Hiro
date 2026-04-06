import fs from "fs";
import path from "path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const CONNECT_TIMEOUT_MS = 15000;
const RECONNECT_DELAY_MS = 30000;

const mcpClients: Record<string, Client> = {};
const mcpServerConfigs: Record<string, NormalizedMcpServerConfig> = {};
const mcpRetryTimers: Record<string, ReturnType<typeof setTimeout> | undefined> = {};
const mcpConnectingServers = new Set<string>();
const mountedToolNamesByServer: Record<string, Set<string>> = {};

let dynamicToolRegistrationHandler: ((definition: any) => void) | null = null;

export const mcpDynamicTools: any[] = [];

type McpTransportKind = "http" | "sse";

type McpServerConfig = {
  type?: McpTransportKind;
  url?: string;
  headers?: Record<string, string>;
  command?: string;
  env?: Record<string, string>;
};

type NormalizedMcpServerConfig = {
  transport: McpTransportKind;
  url: string;
  headers: Record<string, string>;
};

type McpConfigFile = {
  mcpServers?: Record<string, McpServerConfig>;
};

function resolveTemplateString(value: string): string {
  return value.replace(/\$\{([A-Z0-9_]+)\}/gi, (_, envName: string) => process.env[envName] || "");
}

function resolveHeaders(headers?: Record<string, string>): Record<string, string> {
  if (!headers) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(headers)
      .map(([key, value]) => [key, resolveTemplateString(String(value)).trim()])
      .filter(([, value]) => value.length > 0),
  );
}

export function normalizeMcpServerConfig(serverCfg: McpServerConfig): NormalizedMcpServerConfig | null {
  const headers = resolveHeaders(serverCfg.headers);
  const url = serverCfg.url ? resolveTemplateString(serverCfg.url).trim() : "";
  const legacyCommand = serverCfg.command ? resolveTemplateString(serverCfg.command).trim() : "";

  if (serverCfg.type === "http" && url) {
    return { transport: "http", url, headers };
  }

  if (serverCfg.type === "sse" && url) {
    return { transport: "sse", url, headers };
  }

  if (url) {
    return { transport: "http", url, headers };
  }

  if (legacyCommand.startsWith("http")) {
    return { transport: "sse", url: legacyCommand, headers };
  }

  return null;
}

function parseMcpConfig(raw: string, sourceLabel: string): McpConfigFile | null {
  try {
    return JSON.parse(raw);
  } catch (error: any) {
    console.error(`[MCP Bridge] Invalid MCP config from ${sourceLabel}:`, error?.message || String(error));
    return null;
  }
}

export function loadMcpConfigFromEnv(): McpConfigFile | null {
  const inlineConfig = process.env.MCP_CONFIG_JSON?.trim();
  if (inlineConfig) {
    return parseMcpConfig(inlineConfig, "MCP_CONFIG_JSON");
  }

  const encodedConfig = process.env.MCP_CONFIG_JSON_B64?.trim();
  if (encodedConfig) {
    try {
      const decoded = Buffer.from(encodedConfig, "base64").toString("utf8");
      return parseMcpConfig(decoded, "MCP_CONFIG_JSON_B64");
    } catch (error: any) {
      console.error("[MCP Bridge] Invalid MCP_CONFIG_JSON_B64:", error?.message || String(error));
      return null;
    }
  }

  return null;
}

function createTransport(serverCfg: NormalizedMcpServerConfig) {
  const requestInit = Object.keys(serverCfg.headers).length > 0
    ? { headers: serverCfg.headers }
    : undefined;

  if (serverCfg.transport === "http") {
    return new StreamableHTTPClientTransport(new URL(serverCfg.url), { requestInit });
  }

  return new SSEClientTransport(
    new URL(serverCfg.url),
    requestInit
      ? {
          requestInit,
          eventSourceInit: { headers: serverCfg.headers } as any,
        }
      : undefined,
  );
}

function clearReconnectTimer(serverName: string) {
  const timer = mcpRetryTimers[serverName];
  if (timer) {
    clearTimeout(timer);
    delete mcpRetryTimers[serverName];
  }
}

async function closeClient(serverName: string) {
  const client = mcpClients[serverName];
  if (!client) {
    return;
  }

  try {
    await client.close();
  } catch (error: any) {
    console.warn(`[MCP Bridge] Failed to close ${serverName}:`, error?.message || String(error));
  } finally {
    delete mcpClients[serverName];
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return await new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

function scheduleReconnect(serverName: string, reason: string) {
  if (!mcpServerConfigs[serverName]) {
    return;
  }

  if (mcpRetryTimers[serverName]) {
    return;
  }

  console.warn(`[MCP Bridge] Scheduling reconnect for ${serverName} in ${RECONNECT_DELAY_MS / 1000}s (${reason}).`);
  mcpRetryTimers[serverName] = setTimeout(() => {
    delete mcpRetryTimers[serverName];
    void connectServer(serverName, "scheduled reconnect");
  }, RECONNECT_DELAY_MS);
}

export function buildMcpToolDefinition(serverName: string, tool: any) {
  return {
    name: `mcp_${serverName}_${tool.name}`,
    description: tool.description || `Tool from ${serverName} MCP`,
    parameters: tool.inputSchema || { type: "object", properties: {} },
  };
}

export function upsertMcpDynamicTool(definition: any) {
  const index = mcpDynamicTools.findIndex((tool) => tool.name === definition.name);
  if (index >= 0) {
    mcpDynamicTools[index] = definition;
  } else {
    mcpDynamicTools.push(definition);
  }
}

function registerMountedTool(serverName: string, tool: any) {
  const definition = buildMcpToolDefinition(serverName, tool);
  upsertMcpDynamicTool(definition);

  if (!mountedToolNamesByServer[serverName]) {
    mountedToolNamesByServer[serverName] = new Set<string>();
  }

  const alreadyMounted = mountedToolNamesByServer[serverName].has(definition.name);
  mountedToolNamesByServer[serverName].add(definition.name);
  dynamicToolRegistrationHandler?.(definition);

  if (!alreadyMounted) {
    console.log(`[MCP Bridge] Mounted tool: ${definition.name}`);
  }
}

function cleanupBridgeState() {
  for (const serverName of Object.keys(mcpRetryTimers)) {
    clearReconnectTimer(serverName);
  }

  for (const serverName of Object.keys(mcpClients)) {
    void closeClient(serverName);
  }

  for (const key of Object.keys(mcpServerConfigs)) {
    delete mcpServerConfigs[key];
  }

  for (const key of Object.keys(mountedToolNamesByServer)) {
    delete mountedToolNamesByServer[key];
  }

  mcpConnectingServers.clear();
  mcpDynamicTools.length = 0;
}

function attachTransportLifecycle(serverName: string, transport: any) {
  transport.onclose = () => {
    delete mcpClients[serverName];
    scheduleReconnect(serverName, "transport closed");
  };

  transport.onerror = (error: Error) => {
    console.warn(`[MCP Bridge] Transport error from ${serverName}:`, error?.message || String(error));
  };
}

async function connectServer(serverName: string, reason: string): Promise<boolean> {
  const serverCfg = mcpServerConfigs[serverName];
  if (!serverCfg) {
    return false;
  }

  if (mcpClients[serverName]) {
    return true;
  }

  if (mcpConnectingServers.has(serverName)) {
    return false;
  }

  mcpConnectingServers.add(serverName);
  clearReconnectTimer(serverName);

  try {
    console.log(`[MCP Bridge] Connecting to ${serverCfg.transport.toUpperCase()} MCP: ${serverName} at ${serverCfg.url} (${reason})...`);
    const transport: any = createTransport(serverCfg);
    attachTransportLifecycle(serverName, transport);

    const client = new Client({ name: "Hiro-MCP-Bridge", version: "1.0.0" }, { capabilities: {} });
    await withTimeout(client.connect(transport), CONNECT_TIMEOUT_MS, `${serverName} connect`);
    mcpClients[serverName] = client;

    const toolsList = await withTimeout(client.listTools(), CONNECT_TIMEOUT_MS, `${serverName} listTools`);
    for (const tool of toolsList.tools) {
      registerMountedTool(serverName, tool);
    }

    return true;
  } catch (error: any) {
    delete mcpClients[serverName];
    console.error(`[MCP Bridge] Failed to connect to ${serverName}:`, error?.message || String(error));
    scheduleReconnect(serverName, reason);
    return false;
  } finally {
    mcpConnectingServers.delete(serverName);
  }
}

export function setMcpToolRegistrationHandler(handler: ((definition: any) => void) | null) {
  dynamicToolRegistrationHandler = handler;

  if (!handler) {
    return;
  }

  for (const definition of mcpDynamicTools) {
    handler(definition);
  }
}

export function formatMcpToolResult(result: any): unknown {
  const text = Array.isArray(result?.content)
    ? result.content
        .filter((item: any) => item?.type === "text")
        .map((item: any) => item.text)
        .join("\n")
        .trim()
    : "";

  if (result?.isError) {
    return {
      error: text || "The MCP server returned an error.",
      data: result?.structuredContent ?? null,
    };
  }

  if (result?.structuredContent !== undefined) {
    return {
      text,
      data: result.structuredContent,
    };
  }

  return text || result?.content || "";
}

export async function initializeMCPBridge() {
  console.log("[MCP Bridge] Initializing...");
  const configPath = path.resolve(process.cwd(), "data/mcp_config.json");
  cleanupBridgeState();

  const envConfig = loadMcpConfigFromEnv();
  if (envConfig?.mcpServers) {
    for (const [serverName, rawServerCfg] of Object.entries<McpServerConfig>(envConfig.mcpServers)) {
      const serverCfg = normalizeMcpServerConfig(rawServerCfg);
      if (!serverCfg) {
        console.log(`[MCP Bridge] Skipping ${serverName} - unsupported MCP config. Use { type, url, headers } for HTTP or { command } for legacy SSE.`);
        continue;
      }

      mcpServerConfigs[serverName] = serverCfg;
      await connectServer(serverName, "startup");
    }
    return;
  }

  if (!fs.existsSync(configPath)) {
    console.log("[MCP Bridge] No data/mcp_config.json found. Creating template.");
    fs.mkdirSync(path.dirname(configPath), { recursive: true });

    const template = {
      mcpServers: {
        "example-http": {
          type: "http",
          url: "https://example.com/mcp",
          headers: {
            Authorization: "Bearer ${MCP_API_TOKEN}",
          },
        },
        "example-sse": {
          command: "https://example.com/sse",
        },
      },
    };

    fs.writeFileSync(configPath, JSON.stringify(template, null, 2));
    return;
  }

  try {
    const raw = fs.readFileSync(configPath, "utf8");
    const config = parseMcpConfig(raw, configPath);
    if (!config?.mcpServers) {
      return;
    }

    for (const [serverName, rawServerCfg] of Object.entries<McpServerConfig>(config.mcpServers)) {
      const serverCfg = normalizeMcpServerConfig(rawServerCfg);
      if (!serverCfg) {
        console.log(`[MCP Bridge] Skipping ${serverName} - unsupported MCP config. Use { type, url, headers } for HTTP or { command } for legacy SSE.`);
        continue;
      }

      mcpServerConfigs[serverName] = serverCfg;
      await connectServer(serverName, "startup");
    }
  } catch (error: any) {
    console.error("[MCP Bridge] Error loading config:", error?.message || String(error));
  }
}

export async function executeMcpTool(geminiToolName: string, args: any): Promise<any> {
  const prefixRemoved = geminiToolName.replace("mcp_", "");

  let targetServer: string | null = null;
  for (const name of Object.keys(mcpServerConfigs)) {
    if (prefixRemoved.startsWith(name + "_")) {
      targetServer = name;
      break;
    }
  }

  if (!targetServer) {
    return `Error: Could not determine MCP server for tool ${geminiToolName}`;
  }

  const actualToolName = prefixRemoved.slice(targetServer.length + 1);

  if (!mcpClients[targetServer]) {
    await connectServer(targetServer, "on-demand tool call");
  }

  const client = mcpClients[targetServer];
  if (!client) {
    scheduleReconnect(targetServer, "tool call requested while disconnected");
    return `Error: MCP client ${targetServer} is not connected. Reconnection has been scheduled.`;
  }

  try {
    console.log(`[MCP Bridge] Proxying call [${actualToolName}] to [${targetServer}]`);
    const result = await client.callTool({
      name: actualToolName,
      arguments: args,
    });
    return formatMcpToolResult(result);
  } catch (error: any) {
    console.error(`[MCP Bridge] Tool call failed for ${targetServer}/${actualToolName}:`, error?.message || String(error));
    await closeClient(targetServer);
    scheduleReconnect(targetServer, "tool execution failure");
    return `MCP Execution Error: ${error?.message || String(error)}`;
  }
}
