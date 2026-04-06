import test from "node:test";
import assert from "node:assert/strict";
import { buildUserMessageContent, isPseudoToolOutput } from "./runtime";

test("isPseudoToolOutput detects fake tool JSON stubs", () => {
  assert.equal(
    isPseudoToolOutput('```json\n{\n  "tool_code": "print(DueSync.get_today_tasks())"\n}\n```'),
    true,
  );
});

test("isPseudoToolOutput ignores normal natural-language answers", () => {
  assert.equal(
    isPseudoToolOutput("You have 0 pending tasks scheduled for today."),
    false,
  );
});

test("buildUserMessageContent preserves binary images without converting them to data URLs", () => {
  const image = new Uint8Array([0xff, 0xd8, 0xff]);
  const content = buildUserMessageContent("Analyze this.", [{ data: image, mediaType: "image/jpeg" }]);

  assert.ok(Array.isArray(content));
  assert.deepEqual(content, [
    { type: "text", text: "Analyze this." },
    { type: "image", image, mediaType: "image/jpeg" },
  ]);
});
