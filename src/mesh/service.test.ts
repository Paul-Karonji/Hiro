import test from "node:test";
import assert from "node:assert/strict";
import { buildMeshPlannerInstructions } from "./service";

test("buildMeshPlannerInstructions explicitly requires JSON output for structured planners", () => {
  const instructions = buildMeshPlannerInstructions("research rental systems", 6);

  assert.match(instructions.system.toLowerCase(), /json/);
  assert.match(instructions.prompt.toLowerCase(), /json/);
  assert.match(instructions.prompt, /6/);
});
