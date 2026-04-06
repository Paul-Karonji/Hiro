import test from "node:test";
import assert from "node:assert/strict";
import { ToolRegistry } from "./toolRegistry";

test("ToolRegistry normalizes empty object schemas for provider compatibility", () => {
  const registry = new ToolRegistry();

  registry.register({
    definition: {
      name: "no_args_tool",
      description: "A tool with no arguments.",
      parameters: {
        type: "OBJECT",
        properties: {},
        required: [],
      },
    },
    execute: async () => "ok",
  });

  const tool = registry.getTool("no_args_tool");
  assert.ok(tool);
  assert.deepEqual(tool.definition.parameters, {
    type: "object",
    properties: {
      request_marker: {
        type: "string",
        description: "Required placeholder for provider compatibility. Set this to 'run'.",
      },
    },
    required: ["request_marker"],
    additionalProperties: false,
  });
});
