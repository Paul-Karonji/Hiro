import type { SessionRecord } from "../memory/sqlite";
import type {
  SessionResetMetadata,
  SessionResetReason,
  SessionRoutingConfig,
  SessionRoutingMetadata,
} from "./types";

function safeDate(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getZonedDateParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? "0");

  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

function getOffsetMinutes(date: Date, timeZone: string) {
  const parts = getZonedDateParts(date, timeZone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return Math.round((asUtc - date.getTime()) / 60000);
}

function zonedBoundaryToUtc(year: number, month: number, day: number, hour: number, timeZone: string) {
  const guess = new Date(Date.UTC(year, month - 1, day, hour, 0, 0));
  const offsetMinutes = getOffsetMinutes(guess, timeZone);
  return new Date(guess.getTime() - offsetMinutes * 60000);
}

function getMostRecentDailyBoundary(now: Date, hour: number, timeZone: string) {
  const today = getZonedDateParts(now, timeZone);
  let boundary = zonedBoundaryToUtc(today.year, today.month, today.day, hour, timeZone);
  if (boundary.getTime() > now.getTime()) {
    const yesterdayProbe = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const yesterday = getZonedDateParts(yesterdayProbe, timeZone);
    boundary = zonedBoundaryToUtc(yesterday.year, yesterday.month, yesterday.day, hour, timeZone);
  }

  return boundary;
}

export function readSessionRoutingMetadata(metadata: Record<string, unknown> | null | undefined): SessionRoutingMetadata | null {
  const value = metadata?.sessionRouting;
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  if (candidate.kind !== "routed_primary" || candidate.version !== 1) {
    return null;
  }

  if (
    typeof candidate.platform !== "string"
    || typeof candidate.userId !== "string"
    || typeof candidate.chatId !== "string"
    || typeof candidate.sessionKey !== "string"
  ) {
    return null;
  }

  return {
    version: 1,
    kind: "routed_primary",
    platform: candidate.platform as SessionRoutingMetadata["platform"],
    userId: candidate.userId,
    chatId: candidate.chatId,
    threadId: typeof candidate.threadId === "string" ? candidate.threadId : null,
    sessionKey: candidate.sessionKey,
  };
}

export function readSessionResetMetadata(metadata: Record<string, unknown> | null | undefined): SessionResetMetadata | null {
  const value = metadata?.sessionReset;
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.lastResetAt !== "string"
    || typeof candidate.lastResetReason !== "string"
  ) {
    return null;
  }

  return {
    lastResetAt: candidate.lastResetAt,
    lastResetReason: candidate.lastResetReason as SessionResetReason,
    lastArchiveSessionId: typeof candidate.lastArchiveSessionId === "string"
      ? candidate.lastArchiveSessionId
      : undefined,
  };
}

export function buildActiveSessionMetadata(
  routing: SessionRoutingMetadata,
  reset?: SessionResetMetadata | null,
): Record<string, unknown> {
  return {
    sessionRouting: routing,
    ...(reset ? { sessionReset: reset } : {}),
  };
}

export function hasConversationMetadata(metadata: Record<string, unknown> | null | undefined) {
  if (!metadata) {
    return false;
  }

  return Object.keys(metadata).some((key) => key !== "sessionRouting" && key !== "sessionReset");
}

export function shouldResetSession(
  session: SessionRecord,
  config: SessionRoutingConfig,
  now = new Date(),
): SessionResetReason | null {
  if (!config.enabled || session.type !== "primary") {
    return null;
  }

  const routing = readSessionRoutingMetadata(session.metadata);
  if (!routing) {
    return null;
  }

  const updatedAt = safeDate(session.updated_at) ?? safeDate(session.created_at);
  if (!updatedAt) {
    return null;
  }

  if (config.idleResetHours > 0) {
    const idleMs = config.idleResetHours * 60 * 60 * 1000;
    if (now.getTime() - updatedAt.getTime() >= idleMs) {
      return "idle_reset";
    }
  }

  if (typeof config.dailyResetHour === "number" && config.dailyResetHour >= 0 && config.dailyResetHour <= 23) {
    const boundary = getMostRecentDailyBoundary(now, config.dailyResetHour, config.timezone);
    if (updatedAt.getTime() < boundary.getTime()) {
      return "daily_reset";
    }
  }

  return null;
}
