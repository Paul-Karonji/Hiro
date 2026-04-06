import type { Context } from "grammy";
import { compactConversationInBackground } from "../../agent/backgroundTasks";
import { PRIMARY_SESSION_ID } from "../../memory/sqlite";

type CompactCommandOptions = {
  sessionId?: string;
};

export async function handleCompactCommand(ctx: Context, options?: CompactCommandOptions): Promise<void> {
  const sessionId = options?.sessionId ?? PRIMARY_SESSION_ID;

  await ctx.reply(
    "Compacting eligible older messages...\nThis updates the rolling summary without deleting raw history.",
    { parse_mode: "Markdown" },
  );

  try {
    await compactConversationInBackground(sessionId);

    await ctx.reply(
      [
        "*Compaction complete.*",
        "Older eligible messages have been summarized and stored.",
        "Raw transcript history was preserved.",
      ].join("\n"),
      { parse_mode: "Markdown" },
    );
  } catch (error: any) {
    await ctx.reply(`Compaction failed: ${error?.message || String(error)}`);
  }
}
