import test from "node:test";
import assert from "node:assert/strict";
import { buildMcpToolDefinition, formatMcpToolResult, loadMcpConfigFromEnv, mcpDynamicTools, normalizeMcpServerConfig, upsertMcpDynamicTool } from "./mcp_bridge";

test("normalizeMcpServerConfig supports modern HTTP configs with env-backed headers", () => {
  process.env.MCP_API_TOKEN = "test-token";

  assert.deepEqual(
    normalizeMcpServerConfig({
      type: "http",
      url: "https://mcp.example.com/mcp",
      headers: {
        Authorization: "Bearer ${MCP_API_TOKEN}",
      },
    }),
    {
      transport: "http",
      url: "https://mcp.example.com/mcp",
      headers: {
        Authorization: "Bearer test-token",
      },
    }
  );

  delete process.env.MCP_API_TOKEN;
});

test("normalizeMcpServerConfig preserves legacy SSE configs", () => {
  assert.deepEqual(
    normalizeMcpServerConfig({
      command: "https://example.com/sse",
    }),
    {
      transport: "sse",
      url: "https://example.com/sse",
      headers: {},
    }
  );
});

test("loadMcpConfigFromEnv supports inline JSON overrides", () => {
  process.env.MCP_CONFIG_JSON = JSON.stringify({
    mcpServers: {
      tasks: {
        type: "http",
        url: "https://mcp.example.com/mcp",
      },
    },
  });

  assert.deepEqual(loadMcpConfigFromEnv(), {
    mcpServers: {
      tasks: {
        type: "http",
        url: "https://mcp.example.com/mcp",
      },
    },
  });

  delete process.env.MCP_CONFIG_JSON;
});

test("loadMcpConfigFromEnv supports base64 JSON overrides", () => {
  process.env.MCP_CONFIG_JSON_B64 = Buffer.from(JSON.stringify({
    mcpServers: {
      tasks: {
        type: "http",
        url: "https://mcp.example.com/mcp",
      },
    },
  }), "utf8").toString("base64");

  assert.deepEqual(loadMcpConfigFromEnv(), {
    mcpServers: {
      tasks: {
        type: "http",
        url: "https://mcp.example.com/mcp",
      },
    },
  });

  delete process.env.MCP_CONFIG_JSON_B64;
});

test("formatMcpToolResult preserves structured content when present", () => {
  assert.deepEqual(
    formatMcpToolResult({
      isError: false,
      content: [{ type: "text", text: "Found 3 tasks." }],
      structuredContent: {
        total: 3,
        tasks: [{ id: "task_1" }],
      },
    }),
    {
      text: "Found 3 tasks.",
      data: {
        total: 3,
        tasks: [{ id: "task_1" }],
      },
    }
  );
});

test("formatMcpToolResult falls back to plain text when no structured payload exists", () => {
  assert.equal(
    formatMcpToolResult({
      isError: false,
      content: [{ type: "text", text: "Using DueSync user test@example.com." }],
    }),
    "Using DueSync user test@example.com."
  );
});

test("upsertMcpDynamicTool replaces an existing dynamic tool definition by name", () => {
  mcpDynamicTools.length = 0;

  const first = buildMcpToolDefinition("duesync", {
    name: "get_today_tasks",
    description: "Old description",
    inputSchema: { type: "object", properties: {} },
  });

  const updated = buildMcpToolDefinition("duesync", {
    name: "get_today_tasks",
    description: "Updated description",
    inputSchema: { type: "object", properties: { date: { type: "string" } } },
  });

  upsertMcpDynamicTool(first);
  upsertMcpDynamicTool(updated);

  assert.equal(mcpDynamicTools.length, 1);
  assert.equal(mcpDynamicTools[0].description, "Updated description");
  assert.deepEqual(mcpDynamicTools[0].parameters, { type: "object", properties: { date: { type: "string" } } });

  mcpDynamicTools.length = 0;
});
