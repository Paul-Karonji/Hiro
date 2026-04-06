import test from "node:test";
import assert from "node:assert/strict";
import {
  appendDocumentPrompt,
  buildDocumentAttachmentMarker,
  formatRecentDocumentsForSystemPrompt,
} from "./documentMemory";

test("appendDocumentPrompt injects stored document context", () => {
  const prompt = appendDocumentPrompt("Summarize the upload.", [
    {
      id: 12,
      filename: "brief.pdf",
      mediaType: "application/pdf",
      content: "Roadmap overview and hiring plan.",
    },
  ]);

  assert.match(prompt, /ATTACHED DOCUMENTS:/);
  assert.match(prompt, /brief\.pdf/);
  assert.match(prompt, /Stored document id: 12/);
});

test("buildDocumentAttachmentMarker preserves user text", () => {
  const marker = buildDocumentAttachmentMarker("Analyze it", [
    {
      id: 7,
      filename: "notes.txt",
      mediaType: "text/plain",
      content: "Meeting notes",
    },
  ]);

  assert.equal(marker, "[Documents attached: notes.txt] Analyze it");
});

test("formatRecentDocumentsForSystemPrompt renders excerpts", () => {
  const rendered = formatRecentDocumentsForSystemPrompt([
    {
      id: 5,
      session_id: "primary",
      filename: "contract.pdf",
      media_type: "application/pdf",
      content: "Payment terms are net 30 days from invoice date.",
      metadata: null,
      created_at: "2026-04-07T09:00:00.000Z",
    },
  ]);

  assert.match(rendered ?? "", /contract\.pdf/);
  assert.match(rendered ?? "", /net 30 days/i);
});
