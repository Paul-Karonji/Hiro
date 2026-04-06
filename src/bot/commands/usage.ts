import type { Context } from "grammy";
import { getAppContext } from "../../core/appContext";
import { getSpeechUsageReport } from "../audio";

export async function handleUsageCommand(ctx: Context): Promise<void> {
  const tokenReport = getAppContext().usageTracker.formatReport();
  const speechReport = getSpeechUsageReport();
  const report = `${tokenReport}\n\n${speechReport}`;
  await ctx.reply(report, { parse_mode: "Markdown" });
}
