import { startMorningBriefing } from "./morning";
import { startEveningRecap } from "./evening";
import { startHeartbeat } from "./heartbeat";
import { startRecommendations } from "./recommendations";
import { startMemoryPruner } from "./memoryManager";

export function initializeProactiveSystem() {
  console.log("[Proactive] Booting up proactive systems...");
  startMorningBriefing();
  startEveningRecap();
  startHeartbeat();
  startRecommendations();
  startMemoryPruner();
  console.log("[Proactive] Proactive systems initialized.");
}
