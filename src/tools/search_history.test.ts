import test from "node:test";
import assert from "node:assert/strict";
import { formatHistorySearchResults, searchHistoryDeclaration } from "./search_history";

test("searchHistoryDeclaration explains exact transcript recall", () => {
  assert.match(searchHistoryDeclaration.description, /raw stored conversation transcript/i);
  assert.equal(searchHistoryDeclaration.name, "search_history");
});

test("formatHistorySearchResults renders session metadata and surrounding context", () => {
  const rendered = formatHistorySearchResults([
    {
      message_id: 42,
      session_id: "system:archive:123",
      session_title: "Archived Primary Conversation",
      session_type: "system",
      role: "user",
      content: "We fixed the deployment by setting PUBLIC_BASE_URL.",
      snippet: "We fixed the deployment by setting >>>PUBLIC_BASE_URL<<<.",
      timestamp: "2026-04-05 12:00:00",
      before: { role: "model", content: "The Fly app was serving localhost links." },
      after: { role: "model", content: "I can deploy that change now." },
    },
  ]);

  assert.match(rendered, /Archived Primary Conversation/);
  assert.match(rendered, /system:archive:123/);
  assert.match(rendered, /Match: USER: We fixed the deployment by setting >>>PUBLIC_BASE_URL<<</);
  assert.match(rendered, /Before: MODEL: The Fly app was serving localhost links\./);
  assert.match(rendered, /After: MODEL: I can deploy that change now\./);
});
