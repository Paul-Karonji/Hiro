import test from "node:test";
import assert from "node:assert/strict";
import { ToolRegistry } from "../core/toolRegistry";
import type { RuntimeTool } from "../core/types";
import type { SessionRecord } from "../memory/sqlite";
import {
  buildCapabilitiesPrompt,
  buildCapabilitiesReport,
  resolveActiveRuntimeTools,
} from "./capabilities";

function createRuntimeTool(name: string, description: string): RuntimeTool {
  return {
    definition: {
      name,
      description,
      parameters: {
        type: "object",
        properties: {},
      },
    },
    async execute() {
      return "ok";
    },
  };
}

function createSession(platform: "telegram" | "whatsapp" | "generic", allowedTools: string[] | null = null): SessionRecord {
  return {
    id: `session-${platform}`,
    title: "Test Session",
    type: "primary",
    role: null,
    status: "active",
    parent_session_id: null,
    model_override: null,
    last_model_used: null,
    instructions: null,
    allowed_tools: allowedTools,
    metadata: platform === "generic"
      ? null
      : {
          sessionRouting: {
            version: 1,
            kind: "routed_primary",
            platform,
            userId: "user-1",
            chatId: "chat-1",
            threadId: null,
            sessionKey: `primary:${platform}:chat:chat-1`,
          },
        },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

test("resolveActiveRuntimeTools removes speak_response on WhatsApp sessions", () => {
  const registry = new ToolRegistry();
  registry.register(createRuntimeTool("speak_response", "Speak out loud."));
  registry.register(createRuntimeTool("export_file", "Create a file."));

  const session = createSession("whatsapp");
  const resolved = resolveActiveRuntimeTools(registry, {
    session,
    enableSpeech: true,
    metadata: { channel: "whatsapp" },
  });

  assert.deepEqual(resolved.activeToolNames, ["export_file"]);
});

test("buildCapabilitiesPrompt reflects grouped capabilities and uncategorized tools", () => {
  const session = createSession("telegram");
  const prompt = buildCapabilitiesPrompt({
    session,
    metadata: { channel: "telegram" },
    tools: [
      createRuntimeTool("export_file", "Create a user-facing file."),
      createRuntimeTool("send_file_to_user", "Send a stored file back to the user."),
      createRuntimeTool("mcp_duesync_plan_day", "Plan the user's day from DueSync."),
    ],
  });

  assert.match(prompt, /File creation and delivery/);
  assert.match(prompt, /Additional connected tools are available right now: `mcp_duesync_plan_day`/);
});

test("buildCapabilitiesReport shows the active channel, model, and additional tools", () => {
  const session = createSession("whatsapp");
  const report = buildCapabilitiesReport({
    session,
    metadata: { channel: "whatsapp" },
    modelName: "google:gemini-2.5-flash",
    tools: [
      createRuntimeTool("search_documents", "Search stored documents."),
      createRuntimeTool("mcp_duesync_get_today_tasks", "Read today's tasks from DueSync."),
    ],
  });

  assert.match(report, /Channel: WhatsApp/);
  assert.match(report, /Active model: google:gemini-2.5-flash/);
  assert.match(report, /Attachment and document recall/);
  assert.match(report, /Additional connected tools:/);
  assert.match(report, /mcp_duesync_get_today_tasks/);
});
