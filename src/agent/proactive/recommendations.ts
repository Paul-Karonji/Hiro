import { config } from "../../config";
import { getAppContext } from "../../core/appContext";
import { processMessageWithEngine } from "../engine";

export function startRecommendations() {
  const intervalHours = config.PROACTIVE_HEARTBEAT_INTERVAL_HOURS || 5;
  const intervalMs = intervalHours * 60 * 60 * 1000;

  // Offset by 10 minutes so it doesn't trigger at the exact same moment as heartbeat
  console.log(`[Proactive] Smart Recommendations scheduled every ${intervalHours} hours.`);
  
  setTimeout(() => {
    setInterval(async () => {
      console.log("[Proactive] Triggering Smart Recommendations...");

      try {
        getAppContext().sessions.ensureSystemSession(
          "system:proactive:recommendations",
          "Smart Recommendations",
          { prompt: "Analyzes behavior and makes proactive suggestions." }
        );

        const { text } = await processMessageWithEngine(
          "[PROACTIVE RECOMMENDATIONS] Review the user's recent interactions and tasks. Specifically suggest one action you can take or a workflow you can start for them. If there's no clear pattern or nothing helpful to suggest, reply exactly 'SKIP'.",
          false,
          {
            sessionId: "system:proactive:recommendations",
            allowBackgroundTasks: false,
            enableSpeech: false,
            metadata: { source: "proactive_recommendations" },
          }
        );

        if (getAppContext().channel && text.trim().length > 0 && !text.includes("SKIP")) {
          await getAppContext().channel!.sendText(`💡 **Suggestion:**\n${text}`);
        }
      } catch (e) {
        console.error("[Proactive] Smart Recommendations failed:", e);
      }
    }, intervalMs);
  }, 10 * 60 * 1000); 
}
