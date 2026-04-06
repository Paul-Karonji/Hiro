import test from "node:test";
import assert from "node:assert/strict";
import {
  buildImageMemorySummary,
  findRelevantImageMemories,
  formatImageMemoriesForSystemPrompt,
  sanitizeImageMemoryText,
  withStoredImageMemory,
} from "./imageMemory";

test("sanitizeImageMemoryText removes markdown bullets and action promises", () => {
  assert.equal(
    sanitizeImageMemoryText("**Title**\n- Dates: 8 April\nI will create a task"),
    "Title Dates: 8 April",
  );
});

test("withStoredImageMemory stores compact text-only image memories", () => {
  const metadata = withStoredImageMemory(null, {
    summary: "User shared an image. Extracted details: Workshop on 8 April 2026.",
    capturedAt: "2026-04-05T07:00:00.000Z",
  });

  const rendered = formatImageMemoriesForSystemPrompt(metadata);
  assert.match(rendered ?? "", /Workshop on 8 April 2026/);
});

test("findRelevantImageMemories falls back to recent image memories for image references", () => {
  const metadata = withStoredImageMemory(null, {
    summary: buildImageMemorySummary(
      "Please analyze this image.",
      "This image is an invitation to an AI for Sustainable Development workshop on 8th to 10th April 2026.",
    ),
    capturedAt: "2026-04-05T07:00:00.000Z",
  });

  const memories = findRelevantImageMemories(metadata, "Do you remember the image I gave?");
  assert.equal(memories.length, 1);
  assert.match(memories[0].summary, /workshop on 8th to 10th April 2026/i);
});
