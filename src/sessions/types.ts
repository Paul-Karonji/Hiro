export type RoutedSessionPlatform = "telegram" | "whatsapp";

export type SessionResetReason = "manual_reset" | "idle_reset" | "daily_reset";

export interface RoutedSessionInput {
  platform: RoutedSessionPlatform;
  userId: string;
  chatId: string;
  threadId?: string | null;
}

export interface SessionRoutingMetadata {
  version: 1;
  kind: "routed_primary";
  platform: RoutedSessionPlatform;
  userId: string;
  chatId: string;
  threadId: string | null;
  sessionKey: string;
}

export interface SessionResetMetadata {
  lastResetAt: string;
  lastResetReason: SessionResetReason;
  lastArchiveSessionId?: string;
}

export interface SessionRoutingConfig {
  enabled: boolean;
  idleResetHours: number;
  dailyResetHour: number | null;
  timezone: string;
}
