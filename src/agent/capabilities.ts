import type { ToolRegistry } from "../core/toolRegistry";
import type { AgentTurnRequest, RuntimeTool } from "../core/types";
import type { SessionType } from "../memory/sqlite";
import type { SessionRecord } from "../memory/sqlite";
import { readSessionRoutingMetadata } from "../sessions/resetPolicy";
import type { RoutedSessionPlatform } from "../sessions/types";

type CapabilityDescriptor = {
  id: string;
  title: string;
  summary: string;
  toolNames?: string[];
  match?: "any" | "all";
  channels?: RoutedSessionPlatform[];
  sessionTypes?: SessionType[];
  includeInPrompt?: boolean;
  order: number;
};

export type ResolvedSessionPlatform = RoutedSessionPlatform | "generic";

export interface CapabilitySnapshot {
  platform: ResolvedSessionPlatform;
  capabilities: Array<CapabilityDescriptor & { availableTools: RuntimeTool[] }>;
  additionalTools: RuntimeTool[];
}

const CAPABILITY_CATALOG: CapabilityDescriptor[] = [
  {
    id: "text_replies",
    title: "Text replies",
    summary: "Respond directly in normal conversation.",
    order: 0,
  },
  {
    id: "voice_replies",
    title: "Voice replies",
    summary: "Send a spoken reply when voice output is appropriate.",
    toolNames: ["speak_response"],
    channels: ["telegram"],
    order: 10,
  },
  {
    id: "document_search",
    title: "Attachment and document recall",
    summary: "Search previously ingested PDFs, DOCX files, and text attachments.",
    toolNames: ["search_documents"],
    order: 20,
  },
  {
    id: "file_exports",
    title: "File creation and delivery",
    summary: "Create user-facing documents and send them back into the current chat.",
    toolNames: ["export_file", "send_file_to_user"],
    match: "any",
    order: 30,
  },
  {
    id: "canvas_visuals",
    title: "Live Canvas visuals",
    summary: "Render interactive HTML or JavaScript widgets to the Live Canvas.",
    toolNames: ["render_canvas"],
    order: 40,
  },
  {
    id: "web_research",
    title: "Web research",
    summary: "Search the web, read webpages, and crawl linked documentation when needed.",
    toolNames: ["search_web", "read_webpage", "crawl_website"],
    match: "any",
    order: 50,
  },
  {
    id: "workspace_files",
    title: "Workspace file operations",
    summary: "Read, write, list, and delete files inside the workspace.",
    toolNames: ["read_file", "write_file", "list_directory", "delete_file"],
    match: "any",
    order: 60,
  },
  {
    id: "memory",
    title: "Conversation and memory recall",
    summary: "Search transcript history, long-term memory, and remember durable facts.",
    toolNames: ["search_history", "search_memory", "remember_fact"],
    match: "any",
    order: 70,
  },
  {
    id: "analytics",
    title: "Analytics and usage insight",
    summary: "Log activity, inspect analytics, and render usage summaries or charts.",
    toolNames: ["log_activity", "query_analytics", "get_usage_summary", "render_usage_chart"],
    match: "any",
    order: 80,
  },
  {
    id: "scheduling",
    title: "Scheduling and reminders",
    summary: "Schedule future tasks and inspect or cancel scheduled jobs.",
    toolNames: ["schedule_task", "list_scheduled_tasks", "delete_scheduled_task"],
    match: "any",
    order: 90,
  },
  {
    id: "sessions",
    title: "Session navigation",
    summary: "List other conversations, inspect their history, and send messages into them.",
    toolNames: ["sessions_list", "sessions_history", "sessions_send"],
    match: "any",
    order: 100,
  },
  {
    id: "swarm",
    title: "Parallel swarm execution",
    summary: "Spin up focused swarm workers for bounded subtasks.",
    toolNames: ["run_swarm"],
    order: 110,
  },
  {
    id: "shell",
    title: "Shell execution",
    summary: "Run shell commands inside the workspace when the task requires it.",
    toolNames: ["run_shell_command"],
    order: 120,
  },
];

function unique(items: string[]) {
  return Array.from(new Set(items));
}

function removeTool(toolNames: string[], toolName: string) {
  const index = toolNames.indexOf(toolName);
  if (index >= 0) {
    toolNames.splice(index, 1);
  }
}

function resolvePlatformLabel(platform: ResolvedSessionPlatform) {
  switch (platform) {
    case "telegram":
      return "Telegram";
    case "whatsapp":
      return "WhatsApp";
    default:
      return "Generic";
  }
}

function formatToolList(toolNames: string[]) {
  return toolNames.map((toolName) => `\`${toolName}\``).join(", ");
}

function matchesDescriptor(
  descriptor: CapabilityDescriptor,
  sessionType: SessionType,
  platform: ResolvedSessionPlatform,
  toolSet: Set<string>,
) {
  if (descriptor.sessionTypes && !descriptor.sessionTypes.includes(sessionType)) {
    return false;
  }

  if (descriptor.channels && platform !== "generic" && !descriptor.channels.includes(platform)) {
    return false;
  }

  if (!descriptor.toolNames || descriptor.toolNames.length === 0) {
    return true;
  }

  if (descriptor.match === "all") {
    return descriptor.toolNames.every((toolName) => toolSet.has(toolName));
  }

  return descriptor.toolNames.some((toolName) => toolSet.has(toolName));
}

