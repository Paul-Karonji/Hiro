import test from "node:test";
import assert from "node:assert/strict";
import { buildDocumentExcerpt, extractDocumentText } from "./extract";

test("extractDocumentText reads utf-8 text attachments", async () => {
  const extracted = await extractDocumentText({
    data: Buffer.from("Quarterly plan\nRevenue target: 42", "utf-8"),
    filename: "plan.txt",
    mediaType: "text/plain",
  });

  assert.equal(extracted.kind, "text");
  assert.equal(extracted.text, "Quarterly plan\nRevenue target: 42");
});

test("extractDocumentText rejects unsupported binary attachments", async () => {
  await assert.rejects(
    extractDocumentText({
      data: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
      filename: "image.png",
      mediaType: "image/png",
    }),
    /Unsupported document type/i,
  );
});

test("buildDocumentExcerpt truncates long text", () => {
  assert.equal(buildDocumentExcerpt("abcdef", 4), "abcd...");
});
