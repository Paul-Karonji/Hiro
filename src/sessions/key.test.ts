import test from "node:test";
import assert from "node:assert/strict";
import {
  buildRoutingMetadata,
  buildRoutedPrimarySessionKey,
  buildRoutedPrimarySessionTitle,
} from "./key";

test("buildRoutedPrimarySessionKey includes platform chat and thread segments deterministically", () => {
  const key = buildRoutedPrimarySessionKey({
    platform: "telegram",
    userId: "telegram-user",
    chatId: "telegram-chat",
    threadId: "thread-topic",
  });

  assert.equal(key, "primary:telegram:chat:telegram-chat:user:telegram-user:thread:thread-topic");
});

test("buildRoutedPrimarySessionTitle produces readable channel titles", () => {
  const title = buildRoutedPrimarySessionTitle({
    platform: "whatsapp",
    userId: "owner@s.whatsapp.net",
    chatId: "owner@s.whatsapp.net",
    threadId: null,
  });

  assert.equal(title, "WhatsApp Conversation (owner@s.whatsapp.net)");
});

test("buildRoutingMetadata stores routed primary metadata", () => {
  const metadata = buildRoutingMetadata({
    platform: "telegram",
    userId: "telegram-user",
    chatId: "telegram-chat",
    threadId: null,
  });

  assert.equal(metadata.kind, "routed_primary");
  assert.equal(metadata.version, 1);
  assert.equal(metadata.sessionKey, "primary:telegram:chat:telegram-chat:user:telegram-user");
});
