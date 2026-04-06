import cron from "node-cron";
import { config } from "../../config";
import { getAppContext } from "../../core/appContext";
import { processMessageWithEngine } from "../engine";

export function startEveningRecap() {
  const timeStr = config.PROACTIVE_EVENING_RECAP_TIME || "20:00";
  const [hour, minute] = timeStr.split(":");
  const cronExpr = `${minute || "0"} ${hour || "20"} * * *`;
  
  const timezone = config.PROACTIVE_TIMEZONE || "Africa/Nairobi";

  console.log(`[Proactive] Evening Recap scheduled for ${timeStr} (${timezone})`);

  cron.schedule(cronExpr, async () => {
    console.log("[Proactive] Triggering Evening Recap...");

    try {
      getAppContext().sessions.ensureSystemSession(
        "system:proactive:evening",
        "Evening Recap",
        { prompt: "Handles the daily evening proactive recaps." }
      );

      const { text } = await processMessageWithEngine(
        "[PROACTIVE EVENING RECAP] Summarize today's interactions, tasks completed, and any pending items based on memory.",
        false,
        {
          sessionId: "system:proactive:evening",
          allowBackgroundTasks: false,
          enableSpeech: false,
          metadata: { source: "proactive_evening" },
        }
      );

      if (getAppContext().channel && text.trim().length > 0) {
        await getAppContext().channel!.sendText(text);
      }
    } catch (e) {
      console.error("[Proactive] Evening Recap failed:", e);
    }
  }, {
    timezone
  });
}
