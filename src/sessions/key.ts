import type { RoutedSessionInput, SessionRoutingMetadata } from "./types";

function sanitizeSegment(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9@._:-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function buildRoutedPrimarySessionKey(input: RoutedSessionInput) {
  const parts = [
    "primary",
    input.platform,
    `chat:${sanitizeSegment(input.chatId)}`,
  ];

  const sanitizedUserId = sanitizeSegment(input.userId);
  if (sanitizedUserId && sanitizedUserId !== sanitizeSegment(input.chatId)) {
    parts.push(`user:${sanitizedUserId}`);
  }

  const sanitizedThreadId = input.threadId ? sanitizeSegment(input.threadId) : "";
  if (sanitizedThreadId) {
    parts.push(`thread:${sanitizedThreadId}`);
  }

  return parts.join(":");
}

export function buildRoutedPrimarySessionTitle(input: RoutedSessionInput) {
  const platformLabel = input.platform === "telegram" ? "Telegram" : "WhatsApp";
  const suffix = input.threadId ? ` / Thread ${input.threadId}` : "";
  return `${platformLabel} Conversation (${input.chatId})${suffix}`;
}

export function buildRoutingMetadata(input: RoutedSessionInput): SessionRoutingMetadata {
  return {
    version: 1,
    kind: "routed_primary",
    platform: input.platform,
    userId: input.userId,
    chatId: input.chatId,
    threadId: input.threadId ?? null,
    sessionKey: buildRoutedPrimarySessionKey(input),
  };
}
