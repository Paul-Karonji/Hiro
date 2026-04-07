import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import path from "path";
import type { ToolExecutionContext } from "../core/types";
import { exportFileExecutor, renderWordCompatibleDocument, sendFileToUserExecutor } from "./export_file";

function createToolContext(): ToolExecutionContext {
  return {
    sessionId: "test-session",
    sessionType: "primary",
    session: { id: "test-session" } as any,
    modelUsed: "test-model",
    request: { sessionId: "test-session", userText: "create a file" } as any,
    directives: [],
    trace: [],
  };
}

test("renderWordCompatibleDocument creates RTF-backed DOC content", () => {
  const rendered = renderWordCompatibleDocument(
    "6. Next Steps & Validation\n\n- **Price Testing:** Validate the 2024\u20132026 plan",
    "brief.doc",
  );

  assert.match(rendered, /^\{\\rtf1/);
  assert.match(rendered, /Next Steps & Validation/);
  assert.match(rendered, /\\b Price Testing:/);
  assert.match(rendered, /\\u8211\?/);
});

test("renderWordCompatibleDocument converts markdown tables into RTF table rows", () => {
  const rendered = renderWordCompatibleDocument(
    [
      "4.2 Identified Competitors",
      "",
      "| Platform | Focus | Notes |",
      "|---|---|---|",
      "| RentKasa | Full-stack management | Series A funded |",
      "| PesaPal | Routing | Strong Kenya presence |",
    ].join("\n"),
    "competitors.doc",
  );

  assert.match(rendered, /\\trowd/);
  assert.match(rendered, /Platform/);
  assert.match(rendered, /RentKasa/);
  assert.doesNotMatch(rendered, /\| Platform \|/);
  assert.doesNotMatch(rendered, /\|---\|---\|---\|/);
});

test("exportFileExecutor writes a Word-compatible doc file and queues delivery", async () => {
  const context = createToolContext();
  const rawName = `export-file-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const result = await exportFileExecutor({
    fileName: rawName,
    format: "doc",
    content: "Rental systems report\n- Scope\n- Findings",
    sendToUser: true,
  }, context);

  assert.match(result, /queued it for delivery/i);
  assert.equal(context.directives.length, 1);
  assert.equal(context.directives[0]?.type, "file");
  assert.match(context.directives[0]?.filename ?? "", /\.doc$/i);

  const filePath = (context.directives[0] as any).filePath;
  const stored = await fs.readFile(filePath, "utf-8");
  assert.match(stored, /^\{\\rtf1/);

  await fs.unlink(filePath);
});

test("exportFileExecutor auto-queues delivery for primary chat when sendToUser is omitted", async () => {
  const context = createToolContext();
  const fileName = `auto-send-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.doc`;

  const result = await exportFileExecutor({
    fileName,
    format: "doc",
    content: "Detailed export body",
  }, context);

  assert.match(result, /queued it for delivery/i);
  assert.equal(context.directives.length, 1);
  assert.equal(context.directives[0]?.type, "file");

  const filePath = (context.directives[0] as any).filePath;
  await fs.unlink(filePath);
});

test("exportFileExecutor respects explicit sendToUser false", async () => {
  const context = createToolContext();
  const fileName = `local-only-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.doc`;

  const result = await exportFileExecutor({
    fileName,
    format: "doc",
    content: "Local export body",
    sendToUser: false,
  }, context);

  assert.match(result, /Created data\//i);
  assert.doesNotMatch(result, /queued it for delivery/i);
  assert.equal(context.directives.length, 0);

  const filePath = path.join(process.cwd(), "data", fileName);
  await fs.unlink(filePath);
});

test("sendFileToUserExecutor queues an existing generated file", async () => {
  const fileName = `queued-file-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.txt`;
  const filePath = path.join(process.cwd(), "data", fileName);
  await fs.writeFile(filePath, "hello", "utf-8");

  const context = createToolContext();
  const result = await sendFileToUserExecutor({ filePath: fileName, caption: "Here it is" }, context);

  assert.match(result, /Queued/i);
  assert.equal(context.directives.length, 1);
  assert.equal(context.directives[0]?.type, "file");
  assert.equal(context.directives[0]?.filename, fileName);
  assert.equal(context.directives[0]?.caption, "Here it is");

  await fs.unlink(filePath);
});
