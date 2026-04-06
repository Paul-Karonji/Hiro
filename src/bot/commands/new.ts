import type { Context } from "grammy";
import { getAppContext } from "../../core/appContext";
import { PRIMARY_SESSION_ID } from "../../memory/sqlite";

type NewCommandOptions = {
  sessionId?: string;
};

export async function handleNewCommand(ctx: Context, options?: NewCommandOptions): Promise<void> {
  const app = getAppContext();
  const sessionId = options?.sessionId ?? PRIMARY_SESSION_ID;
  const before = app.memory.getMessageCount(sessionId);
  const archivedSession = app.sessions.archiveSession(sessionId, "manual_reset");

  if (!archivedSession) {
    await ctx.reply(
      [
        "Started a fresh conversation thread.",
        "There were no active messages to archive.",
      ].join("\n"),
      { parse_mode: "Markdown" },
    );
    return;
  }

  await ctx.reply(
    [
      "*New conversation started.*",
      `Archived ${before} message(s) from the current thread.`,
      `Archive session: \`${archivedSession.id}\``,
      "Raw transcript history remains searchable.",
      "Core facts and semantic memory are preserved.",
      "",
      "_Start fresh. I'm listening._",
    ].join("\n"),
    { parse_mode: "Markdown" },
  );
}
