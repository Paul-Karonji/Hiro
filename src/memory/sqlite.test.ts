import test from "node:test";
import assert from "node:assert/strict";
import { dbQueries } from "./sqlite";

test("addScheduledTask stores deliver_to and getScheduledTasks returns it", () => {
  const id = dbQueries.addScheduledTask("0 8 * * *", "Send morning report", "telegram");
  const tasks = dbQueries.getScheduledTasks();
  const found = tasks.find((t) => t.id === Number(id));
  assert.ok(found, "Task should exist after insertion");
  assert.equal(found!.cron_expression, "0 8 * * *");
  assert.equal(found!.prompt, "Send morning report");
  assert.equal(found!.deliver_to, "telegram");
  dbQueries.deleteScheduledTask(Number(id));
});

test("addScheduledTask defaults deliver_to to auto when not specified", () => {
  const id = dbQueries.addScheduledTask("0 9 * * *", "Daily check");
  const tasks = dbQueries.getScheduledTasks();
  const found = tasks.find((t) => t.id === Number(id));
  assert.ok(found);
  assert.equal(found!.deliver_to, "auto");
  dbQueries.deleteScheduledTask(Number(id));
});

function uniqueId(prefix: string) {
  return `${prefix}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
}

test("moveSessionData moves stored documents with the session", () => {
  const sourceSessionId = uniqueId("test-source");
  const targetSessionId = uniqueId("test-target");

  dbQueries.createSession({
    id: sourceSessionId,
    title: "Source",
    type: "primary",
  });
  dbQueries.createSession({
    id: targetSessionId,
    title: "Target",
    type: "system",
  });

  const document = dbQueries.addDocument({
    sessionId: sourceSessionId,
    filename: "notes.txt",
    mediaType: "text/plain",
    content: "Document content for archival regression coverage.",
  });

  const beforeMove = dbQueries.searchDocuments("archival regression", 5, sourceSessionId);
  assert.equal(beforeMove.some((result) => result.document_id === document.id), true);

  const moveResult = dbQueries.moveSessionData(sourceSessionId, targetSessionId) as { movedDocuments?: number };
  assert.equal(moveResult.movedDocuments, 1);

  const sourceMatches = dbQueries.searchDocuments("archival regression", 5, sourceSessionId);
  const targetMatches = dbQueries.searchDocuments("archival regression", 5, targetSessionId);

  assert.equal(sourceMatches.some((result) => result.document_id === document.id), false);
  assert.equal(targetMatches.some((result) => result.document_id === document.id), true);
});
