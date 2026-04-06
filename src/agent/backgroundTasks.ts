import { generateText } from "ai";
import { getAppContext } from "../core/appContext";
import { PRIMARY_SESSION_ID } from "../memory/sqlite";

let messagesSinceLastFactExtraction = 0;
const FACT_EXTRACTION_INTERVAL = 5;

export async function extractCoreFactsInBackground(
  userMessage: string,
  modelResponse: string,
  sessionId: string = PRIMARY_SESSION_ID,
) {
  const session = getAppContext().memory.getSession(sessionId);
  if (!session || session.type !== "primary") {
    return;
  }

  messagesSinceLastFactExtraction += 1;
  if (messagesSinceLastFactExtraction < FACT_EXTRACTION_INTERVAL) {
    return;
  }

  messagesSinceLastFactExtraction = 0;

  try {
    const app = getAppContext();

    const currentFacts = app.memory.getCoreFacts();
    const knownFacts = currentFacts.length > 0
      ? currentFacts.map(f => f.fact).join("\n")
      : "None yet.";

    const response = await generateText({
      model: app.providerRouter.resolveChatModel(app.modelState.getCurrentModel()),
      system: "You are a background memory processor. Extract only new durable facts about the user.",
      prompt: `
Already known facts (do NOT repeat these):
${knownFacts}

Analyze the exchange below. Extract any NEW durable long-term facts about the user (name, location, goals, preferences, skills, projects). Do not extract facts already known.

If there are no new facts, output exactly "NONE".
Output one new fact per line, plain text only — no prefixes, no numbering.

User: ${userMessage}
AI: ${modelResponse}
`,
    });

    const text = response.text?.trim() || "NONE";
    if (text === "NONE") {
      console.log("[Memory] No new facts found.");
      return;
    }

    const newFacts = text.split("\n").map(l => l.trim()).filter(l => l.length > 0 && l !== "NONE");
    for (const fact of newFacts) {
      app.memory.addCoreFact(fact);
      console.log(`[Memory] Auto-added fact: ${fact}`);
    }
  } catch (error) {
    console.error("[Memory] Fact extraction failed silently.", error);
  }
}

export async function compactConversationInBackground(sessionId: string = PRIMARY_SESSION_ID) {
  const session = getAppContext().memory.getSession(sessionId);
  if (!session || session.type !== "primary") {
    return;
  }

  try {
    const app = getAppContext();
    const count = app.memory.getMessageCount(sessionId);
    const summarizedCount = app.memory.getSummarizedMessageCount(sessionId);
    const uncompactedCount = Math.max(0, count - summarizedCount);
    if (uncompactedCount <= 30) {
      return;
    }

    console.log(`[Memory] ${uncompactedCount} uncompacted messages detected. Triggering auto-compaction...`);

    const oldestMessages = app.memory.getMessagesBatch(sessionId, summarizedCount, 30);
    if (oldestMessages.length === 0) {
      return;
    }

    const currentSummary = app.memory.getLatestSummary(sessionId);
    const conversationLog = oldestMessages.map((message) => `${message.role.toUpperCase()}: ${message.content}`).join("\n");

    const response = await generateText({
      model: app.providerRouter.resolveChatModel(app.modelState.getCurrentModel()),
      system: "You are a background memory processor that compresses chat history into a concise durable summary.",
      prompt: `
Create a concise, comprehensive summary of the following conversation chunk.
${currentSummary ? `Consider this previous summary context: ${currentSummary}\n` : ""}
Summarize the key events, topics discussed, and conclusions reached so nothing important is forgotten. Omit pleasantries.

Conversation:
${conversationLog}
`,
    });

    const newSummary = response.text || "Summary generation failed.";
    app.memory.addSummary(newSummary, oldestMessages.length, sessionId);
    await app.memory.storeSemanticMemory(`summary-${Date.now()}`, newSummary);

    console.log("[Memory] Auto-compaction complete.");
  } catch (error) {
    console.error("[Memory] Compaction failed silently.", error);
  }
}