export function resolveSessionPlatform(
  session: SessionRecord,
  metadata?: Record<string, unknown> | null,
): ResolvedSessionPlatform {
  const requestedChannel = typeof metadata?.channel === "string"
    ? metadata.channel.trim().toLowerCase()
    : "";
  if (requestedChannel === "telegram" || requestedChannel === "whatsapp") {
    return requestedChannel;
  }

  const routing = readSessionRoutingMetadata(session.metadata);
  if (routing) {
    return routing.platform;
  }

  return "generic";
}

export function buildActiveToolAllowlist(input: {
  session: SessionRecord;
  allToolNames: string[];
  enableSpeech?: boolean;
  metadata?: Record<string, unknown> | null;
}) {
  const allowlist = input.session.allowed_tools
    ? [...input.session.allowed_tools]
    : [...input.allToolNames];

  const platform = resolveSessionPlatform(input.session, input.metadata);
  if (input.enableSpeech === false || platform === "whatsapp") {
    removeTool(allowlist, "speak_response");
  }

  return unique(allowlist);
}

export function resolveActiveRuntimeTools(
  toolRegistry: ToolRegistry,
  input: {
    session: SessionRecord;
    enableSpeech?: boolean;
    metadata?: Record<string, unknown> | null;
  },
) {
  const allToolNames = toolRegistry.getTools().map((tool) => tool.definition.name);
  const activeToolNames = buildActiveToolAllowlist({
    session: input.session,
    allToolNames,
    enableSpeech: input.enableSpeech,
    metadata: input.metadata,
  });

  return {
    platform: resolveSessionPlatform(input.session, input.metadata),
    activeToolNames,
    activeTools: toolRegistry.getTools(activeToolNames),
  };
}

export function resolveCapabilitySnapshot(input: {
  session: SessionRecord;
  tools: RuntimeTool[];
  metadata?: Record<string, unknown> | null;
}): CapabilitySnapshot {
  const platform = resolveSessionPlatform(input.session, input.metadata);
  const toolMap = new Map(input.tools.map((tool) => [tool.definition.name, tool]));
  const toolSet = new Set(toolMap.keys());

  const capabilities = CAPABILITY_CATALOG
    .filter((descriptor) => matchesDescriptor(descriptor, input.session.type, platform, toolSet))
    .sort((left, right) => left.order - right.order)
    .map((descriptor) => ({
      ...descriptor,
      availableTools: (descriptor.toolNames ?? [])
        .map((toolName) => toolMap.get(toolName))
        .filter((tool): tool is RuntimeTool => Boolean(tool)),
    }));

  const coveredToolNames = new Set(
    capabilities.flatMap((descriptor) => descriptor.availableTools.map((tool) => tool.definition.name)),
  );

  const additionalTools = input.tools
    .filter((tool) => !coveredToolNames.has(tool.definition.name))
    .sort((left, right) => left.definition.name.localeCompare(right.definition.name));

  return {
    platform,
    capabilities,
    additionalTools,
  };
}

export function buildCapabilitiesPrompt(input: {
  session: SessionRecord;
  tools: RuntimeTool[];
  metadata?: Record<string, unknown> | null;
}) {
  const snapshot = resolveCapabilitySnapshot(input);
  const lines = ["CAPABILITIES:"];

  for (const capability of snapshot.capabilities) {
    if (capability.includeInPrompt === false) {
      continue;
    }

    const toolSuffix = capability.availableTools.length > 0
      ? ` Tools: ${formatToolList(capability.availableTools.map((tool) => tool.definition.name))}.`
      : "";
    lines.push(`- ${capability.title}: ${capability.summary}${toolSuffix}`);
  }

  if (snapshot.platform === "whatsapp") {
    lines.push("- WhatsApp delivery: spoken playback is handled by the channel layer after you respond in plain text, so the speak_response tool is not available here.");
  }

  if (snapshot.additionalTools.length > 0) {
    const extraNames = snapshot.additionalTools.map((tool) => tool.definition.name);
    const preview = extraNames.slice(0, 8).map((name) => `\`${name}\``).join(", ");
    const extraCount = extraNames.length - Math.min(extraNames.length, 8);
    const suffix = extraCount > 0 ? `, plus ${extraCount} more` : "";
    lines.push(`- Additional connected tools are available right now: ${preview}${suffix}. Refer to the mounted tool schemas when one of these fits the request.`);
  }

  return lines.join("\n");
}

export function buildCapabilitiesReport(input: {
  session: SessionRecord;
  tools: RuntimeTool[];
  metadata?: Record<string, unknown> | null;
  modelName?: string | null;
}) {
  const snapshot = resolveCapabilitySnapshot(input);
  const lines: string[] = [
    "Hiro capabilities",
    `Channel: ${resolvePlatformLabel(snapshot.platform)}`,
    `Session type: ${input.session.type}`,
  ];

  if (input.modelName) {
    lines.push(`Active model: ${input.modelName}`);
  }

  lines.push("");
  lines.push("Core abilities:");

  for (const capability of snapshot.capabilities) {
    const toolSuffix = capability.availableTools.length > 0
      ? `\nTools: ${capability.availableTools.map((tool) => `${tool.definition.name} - ${tool.definition.description}`).join(" | ")}`
      : "";
    lines.push(`- ${capability.title}: ${capability.summary}${toolSuffix}`);
  }

  if (snapshot.additionalTools.length > 0) {
    lines.push("");
    lines.push("Additional connected tools:");
    for (const tool of snapshot.additionalTools) {
      lines.push(`- ${tool.definition.name}: ${tool.definition.description}`);
    }
  }

  return lines.join("\n");
}
