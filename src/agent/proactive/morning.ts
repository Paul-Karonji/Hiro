import cron from "node-cron";
import { config } from "../../config";
import { getAppContext } from "../../core/appContext";
import { processMessageWithEngine } from "../engine";

export function startMorningBriefing() {
  const timeStr = config.PROACTIVE_MORNING_BRIEFING_TIME || "08:00";
  const [hour, minute] = timeStr.split(":");
  const cronExpr = `${minute || "0"} ${hour || "8"} * * *`;
  
  const timezone = config.PROACTIVE_TIMEZONE || "Africa/Nairobi";

  console.log(`[Proactive] Morning Briefing scheduled for ${timeStr} (${timezone})`);

  cron.schedule(cronExpr, async () => {
    console.log("[Proactive] Triggering Morning Briefing...");

    try {
      getAppContext().sessions.ensureSystemSession(
        "system:proactive:morning",
        "Morning Briefing",
        { prompt: "Handles the daily morning proactive briefings." }
      );

      const { text } = await processMessageWithEngine(
        "[PROACTIVE MORNING BRIEFING] Generate a morning briefing including weather, task overview, and news headlines. Use any necessary tools to gather this information.",
        false,
        {
          sessionId: "system:proactive:morning",
          allowBackgroundTasks: false,
          enableSpeech: false,
          metadata: { source: "proactive_morning" },
        }
      );

      if (getAppContext().channel && text.trim().length > 0) {
        await getAppContext().channel!.sendText(text);
      }
    } catch (e) {
      console.error("[Proactive] Morning Briefing failed:", e);
    }
  }, {
    timezone
  });
}
