import { config } from "../../config";
import { getAppContext } from "../../core/appContext";
import { processMessageWithEngine } from "../engine";
import { dbQueries } from "../../memory/sqlite";

export function startHeartbeat() {
  const intervalHours = config.PROACTIVE_HEARTBEAT_INTERVAL_HOURS || 5;
  const intervalMs = intervalHours * 60 * 60 * 1000;

  console.log(`[Proactive] Heartbeat scheduled every ${intervalHours} hours.`);

  setInterval(async () => {
    console.log("[Proactive] Triggering Heartbeat...");

    try {
      getAppContext().sessions.ensureSystemSession(
        "system:proactive:heartbeat",
        "Heartbeat System",
        { prompt: "Monitors events, impending deadlines, and stalled long-term missions." }
      );

      const activeMissions = dbQueries.getMissions("active");
      let missionPrompt = "";
      if (activeMissions && activeMissions.length > 0) {
        missionPrompt = "\n\nYou are managing the following long-term missions:\n" + 
          activeMissions.map((m: any) => `- [Mission ID: ${m.id}] "${m.title}": ${m.target_deadline ? `(Deadline: ${m.target_deadline})` : ''}\n  Context: ${m.context_summary}`).join("\n") +
          "\nRandomly pick ONE mission to check in on today. If it seems stalled based on its context, proactively identify a bottleneck and present an unexpected check-in message to the user with a concrete next step (e.g., 'I noticed we haven't touched X. Should I run a web search on Y?').";
      }

      const { text } = await processMessageWithEngine(
        `[PROACTIVE HEARTBEAT] Check for new events, impending deadlines, webhook alerts, or calendar tasks.${missionPrompt}\nIf there is absolutely nothing noteworthy, reply exactly 'NO_ACTION_NEEDED'.`,
        false,
        {
          sessionId: "system:proactive:heartbeat",
          allowBackgroundTasks: false,
          enableSpeech: false,
          metadata: { source: "proactive_heartbeat" },
        }
      );

      if (getAppContext().channel && text.trim().length > 0 && !text.includes("NO_ACTION_NEEDED")) {
        await getAppContext().channel!.sendText(`💓 **Heartbeat Alert:**\n${text}`);
      }
    } catch (e) {
      console.error("[Proactive] Heartbeat failed:", e);
    }
  }, intervalMs);
}
