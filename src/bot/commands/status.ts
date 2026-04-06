import type { Context } from "grammy";
import { getAppContext } from "../../core/appContext";
import { PRIMARY_SESSION_ID } from "../../memory/sqlite";

type StatusCommandOptions = {
  sessionId?: string;
};

export async function handleStatusCommand(ctx: Context, options?: StatusCommandOptions): Promise<void> {
  const app = getAppContext();
  const sessionId = options?.sessionId ?? PRIMARY_SESSION_ID;
  const session = app.memory.getSession(sessionId) ?? app.sessions.ensurePrimarySession();

  const model = app.modelState.getCurrentModel();
  const msgCount = app.memory.getMessageCount(session.id);
  const tasks = app.memory.getScheduledTasks();
  const facts = app.memory.getCoreFacts();
  const sessions = app.memory.listSessions().filter((s) => s.status === "active");

  const uptimeSeconds = Math.floor(process.uptime());
  const days = Math.floor(uptimeSeconds / 86400);
  const hours = Math.floor((uptimeSeconds % 86400) / 3600);
  const mins = Math.floor((uptimeSeconds % 3600) / 60);
  const uptimeStr = [
    days > 0 ? `${days}d` : "",
    hours > 0 ? `${hours}h` : "",
    `${mins}m`,
  ]
    .filter(Boolean)
    .join(" ");

  const memUsageMb = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);

  const lines = [
    "🤖 *Hiro Status*\n",
    `⚡ *Model:* \`${model}\``,
    `⏱ *Uptime:* ${uptimeStr}`,
    `🧠 *Heap:* ${memUsageMb} MB`,
    `💬 *Current session:* \`${session.id}\``,
    `🗂 *Session title:* ${session.title}`,
    `📝 *Session messages:* ${msgCount}`,
    `📌 *Core facts memorized:* ${facts.length}`,
    `⏰ *Scheduled tasks:* ${tasks.length}`,
    `🔗 *Active sessions:* ${sessions.length}`,
  ];

  await ctx.reply(lines.join("\n"), { parse_mode: "Markdown" });
}
