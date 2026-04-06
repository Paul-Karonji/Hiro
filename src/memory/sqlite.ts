import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "fs";
import { resolve } from "path";

const dataDir = resolve(process.cwd(), "data");
if (!existsSync(dataDir)) {
  mkdirSync(dataDir);
}

const dbPath = resolve(dataDir, "hiro.db");
const db = new Database(dbPath, { timeout: 5000 });

db.pragma("journal_mode = WAL");
db.pragma("busy_timeout = 5000");

export const PRIMARY_SESSION_ID = "primary";

export type SessionType = "primary" | "system" | "swarm";

export interface SessionRecord {
  id: string;
  title: string;
  type: SessionType;
  role: string | null;
  status: string;
  parent_session_id: string | null;
  model_override: string | null;
  last_model_used: string | null;
  instructions: string | null;
  allowed_tools: string[] | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface MessageRecord {
  id: number;
  session_id: string;
  role: "user" | "model";
  content: string;
  model_used: string | null;
  metadata: Record<string, unknown> | null;
  timestamp: string;
}

export interface MessageContextRecord {
  role: "user" | "model";
  content: string;
}

export interface TranscriptSearchResult {
  message_id: number;
  session_id: string;
  session_title: string;
  session_type: SessionType;
  role: "user" | "model";
  content: string;
  snippet: string;
  timestamp: string;
  before: MessageContextRecord | null;
  after: MessageContextRecord | null;
}

export interface WorkflowRunRecord {
  id: string;
  goal: string;
  status: string;
  model_used: string;
  session_id: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface WorkflowStepRecord {
  id: string;
  workflow_id: string;
  step_order: number;
  title: string;
  owner_role: string;
  depends_on: string[];
  success_criteria: string;
  expected_artifact: string | null;
  status: string;
  output_session_id: string | null;
  result_summary: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

type SessionInput = {
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

function getTableColumns(tableName: string): string[] {
  const rows = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
  return rows.map((row) => row.name);
}

function ensureColumn(tableName: string, columnName: string, definition: string) {
  const columns = getTableColumns(tableName);
  if (!columns.includes(columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

function safeJsonParse<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || value.trim().length === 0) {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function mapSession(row: Record<string, unknown> | undefined): SessionRecord | null {
  if (!row) {
    return null;
  }

  return {
    id: String(row.id),
    title: String(row.title ?? "Untitled Session"),
    type: (row.type as SessionType) ?? "primary",
    role: row.role ? String(row.role) : null,
    status: String(row.status ?? "active"),
    parent_session_id: row.parent_session_id ? String(row.parent_session_id) : null,
    model_override: row.model_override ? String(row.model_override) : null,
    last_model_used: row.last_model_used ? String(row.last_model_used) : null,
    instructions: row.instructions ? String(row.instructions) : null,
    allowed_tools: safeJsonParse<string[] | null>(row.allowed_tools, null),
    metadata: safeJsonParse<Record<string, unknown> | null>(row.metadata, null),
    created_at: String(row.created_at ?? new Date().toISOString()),
    updated_at: String(row.updated_at ?? new Date().toISOString()),
  };
}

function mapMessage(row: Record<string, unknown>): MessageRecord {
  return {
    id: Number(row.id),
    session_id: String(row.session_id ?? PRIMARY_SESSION_ID),
    role: (row.role as "user" | "model") ?? "user",
    content: String(row.content ?? ""),
    model_used: row.model_used ? String(row.model_used) : null,
    metadata: safeJsonParse<Record<string, unknown> | null>(row.metadata, null),
    timestamp: String(row.timestamp ?? new Date().toISOString()),
  };
}

function mapMessageContext(row: Record<string, unknown> | undefined): MessageContextRecord | null {
  if (!row) {
    return null;
  }

  return {
    role: (row.role as "user" | "model") ?? "user",
    content: String(row.content ?? ""),
  };
}

function mapWorkflowRun(row: Record<string, unknown>): WorkflowRunRecord {
  return {
    id: String(row.id),
    goal: String(row.goal),
    status: String(row.status),
    model_used: String(row.model_used),
    session_id: String(row.session_id),
    metadata: safeJsonParse<Record<string, unknown> | null>(row.metadata, null),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function mapWorkflowStep(row: Record<string, unknown>): WorkflowStepRecord {
  return {
    id: String(row.id),
    workflow_id: String(row.workflow_id),
    step_order: Number(row.step_order),
    title: String(row.title),
    owner_role: String(row.owner_role),
    depends_on: safeJsonParse<string[]>(row.depends_on, []),
    success_criteria: String(row.success_criteria),
    expected_artifact: row.expected_artifact ? String(row.expected_artifact) : null,
    status: String(row.status),
    output_session_id: row.output_session_id ? String(row.output_session_id) : null,
    result_summary: row.result_summary ? String(row.result_summary) : null,
    metadata: safeJsonParse<Record<string, unknown> | null>(row.metadata, null),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function resolveSessionArgs(arg1?: string | number, arg2?: number) {
  if (typeof arg1 === "number") {
    return { sessionId: PRIMARY_SESSION_ID, limit: arg1 };
  }

  return {
    sessionId: typeof arg1 === "string" ? arg1 : PRIMARY_SESSION_ID,
    limit: arg2 ?? 20,
  };
}

function hasOwn(input: object, key: string) {
  return Object.prototype.hasOwnProperty.call(input, key);
}

function buildHistorySearchQuery(query: string) {
  const trimmed = query.trim();
  if (!trimmed) {
    return "";
  }

  if (/[":*]/.test(trimmed) || /\b(?:AND|OR|NOT)\b/i.test(trimmed)) {
    return trimmed.replace(/[{}()^]/g, " ").trim();
  }

  const terms = Array.from(
    new Set(
      trimmed
        .match(/[A-Za-z0-9._-]+/g)
        ?.map((term) => term.trim())
        .filter((term) => term.length > 1) ?? [],
    ),
  );

  if (terms.length === 0) {
    return `"${trimmed.replace(/"/g, '""')}"`;
  }

  return terms
    .map((term) => (/[._-]/.test(term) ? `"${term}"` : term))
    .join(" OR ");
}

function buildFallbackSnippet(content: string, query: string) {
  const normalizedContent = content.replace(/\s+/g, " ").trim();
  if (!normalizedContent) {
    return "";
  }

  const normalizedQuery = query.replace(/\s+/g, " ").trim();
  if (!normalizedQuery) {
    return normalizedContent.slice(0, 180);
  }

  const lowerContent = normalizedContent.toLowerCase();
  const lowerQuery = normalizedQuery.toLowerCase();
  const matchIndex = lowerContent.indexOf(lowerQuery);
  if (matchIndex === -1) {
    return normalizedContent.slice(0, 180);
  }

  const start = Math.max(0, matchIndex - 60);
  const end = Math.min(normalizedContent.length, matchIndex + normalizedQuery.length + 60);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < normalizedContent.length ? "..." : "";
  return `${prefix}${normalizedContent.slice(start, end)}${suffix}`;
}

export function initSQLite() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS core_memory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fact TEXT NOT NULL UNIQUE,
      access_count INTEGER NOT NULL DEFAULT 0,
      importance_score REAL NOT NULL DEFAULT 1.0,
      last_accessed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('primary', 'system', 'swarm')),
      role TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      parent_session_id TEXT,
      model_override TEXT,
      last_model_used TEXT,
      instructions TEXT,
      allowed_tools TEXT,
      metadata TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL DEFAULT '${PRIMARY_SESSION_ID}',
      role TEXT NOT NULL CHECK(role IN ('user', 'model')),
      content TEXT NOT NULL,
      model_used TEXT,
      metadata TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS summaries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL DEFAULT '${PRIMARY_SESSION_ID}',
      summary TEXT NOT NULL,
      covered_messages_count INTEGER NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS scheduled_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cron_expression TEXT NOT NULL,
      prompt TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS workflow_runs (
      id TEXT PRIMARY KEY,
      goal TEXT NOT NULL,
      status TEXT NOT NULL,
      model_used TEXT NOT NULL,
      session_id TEXT NOT NULL,
      metadata TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS workflow_steps (
      id TEXT PRIMARY KEY,
      workflow_id TEXT NOT NULL,
      step_order INTEGER NOT NULL,
      title TEXT NOT NULL,
      owner_role TEXT NOT NULL,
      depends_on TEXT NOT NULL DEFAULT '[]',
      success_criteria TEXT NOT NULL,
      expected_artifact TEXT,
      status TEXT NOT NULL,
      output_session_id TEXT,
      result_summary TEXT,
      metadata TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS usage_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      model TEXT NOT NULL,
      session_id TEXT NOT NULL,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      estimated_cost_usd REAL NOT NULL DEFAULT 0,
      latency_ms INTEGER NOT NULL DEFAULT 0,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS speech_usage_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL,
      voice TEXT,
      characters INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'success',
      notes TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS missions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      context_summary TEXT NOT NULL DEFAULT '',
      target_deadline TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS mission_tasks (
      id TEXT PRIMARY KEY,
      mission_id TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'todo',
      priority INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(mission_id) REFERENCES missions(id) ON DELETE CASCADE
    );
  `);

  ensureColumn("messages", "session_id", `TEXT NOT NULL DEFAULT '${PRIMARY_SESSION_ID}'`);
  ensureColumn("messages", "model_used", "TEXT");
  ensureColumn("messages", "metadata", "TEXT");
  ensureColumn("summaries", "session_id", `TEXT NOT NULL DEFAULT '${PRIMARY_SESSION_ID}'`);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id, id);
    CREATE INDEX IF NOT EXISTS idx_summaries_session_id ON summaries(session_id, id);
  `);

  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
      content,
      content=messages,
      content_rowid=id
    );

    CREATE TRIGGER IF NOT EXISTS messages_fts_insert AFTER INSERT ON messages BEGIN
      INSERT INTO messages_fts(rowid, content) VALUES (new.id, new.content);
    END;

    CREATE TRIGGER IF NOT EXISTS messages_fts_delete AFTER DELETE ON messages BEGIN
      INSERT INTO messages_fts(messages_fts, rowid, content) VALUES('delete', old.id, old.content);
    END;

    CREATE TRIGGER IF NOT EXISTS messages_fts_update AFTER UPDATE ON messages BEGIN
      INSERT INTO messages_fts(messages_fts, rowid, content) VALUES('delete', old.id, old.content);
      INSERT INTO messages_fts(rowid, content) VALUES(new.id, new.content);
    END;
  `);
  db.prepare(`INSERT INTO messages_fts(messages_fts) VALUES('rebuild')`).run();

  db.prepare(`
    INSERT OR IGNORE INTO sessions (
      id, title, type, status, created_at, updated_at
    ) VALUES (?, ?, 'primary', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(PRIMARY_SESSION_ID, "Primary Conversation");

  db.prepare(`
    UPDATE workflow_runs
    SET status = 'interrupted', updated_at = CURRENT_TIMESTAMP
    WHERE status = 'in_progress'
  `).run();
}

initSQLite();

export const dbQueries = {
  createSession: (input: SessionInput): SessionRecord => {
    db.prepare(`
      INSERT OR IGNORE INTO sessions (
        id, title, type, role, status, parent_session_id, model_override,
        last_model_used, instructions, allowed_tools, metadata, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(
      input.id,
      input.title,
      input.type,
      input.role ?? null,
      input.status ?? "active",
      input.parentSessionId ?? null,
      input.modelOverride ?? null,
      input.lastModelUsed ?? null,
      input.instructions ?? null,
      input.allowedTools ? JSON.stringify(input.allowedTools) : null,
      input.metadata ? JSON.stringify(input.metadata) : null,
    );

    return dbQueries.getSession(input.id)!;
  },

  getSession: (id: string): SessionRecord | null => {
    const row = db.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    return mapSession(row);
  },

  listSessions: (): SessionRecord[] => {
    const rows = db.prepare("SELECT * FROM sessions ORDER BY datetime(updated_at) DESC, id DESC").all() as Record<string, unknown>[];
    return rows.map((row) => mapSession(row)!).filter(Boolean);
  },

  updateSession: (id: string, updates: Partial<SessionInput>) => {
    const current = dbQueries.getSession(id);
    if (!current) {
      return null;
    }

    const nextTitle = hasOwn(updates, "title") ? updates.title ?? current.title : current.title;
    const nextType = hasOwn(updates, "type") ? updates.type ?? current.type : current.type;
    const nextRole = hasOwn(updates, "role") ? updates.role ?? null : current.role;
    const nextStatus = hasOwn(updates, "status") ? updates.status ?? current.status : current.status;
    const nextParentSessionId = hasOwn(updates, "parentSessionId") ? updates.parentSessionId ?? null : current.parent_session_id;
    const nextModelOverride = hasOwn(updates, "modelOverride") ? updates.modelOverride ?? null : current.model_override;
    const nextLastModelUsed = hasOwn(updates, "lastModelUsed") ? updates.lastModelUsed ?? null : current.last_model_used;
    const nextInstructions = hasOwn(updates, "instructions") ? updates.instructions ?? null : current.instructions;
    const nextAllowedTools = hasOwn(updates, "allowedTools") ? updates.allowedTools ?? null : current.allowed_tools;
    const nextMetadata = hasOwn(updates, "metadata") ? updates.metadata ?? null : current.metadata;

    db.prepare(`
      UPDATE sessions
      SET title = ?,
          type = ?,
          role = ?,
          status = ?,
          parent_session_id = ?,
          model_override = ?,
          last_model_used = ?,
          instructions = ?,
          allowed_tools = ?,
          metadata = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      nextTitle,
      nextType,
      nextRole,
      nextStatus,
      nextParentSessionId,
      nextModelOverride,
      nextLastModelUsed,
      nextInstructions,
      nextAllowedTools ? JSON.stringify(nextAllowedTools) : null,
      nextMetadata ? JSON.stringify(nextMetadata) : null,
      id,
    );

    return dbQueries.getSession(id);
  },

  touchSession: (id: string, lastModelUsed?: string | null) => {
    db.prepare(`
      UPDATE sessions
      SET last_model_used = COALESCE(?, last_model_used),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(lastModelUsed ?? null, id);
  },

  addMessage: (
    role: "user" | "model",
    content: string,
    options?: {
      sessionId?: string;
      modelUsed?: string | null;
      metadata?: Record<string, unknown> | null;
    },
  ) => {
    const sessionId = options?.sessionId ?? PRIMARY_SESSION_ID;
    db.prepare(`
      INSERT INTO messages (session_id, role, content, model_used, metadata)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      sessionId,
      role,
      content,
      options?.modelUsed ?? null,
      options?.metadata ? JSON.stringify(options.metadata) : null,
    );

    dbQueries.touchSession(sessionId, options?.modelUsed ?? null);
  },

  getRecentMessages: (arg1?: string | number, arg2?: number): MessageRecord[] => {
    const { sessionId, limit } = resolveSessionArgs(arg1, arg2);
    const rows = db.prepare(`
      SELECT * FROM messages
      WHERE session_id = ?
      ORDER BY id DESC
      LIMIT ?
    `).all(sessionId, limit) as Record<string, unknown>[];
    return rows.reverse().map(mapMessage);
  },

  getSessionHistory: (sessionId: string, limit = 20): MessageRecord[] => {
    return dbQueries.getRecentMessages(sessionId, limit);
  },

  getMessagesBatch: (sessionId: string, offset: number, limit: number): MessageRecord[] => {
    const rows = db.prepare(`
      SELECT * FROM messages
      WHERE session_id = ?
      ORDER BY id ASC
      LIMIT ? OFFSET ?
    `).all(sessionId, limit, offset) as Record<string, unknown>[];
    return rows.map(mapMessage);
  },

  getMessageCount: (sessionId: string = PRIMARY_SESSION_ID): number => {
    const row = db.prepare("SELECT COUNT(*) as count FROM messages WHERE session_id = ?").get(sessionId) as { count: number };
    return row.count;
  },

  getSummarizedMessageCount: (sessionId: string = PRIMARY_SESSION_ID): number => {
    const row = db.prepare(`
      SELECT COALESCE(SUM(covered_messages_count), 0) as count
      FROM summaries
      WHERE session_id = ?
    `).get(sessionId) as { count: number };
    return Number(row.count ?? 0);
  },

  getOldestMessages: (arg1?: string | number, arg2?: number): MessageRecord[] => {
    const { sessionId, limit } = resolveSessionArgs(arg1, arg2);
    const rows = db.prepare(`
      SELECT * FROM messages
      WHERE session_id = ?
      ORDER BY id ASC
      LIMIT ?
    `).all(sessionId, limit) as Record<string, unknown>[];
    return rows.map(mapMessage);
  },

  moveSessionData: (sourceSessionId: string, targetSessionId: string) => {
    const transaction = db.transaction((sourceId: string, targetId: string) => {
      const movedMessages = db.prepare(`
        UPDATE messages
        SET session_id = ?
        WHERE session_id = ?
      `).run(targetId, sourceId).changes;

      const movedSummaries = db.prepare(`
        UPDATE summaries
        SET session_id = ?
        WHERE session_id = ?
      `).run(targetId, sourceId).changes;

      const movedUsage = db.prepare(`
        UPDATE usage_log
        SET session_id = ?
        WHERE session_id = ?
      `).run(targetId, sourceId).changes;

      db.prepare(`
        UPDATE sessions
        SET updated_at = CURRENT_TIMESTAMP
        WHERE id IN (?, ?)
      `).run(sourceId, targetId);

      return {
        movedMessages,
        movedSummaries,
        movedUsage,
      };
    });

    return transaction(sourceSessionId, targetSessionId);
  },

  addCoreFact: (fact: string) => {
    // If it exists, we just update its access count and reset decay.
    db.prepare(`
      INSERT INTO core_memory (fact) 
      VALUES (?)
      ON CONFLICT(fact) DO UPDATE SET 
        access_count = access_count + 1,
        last_accessed_at = CURRENT_TIMESTAMP
    `).run(fact);
  },

  getCoreFacts: () => {
    const rows = db.prepare("SELECT id, fact FROM core_memory ORDER BY id ASC").all() as Array<{
      id: number;
      fact: string;
    }>;
    return rows;
  },

  deleteCoreFact: (id: number) => {
    db.prepare("DELETE FROM core_memory WHERE id = ?").run(id);
  },

  updateCoreFact: (id: number, newFact: string) => {
    db.prepare("UPDATE core_memory SET fact = ?, last_accessed_at = CURRENT_TIMESTAMP WHERE id = ?").run(newFact, id);
  },

  addSummary: (summary: string, count: number, sessionId: string = PRIMARY_SESSION_ID) => {
    db.prepare(`
      INSERT INTO summaries (session_id, summary, covered_messages_count)
      VALUES (?, ?, ?)
    `).run(sessionId, summary, count);
  },

  getLatestSummary: (sessionId: string = PRIMARY_SESSION_ID): string | null => {
    const row = db.prepare(`
      SELECT summary FROM summaries
      WHERE session_id = ?
      ORDER BY id DESC
      LIMIT 1
    `).get(sessionId) as { summary: string } | undefined;
    return row?.summary ?? null;
  },

  searchConversationHistory: (query: string, limit = 5): TranscriptSearchResult[] => {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      return [];
    }

    const ftsQuery = buildHistorySearchQuery(trimmedQuery);
    const selectClause = `
      SELECT
        m.id AS message_id,
        m.session_id,
        s.title AS session_title,
        s.type AS session_type,
        m.role,
        m.content,
        m.timestamp,
        snippet(messages_fts, 0, '>>>', '<<<', '...', 18) AS snippet
      FROM messages_fts
      JOIN messages m ON m.id = messages_fts.rowid
      JOIN sessions s ON s.id = m.session_id
    `;

    let rows: Record<string, unknown>[] = [];
    if (ftsQuery) {
      try {
        rows = db.prepare(`
          ${selectClause}
          WHERE messages_fts MATCH ?
          ORDER BY bm25(messages_fts), m.id DESC
          LIMIT ?
        `).all(ftsQuery, limit) as Record<string, unknown>[];
      } catch {
        rows = [];
      }
    }

    if (rows.length === 0) {
      rows = db.prepare(`
        SELECT
          m.id AS message_id,
          m.session_id,
          s.title AS session_title,
          s.type AS session_type,
          m.role,
          m.content,
          m.timestamp,
          '' AS snippet
        FROM messages m
        JOIN sessions s ON s.id = m.session_id
        WHERE m.content LIKE ?
        ORDER BY m.id DESC
        LIMIT ?
      `).all(`%${trimmedQuery}%`, limit) as Record<string, unknown>[];
    }

    return rows.map((row) => {
      const sessionId = String(row.session_id ?? PRIMARY_SESSION_ID);
      const messageId = Number(row.message_id);
      const beforeRow = db.prepare(`
        SELECT role, content
        FROM messages
        WHERE session_id = ? AND id < ?
        ORDER BY id DESC
        LIMIT 1
      `).get(sessionId, messageId) as Record<string, unknown> | undefined;
      const afterRow = db.prepare(`
        SELECT role, content
        FROM messages
        WHERE session_id = ? AND id > ?
        ORDER BY id ASC
        LIMIT 1
      `).get(sessionId, messageId) as Record<string, unknown> | undefined;

      const snippet = String(row.snippet ?? "").trim();
      return {
        message_id: messageId,
        session_id: sessionId,
        session_title: String(row.session_title ?? "Untitled Session"),
        session_type: (row.session_type as SessionType) ?? "primary",
        role: (row.role as "user" | "model") ?? "user",
        content: String(row.content ?? ""),
        snippet: snippet.length > 0 ? snippet : buildFallbackSnippet(String(row.content ?? ""), trimmedQuery),
        timestamp: String(row.timestamp ?? new Date().toISOString()),
        before: mapMessageContext(beforeRow),
        after: mapMessageContext(afterRow),
      };
    });
  },

  addScheduledTask: (cron: string, prompt: string) => {
    const info = db.prepare(`
      INSERT INTO scheduled_tasks (cron_expression, prompt)
      VALUES (?, ?)
    `).run(cron, prompt);
    return info.lastInsertRowid;
  },

  getScheduledTasks: () => {
    return db.prepare("SELECT * FROM scheduled_tasks").all() as Array<{
      id: number;
      cron_expression: string;
      prompt: string;
    }>;
  },

  deleteScheduledTask: (id: number) => {
    db.prepare("DELETE FROM scheduled_tasks WHERE id = ?").run(id);
  },

  createWorkflowRun: (input: {
    id: string;
    goal: string;
    status: string;
    modelUsed: string;
    sessionId: string;
    metadata?: Record<string, unknown> | null;
  }): WorkflowRunRecord => {
    db.prepare(`
      INSERT INTO workflow_runs (id, goal, status, model_used, session_id, metadata, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(
      input.id,
      input.goal,
      input.status,
      input.modelUsed,
      input.sessionId,
      input.metadata ? JSON.stringify(input.metadata) : null,
    );

    return dbQueries.getWorkflowRun(input.id)!;
  },

  getWorkflowRun: (id: string): WorkflowRunRecord | null => {
    const row = db.prepare("SELECT * FROM workflow_runs WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    return row ? mapWorkflowRun(row) : null;
  },

  updateWorkflowRun: (id: string, updates: {
    status?: string;
    metadata?: Record<string, unknown> | null;
  }) => {
    const current = dbQueries.getWorkflowRun(id);
    if (!current) {
      return null;
    }

    db.prepare(`
      UPDATE workflow_runs
      SET status = ?,
          metadata = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      updates.status ?? current.status,
      updates.metadata ? JSON.stringify(updates.metadata) : current.metadata ? JSON.stringify(current.metadata) : null,
      id,
    );

    return dbQueries.getWorkflowRun(id);
  },

  createWorkflowStep: (input: {
    id: string;
    workflowId: string;
    stepOrder: number;
    title: string;
    ownerRole: string;
    dependsOn: string[];
    successCriteria: string;
    expectedArtifact?: string | null;
    status: string;
    outputSessionId?: string | null;
    resultSummary?: string | null;
    metadata?: Record<string, unknown> | null;
  }): WorkflowStepRecord => {
    db.prepare(`
      INSERT INTO workflow_steps (
        id, workflow_id, step_order, title, owner_role, depends_on,
        success_criteria, expected_artifact, status, output_session_id,
        result_summary, metadata, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(
      input.id,
      input.workflowId,
      input.stepOrder,
      input.title,
      input.ownerRole,
      JSON.stringify(input.dependsOn),
      input.successCriteria,
      input.expectedArtifact ?? null,
      input.status,
      input.outputSessionId ?? null,
      input.resultSummary ?? null,
      input.metadata ? JSON.stringify(input.metadata) : null,
    );

    return dbQueries.getWorkflowSteps(input.workflowId).find((step) => step.id === input.id)!;
  },

  getWorkflowSteps: (workflowId: string): WorkflowStepRecord[] => {
    const rows = db.prepare(`
      SELECT * FROM workflow_steps
      WHERE workflow_id = ?
      ORDER BY step_order ASC
    `).all(workflowId) as Record<string, unknown>[];
    return rows.map(mapWorkflowStep);
  },

  updateWorkflowStep: (id: string, updates: {
    status?: string;
    outputSessionId?: string | null;
    resultSummary?: string | null;
    metadata?: Record<string, unknown> | null;
  }) => {
    const row = db.prepare("SELECT * FROM workflow_steps WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    if (!row) {
      return null;
    }

    const current = mapWorkflowStep(row);
    db.prepare(`
      UPDATE workflow_steps
      SET status = ?,
          output_session_id = ?,
          result_summary = ?,
          metadata = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      updates.status ?? current.status,
      updates.outputSessionId ?? current.output_session_id,
      updates.resultSummary ?? current.result_summary,
      updates.metadata ? JSON.stringify(updates.metadata) : current.metadata ? JSON.stringify(current.metadata) : null,
      id,
    );

    const updated = db.prepare("SELECT * FROM workflow_steps WHERE id = ?").get(id) as Record<string, unknown>;
    return mapWorkflowStep(updated);
  },

  addUsageEntry: (input: {
    model: string;
    sessionId: string;
    inputTokens: number;
    outputTokens: number;
    estimatedCostUsd: number;
    latencyMs: number;
  }) => {
    db.prepare(`
      INSERT INTO usage_log (model, session_id, input_tokens, output_tokens, estimated_cost_usd, latency_ms)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      input.model,
      input.sessionId,
      input.inputTokens,
      input.outputTokens,
      input.estimatedCostUsd,
      input.latencyMs,
    );
  },

  getUsageSummary: () => {
    return db.prepare(`
      SELECT
        model,
        COUNT(*) as calls,
        SUM(input_tokens) as totalInputTokens,
        SUM(output_tokens) as totalOutputTokens,
        SUM(estimated_cost_usd) as totalCostUsd,
        AVG(latency_ms) as avgLatencyMs
      FROM usage_log
      GROUP BY model
      ORDER BY calls DESC
    `).all() as Array<{
      model: string;
      calls: number;
      totalInputTokens: number;
      totalOutputTokens: number;
      totalCostUsd: number;
      avgLatencyMs: number;
    }>;
  },

  getRecentUsage: (limit = 20) => {
    return db.prepare(`
      SELECT model, session_id, input_tokens, output_tokens, estimated_cost_usd, latency_ms, timestamp
      FROM usage_log
      ORDER BY id DESC
      LIMIT ?
    `).all(limit) as Array<{
      model: string;
      sessionId: string;
      inputTokens: number;
      outputTokens: number;
      estimatedCostUsd: number;
      latencyMs: number;
      timestamp: string;
      createdAt: string;
      updatedAt: string;
    }>;
  },

  addSpeechUsageEntry: (input: {
    provider: string;
    voice?: string | null;
    characters: number;
    status?: string;
    notes?: string | null;
  }) => {
    db.prepare(`
      INSERT INTO speech_usage_log (provider, voice, characters, status, notes)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      input.provider,
      input.voice ?? null,
      input.characters,
      input.status ?? "success",
      input.notes ?? null,
    );
  },

  getCurrentMonthSpeechUsage: () => {
    return db.prepare(`
      SELECT
        provider,
        COUNT(*) as calls,
        SUM(characters) as totalCharacters,
        MAX(timestamp) as lastUsedAt
      FROM speech_usage_log
      WHERE status = 'success'
        AND strftime('%Y-%m', timestamp) = strftime('%Y-%m', 'now')
      GROUP BY provider
      ORDER BY totalCharacters DESC, provider ASC
    `).all() as Array<{
      provider: string;
      calls: number;
      totalCharacters: number;
      lastUsedAt: string | null;
    }>;
  },

  getCurrentMonthSpeechUsageForProvider: (provider: string) => {
    const row = db.prepare(`
      SELECT
        COUNT(*) as calls,
        COALESCE(SUM(characters), 0) as totalCharacters,
        MAX(timestamp) as lastUsedAt
      FROM speech_usage_log
      WHERE provider = ?
        AND status = 'success'
        AND strftime('%Y-%m', timestamp) = strftime('%Y-%m', 'now')
    `).get(provider) as {
      calls: number;
      totalCharacters: number;
      lastUsedAt: string | null;
    };

    return {
      calls: row?.calls ?? 0,
      totalCharacters: row?.totalCharacters ?? 0,
      lastUsedAt: row?.lastUsedAt ?? null,
    };
  },

  createMission: (input: { id: string; title: string; description: string; targetDeadline?: string }) => {
    db.prepare(`
      INSERT INTO missions (id, title, description, target_deadline)
      VALUES (?, ?, ?, ?)
    `).run(input.id, input.title, input.description, input.targetDeadline ?? null);
  },

  getMissions: (status?: string) => {
    if (status) {
      return db.prepare("SELECT * FROM missions WHERE status = ? ORDER BY created_at DESC").all(status) as Array<{
        id: string;
        title: string;
        description: string;
        status: string;
        context_summary: string;
        target_deadline: string | null;
        created_at: string;
        updated_at: string;
      }>;
    }
    return db.prepare("SELECT * FROM missions ORDER BY created_at DESC").all() as Array<{
      id: string;
      title: string;
      description: string;
      status: string;
      context_summary: string;
      target_deadline: string | null;
      created_at: string;
      updated_at: string;
    }>;
  },

  updateMissionStatus: (id: string, status: string) => {
    db.prepare("UPDATE missions SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(status, id);
  },

  updateMissionContext: (id: string, newContext: string) => {
    // Append the new context summary
    db.prepare(`
      UPDATE missions 
      SET context_summary = context_summary || '\n- ' || ?, 
          updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).run(newContext, id);
  },

  createMissionTask: (input: { id: string; missionId: string; description: string; priority?: number }) => {
    db.prepare(`
      INSERT INTO mission_tasks (id, mission_id, description, priority)
      VALUES (?, ?, ?, ?)
    `).run(input.id, input.missionId, input.description, input.priority ?? 1);
  },

  getMissionTasks: (missionId: string) => {
    return db.prepare("SELECT * FROM mission_tasks WHERE mission_id = ? ORDER BY priority DESC, created_at ASC").all(missionId) as Array<{
      id: string;
      mission_id: string;
      description: string;
      status: string;
      priority: number;
    }>;
  },

  updateMissionTaskStatus: (id: string, status: string) => {
    db.prepare("UPDATE mission_tasks SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(status, id);
  }
};
