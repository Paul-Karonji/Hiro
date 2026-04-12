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

    // Extract tool calls and results for better context
    const toolInteractions = extractToolInteractions(oldestMessages);
    const toolContext = toolInteractions.length > 0 
      ? `\n\nTool interactions:\n${toolInteractions.join("\n")}` 
      : "";

    const response = await generateText({
      model: app.providerRouter.resolveChatModel(app.modelState.getCurrentModel()),
      system: `You are a background memory processor that compresses chat history into a structured summary.
      
Create a summary using this exact format:
[CONTEXT COMPACTION] Earlier turns in this conversation were compacted to save context space. 
The summary below describes work that was already completed, and the current session state may still 
reflect that work (for example, files may already be changed). Use the summary and the current state 
to continue from where things left off, and avoid repeating work:

**Goal:**
[State the primary objective or user's main goal in this conversation segment]

**Progress:**
[Summarize what has been accomplished, key findings, and current status]

**Decisions:**
[List important decisions made, choices selected, or approaches taken]

**Files:**
[Note any files created, modified, or referenced. Include file paths if available]

**Next Steps:**
[Indicate what work remains or what should be done next]

Keep each section concise but informative. Preserve technical details and specific outcomes.`,
      prompt: `
${currentSummary ? `Previous summary context for continuity:\n${currentSummary}\n\n` : ""}
Analyze this conversation segment and create a structured summary:${toolContext}

Conversation:
${conversationLog}
`,
    });

    const newSummary = response.text || "Summary generation failed.";
    app.memory.addSummary(newSummary, oldestMessages.length, sessionId);
    await app.memory.storeSemanticMemory(`summary-${Date.now()}`, newSummary);

    console.log("[Memory] Auto-compaction complete with structured format.");
  } catch (error) {
    console.error("[Memory] Compaction failed silently.", error);
  }
}

function extractToolInteractions(messages: any[]): string[] {
  const interactions: string[] = [];
  
  for (const message of messages) {
    if (message.metadata?.tool_calls) {
      const toolCalls = message.metadata.tool_calls as any[];
      for (const call of toolCalls) {
        interactions.push(`- ${call.function?.name || 'unknown_tool'}: ${call.function?.arguments || '{}'}`);
      }
    }
    
    if (message.metadata?.tool_results) {
      const results = message.metadata.tool_results as any[];
      for (const result of results) {
        const output = typeof result.output === 'string' 
          ? result.output.slice(0, 200) + (result.output.length > 200 ? '...' : '')
          : JSON.stringify(result.output).slice(0, 200) + '...';
        interactions.push(`  Result: ${output}`);
      }
    }
  }
  
  return interactions;
}
