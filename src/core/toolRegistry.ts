import { jsonSchema, tool as createAiTool } from "ai";
import type { ToolDefinition, ToolExecutionContext, ToolTraceEntry } from "./types";
import type { RuntimeTool } from "./types";

function normalizeJsonSchema(schema: unknown): any {
  if (Array.isArray(schema)) {
    return schema.map(normalizeJsonSchema);
  }

  if (!schema || typeof schema !== "object") {
    return schema;
  }

  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === "type" && typeof value === "string") {
      next[key] = value.toLowerCase();
      continue;
    }

    next[key] = normalizeJsonSchema(value);
  }

  if (Array.isArray(next.required) && next.required.length === 0) {
    delete next.required;
  }

  if (next.type === "object" && next.properties && next.additionalProperties === undefined) {
    next.additionalProperties = false;
  }

  if (
    next.type === "object"
    && (!next.properties || (typeof next.properties === "object" && Object.keys(next.properties as Record<string, unknown>).length === 0))
  ) {
    next.properties = {
      request_marker: {
        type: "string",
        description: "Required placeholder for provider compatibility. Set this to 'run'.",
      },
    };
    next.required = ["request_marker"];
    next.additionalProperties = false;
  }

  return next;
}

function normalizeToolDefinition(definition: ToolDefinition): ToolDefinition {
  return {
    ...definition,
    parameters: normalizeJsonSchema(definition.parameters),
  };
}

export class ToolRegistry {
  private readonly tools = new Map<string, RuntimeTool>();

  register(tool: RuntimeTool) {
    this.tools.set(tool.definition.name, {
      definition: normalizeToolDefinition(tool.definition),
      execute: tool.execute,
    });
  }

  getTool(name: string) {
    return this.tools.get(name);
  }

  getTools(activeToolNames?: string[]) {
    const values = Array.from(this.tools.values());
    if (!activeToolNames || activeToolNames.length === 0) {
      return values;
    }

    const allowlist = new Set(activeToolNames);
    return values.filter((tool) => allowlist.has(tool.definition.name));
  }

  buildAiTools(context: ToolExecutionContext, activeToolNames?: string[]) {
    const tools = this.getTools(activeToolNames);
    const aiTools: Record<string, any> = {};

    for (const runtimeTool of tools) {
      aiTools[runtimeTool.definition.name] = createAiTool({
        description: runtimeTool.definition.description,
        parameters: jsonSchema(runtimeTool.definition.parameters),
        execute: async (args: any) => {
          const sanitizedArgs = args && typeof args === "object"
            ? Object.fromEntries(Object.entries(args).filter(([key]) => key !== "request_marker"))
            : args;

          const entry: ToolTraceEntry = {
            name: runtimeTool.definition.name,
            input: sanitizedArgs,
            startedAt: new Date().toISOString(),
          };
          context.trace.push(entry);

          try {
            const result = await runtimeTool.execute(sanitizedArgs, context);
            entry.output = result;
            return result;
          } catch (error: any) {
            entry.error = error?.message || String(error);
            return `Tool Error: ${entry.error}`;
          } finally {
            entry.finishedAt = new Date().toISOString();
          }
        },
      } as any);
    }

    return aiTools;
  }
}
