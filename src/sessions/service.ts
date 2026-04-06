import type { AgentRuntime } from "../agent/runtime";
import type { ActiveModelState } from "../core/modelState";
import type { RuntimeConfig } from "../core/types";
import type { SessionSendResult, SwarmRole } from "../core/types";
import { DefaultMemoryService } from "../memory/service";
import { PRIMARY_SESSION_ID, type SessionRecord, type SessionType } from "../memory/sqlite";
import { buildRoutedPrimarySessionKey, buildRoutedPrimarySessionTitle, buildRoutingMetadata } from "./key";
import {
  buildActiveSessionMetadata,
  hasConversationMetadata,
  readSessionResetMetadata,
  readSessionRoutingMetadata,
  shouldResetSession,
} from "./resetPolicy";
import type { RoutedSessionInput, SessionResetReason } from "./types";

function createSessionId(prefix: string) {
  return `${prefix}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
}

function createArchiveSessionTitle() {
  const iso = new Date().toISOString().replace("T", " ").slice(0, 16);
  return `Archived Primary Conversation (${iso} UTC)`;
}

function createSessionArchiveTitle(session: SessionRecord) {
  const iso = new Date().toISOString().replace("T", " ").slice(0, 16);
  return `Archived ${session.title} (${iso} UTC)`;
}

type SessionCreateInput = {
  id: string;
  title: string;
  type: SessionType;
  role?: string | null;
  status?: string;
  parentSessionId?: string | null;
  modelOverride?: string | null;
  lastModelUsed?: string | null;
  instructions?: string | null;
  allowedTools?: string[] | null;
  metadata?: Record<string, unknown> | null;
};

export class SessionService {
  private runtime: AgentRuntime | null = null;

  constructor(
    private readonly memory: DefaultMemoryService,
    private readonly modelState: ActiveModelState,
    private readonly runtimeConfig: RuntimeConfig,
  ) {
    this.ensurePrimarySession();
  }

  attachRuntime(runtime: AgentRuntime) {
    this.runtime = runtime;
  }

  ensurePrimarySession() {
    return this.ensureSession({
      id: PRIMARY_SESSION_ID,
      title: "Primary Conversation",
      type: "primary",
      status: "active",
    });
  }

  ensureSession(input: SessionCreateInput): SessionRecord {
    const existing = this.memory.getSession(input.id);
    if (existing) {
      return existing;
    }

    return this.memory.createSession(input);
  }

  createSession(input: Omit<SessionCreateInput, "id"> & { id?: string }): SessionRecord {
    return this.memory.createSession({
      ...input,
      id: input.id ?? createSessionId(input.type),
    });
  }

  ensureSystemSession(
    id: string,
    title: string,
    metadata?: Record<string, unknown> | null,
    options?: {
      instructions?: string | null;
      allowedTools?: string[] | null;
    },
  ) {
    const existing = this.memory.getSession(id);
    if (existing) {
      return this.memory.updateSession(id, {
        title,
        status: "active",
        metadata: metadata ?? existing.metadata,
        instructions: options && "instructions" in options ? options.instructions ?? null : existing.instructions,
        allowedTools: options && "allowedTools" in options ? options.allowedTools ?? null : existing.allowed_tools,
      }) ?? existing;
    }

    return this.ensureSession({
      id,
      title,
      type: "system",
      status: "active",
      instructions: options?.instructions ?? null,
      allowedTools: options?.allowedTools ?? null,
      metadata: metadata ?? null,
    });
  }

  createSwarmSession(input: {
    role: SwarmRole;
    title: string;
    instructions: string;
    parentSessionId: string;
    allowedTools: string[];
    modelOverride?: string | null;
    metadata?: Record<string, unknown> | null;
  }) {
    return this.createSession({
      title: input.title,
      type: "swarm",
      role: input.role,
      parentSessionId: input.parentSessionId,
      modelOverride: input.modelOverride ?? null,
      instructions: input.instructions,
      allowedTools: input.allowedTools,
      metadata: input.metadata ?? null,
      status: "active",
    });
  }

  getSession(id: string) {
    return this.memory.getSession(id);
  }

  listSessions() {
    return this.memory.listSessions();
  }

  getHistory(sessionId: string, limit = 20) {
    return this.memory.getSessionHistory(sessionId, limit);
  }

  resolveUserSession(input: RoutedSessionInput): SessionRecord {
    if (!this.runtimeConfig.sessions.routingEnabled) {
      return this.ensurePrimarySession();
    }

    const sessionId = buildRoutedPrimarySessionKey(input);
    const routing = buildRoutingMetadata(input);
    let session = this.ensureSession({
      id: sessionId,
      title: buildRoutedPrimarySessionTitle(input),
      type: "primary",
      status: "active",
      metadata: buildActiveSessionMetadata(routing),
    });

    const existingRouting = readSessionRoutingMetadata(session.metadata);
    const expectedTitle = buildRoutedPrimarySessionTitle(input);
    if (!existingRouting || session.title !== expectedTitle) {
      const existingReset = readSessionResetMetadata(session.metadata);
      session = this.memory.updateSession(session.id, {
        title: expectedTitle,
        metadata: {
          ...(session.metadata ?? {}),
          ...buildActiveSessionMetadata(routing, existingReset),
        },
      }) ?? session;
    }

    const resetReason = shouldResetSession(session, {
      enabled: this.runtimeConfig.sessions.routingEnabled,
      idleResetHours: this.runtimeConfig.sessions.idleResetHours,
      dailyResetHour: this.runtimeConfig.sessions.dailyResetHour,
      timezone: this.runtimeConfig.sessions.timezone,
    });

    if (resetReason) {
      this.archiveSession(session.id, resetReason);
      session = this.memory.getSession(session.id) ?? session;
    }

    return session;
  }

  archivePrimarySession(reason: SessionResetReason = "manual_reset") {
    return this.archiveSession(PRIMARY_SESSION_ID, reason);
  }

  archiveSession(sessionId: string, reason: SessionResetReason = "manual_reset") {
    const session = sessionId === PRIMARY_SESSION_ID
      ? this.ensurePrimarySession()
      : this.memory.getSession(sessionId);
    if (!session) {
      return null;
    }

    const messageCount = this.memory.getMessageCount(session.id);
    const latestSummary = this.memory.getLatestSummary(session.id);
    const routing = readSessionRoutingMetadata(session.metadata);

    if (messageCount === 0 && !latestSummary && !hasConversationMetadata(session.metadata)) {
      return null;
    }

    const archiveSession = this.createSession({
      title: session.id === PRIMARY_SESSION_ID ? createArchiveSessionTitle() : createSessionArchiveTitle(session),
      type: "system",
      status: "active",
      parentSessionId: session.id,
      lastModelUsed: session.last_model_used,
      metadata: {
        ...(session.metadata ?? {}),
        archivedFromSessionId: session.id,
        archivedReason: reason,
        archivedAt: new Date().toISOString(),
      },
    });

    this.memory.moveSessionData(session.id, archiveSession.id);
    this.memory.updateSession(session.id, {
      metadata: routing
        ? buildActiveSessionMetadata(routing, {
            lastResetAt: new Date().toISOString(),
            lastResetReason: reason,
            lastArchiveSessionId: archiveSession.id,
          })
        : null,
    });
    this.memory.touchSession(session.id, session.last_model_used);

    return archiveSession;
  }

  getModelForSession(session: SessionRecord, override?: string | null) {
    return override || session.model_override || this.modelState.getCurrentModel();
  }

  async sendToSession(sessionId: string, message: string): Promise<SessionSendResult> {
    if (!this.runtime) {
      throw new Error("Session runtime has not been attached.");
    }

    const session = this.memory.getSession(sessionId);
    if (!session) {
      throw new Error(`Unknown session "${sessionId}".`);
    }

    const result = await this.runtime.runTurn({
      sessionId,
      userText: message,
      allowBackgroundTasks: session.type === "primary",
      enableSpeech: false,
      metadata: { source: "sessions_send" },
    });

    return { session, result };
  }
}
