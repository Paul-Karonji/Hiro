import test from "node:test";
import assert from "node:assert/strict";
import { shouldResetSession, readSessionRoutingMetadata, buildActiveSessionMetadata } from "./resetPolicy";

test("readSessionRoutingMetadata returns null for unrelated metadata", () => {
  assert.equal(readSessionRoutingMetadata({ recentImageMemories: [] }), null);
});

test("shouldResetSession triggers idle reset for routed primary sessions", () => {
  const metadata = buildActiveSessionMetadata({
    version: 1,
    kind: "routed_primary",
    platform: "telegram",
    userId: "telegram-user",
    chatId: "telegram-chat",
    threadId: null,
    sessionKey: "primary:telegram:chat:telegram-chat:user:telegram-user",
  });

  const reason = shouldResetSession(
    {
      id: "primary:telegram:chat:telegram-chat:user:telegram-user",
      title: "Telegram Conversation (telegram-chat)",
      type: "primary",
      role: null,
      status: "active",
      parent_session_id: null,
      model_override: null,
      last_model_used: null,
      instructions: null,
      allowed_tools: null,
      metadata,
      created_at: "2026-04-04T00:00:00.000Z",
      updated_at: "2026-04-04T00:00:00.000Z",
    },
    {
      enabled: true,
      idleResetHours: 12,
      dailyResetHour: null,
      timezone: "Africa/Nairobi",
    },
    new Date("2026-04-05T18:30:00.000Z"),
  );

  assert.equal(reason, "idle_reset");
});

test("shouldResetSession ignores non-routed primary sessions", () => {
  const reason = shouldResetSession(
    {
      id: "primary",
      title: "Primary Conversation",
      type: "primary",
      role: null,
      status: "active",
      parent_session_id: null,
      model_override: null,
      last_model_used: null,
      instructions: null,
      allowed_tools: null,
      metadata: null,
      created_at: "2026-04-05T00:00:00.000Z",
      updated_at: "2026-04-05T00:00:00.000Z",
    },
    {
      enabled: true,
      idleResetHours: 12,
      dailyResetHour: null,
      timezone: "Africa/Nairobi",
    },
    new Date("2026-04-05T18:30:00.000Z"),
  );

  assert.equal(reason, null);
});
