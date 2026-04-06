import { getAppContext } from "../core/appContext";

export const sessionsListDeclaration = {
  name: "sessions_list",
  description: "List all known agent sessions, including their type, role, status, and last used model.",
  parameters: {
    type: "object",
    properties: {},
  },
};

export const sessionsHistoryDeclaration = {
  name: "sessions_history",
  description: "Read recent message history from a specific agent session.",
  parameters: {
    type: "object",
    properties: {
      sessionId: {
        type: "string",
        description: "The target session id to inspect.",
      },
      limit: {
        type: "integer",
        description: "Optional number of most recent messages to return.",
      },
    },
    required: ["sessionId"],
  },
};

export const sessionsSendDeclaration = {
  name: "sessions_send",
  description: "Send a message to another agent session and get its reply.",
  parameters: {
    type: "object",
    properties: {
      sessionId: {
        type: "string",
        description: "The target session id.",
      },
      message: {
        type: "string",
        description: "The message to send to the target session.",
      },
    },
    required: ["sessionId", "message"],
  },
};

export async function sessionsListExecutor() {
  const { sessions } = getAppContext();
  const allSessions = sessions.listSessions();

  if (allSessions.length === 0) {
    return "No sessions are currently stored.";
  }

  return allSessions
    .map((session) =>
      [
        `ID: ${session.id}`,
        `Type: ${session.type}`,
        `Role: ${session.role ?? "n/a"}`,
        `Status: ${session.status}`,
        `Model Override: ${session.model_override ?? "none"}`,
        `Last Model Used: ${session.last_model_used ?? "unknown"}`,
      ].join(" | "),
    )
    .join("\n");
}

export async function sessionsHistoryExecutor(args: Record<string, any>) {
  const { sessions } = getAppContext();
  const limit = Number.isFinite(args.limit) ? Number(args.limit) : 10;
  const history = sessions.getHistory(String(args.sessionId), limit);

  if (history.length === 0) {
    return `No history found for session ${args.sessionId}.`;
  }

  return history
    .map((message) => {
      const modelSuffix = message.model_used ? ` [model=${message.model_used}]` : "";
      return `${message.role.toUpperCase()}${modelSuffix}: ${message.content}`;
    })
    .join("\n\n");
}

export async function sessionsSendExecutor(args: Record<string, any>) {
  const { session, result } = await getAppContext().sessions.sendToSession(
    String(args.sessionId),
    String(args.message),
  );

  return [
    `Session ${session.id} replied using model ${result.modelUsed}.`,
    result.text,
  ].join("\n\n");
}
