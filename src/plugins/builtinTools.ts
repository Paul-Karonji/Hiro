import { getAppContext } from "../core/appContext";
import type { RuntimeTool } from "../core/types";
import { findRelevantImageMemories } from "../agent/imageMemory";
import { fileToolsDefinitions, deleteFile, listDirectory, readFile, writeFile } from "../tools/files";
import { getTimeDeclaration } from "../tools/get_time";
import { logActivityDeclaration } from "../tools/log_activity";
import { queryAnalyticsDeclaration } from "../tools/query_analytics";
import { searchHistoryDeclaration, formatHistorySearchResults } from "../tools/search_history";
import { rememberFactDeclaration } from "../tools/remember_fact";
import { scheduleToolsDefinitions, deleteScheduledTask, listScheduledTasks, scheduleTask } from "../tools/schedule";
import { searchMemoryDeclaration } from "../tools/search_memory";
import { searchDocumentsDeclaration, searchDocumentsExecutor } from "../tools/search_documents";
import { shellToolDefinition, runShellCommand } from "../tools/shell";
import { sessionsHistoryDeclaration, sessionsHistoryExecutor, sessionsListDeclaration, sessionsListExecutor, sessionsSendDeclaration, sessionsSendExecutor } from "../tools/sessions";
import { speakResponseDeclaration } from "../tools/speak";
import { runSwarmDeclaration, runSwarmExecutor } from "../tools/swarm";
import { webToolsDefinitions, readWebpage, searchWeb, crawlWebsite } from "../tools/web_search";
import { renderCanvasTool } from "../tools/canvas";
import { usageSummaryTool } from "../tools/usage_summary";
import { renderUsageChartTool } from "../tools/render_usage_chart";
import type { ToolPlugin } from "./types";

function runtimeTool(definition: any, execute: RuntimeTool["execute"]): RuntimeTool {
  return {
    definition,
    execute,
  };
}

export const builtinToolsPlugin: ToolPlugin = {
  id: "builtin-tools",
  getTools() {
    return [
      runtimeTool(getTimeDeclaration, async () => new Date().toISOString()),
      runtimeTool(rememberFactDeclaration, async (args) => {
        const fact = String(args.fact || "").trim();
        if (!fact) {
          return "Error: No fact provided.";
        }

        getAppContext().memory.addCoreFact(fact);
        return `Successfully memorized fact: ${fact}`;
      }),
      runtimeTool(searchHistoryDeclaration, async (args) => {
        const query = String(args.query || "").trim();
        if (!query) {
          return "Error: No search query provided.";
        }

        const parsedLimit = typeof args.limit === "number" ? args.limit : Number(args.limit);
        const limit = Number.isFinite(parsedLimit) ? Math.max(1, Math.min(8, Math.trunc(parsedLimit))) : 5;
        const results = getAppContext().memory.searchConversationHistory(query, limit);

        if (results.length === 0) {
          return "Search completed. No matching transcript history was found for that query.";
        }

        return `TRANSCRIPT HISTORY MATCHES:\n${formatHistorySearchResults(results)}`;
      }),
      runtimeTool(searchMemoryDeclaration, async (args, context) => {
        const query = String(args.query || "").trim();
        if (!query) {
          return "Error: No search query provided.";
        }

        const app = getAppContext();
        const results = await app.memory.searchSemanticMemory(query, 3);
        const session = app.memory.getSession(context.sessionId);
        const imageMemories = findRelevantImageMemories(session?.metadata, query)
          .map((memory) => memory.summary);

        if (results.length === 0 && imageMemories.length === 0) {
          return "Search completed. No relevant historical memories were found for that query.";
        }

        const sections: string[] = [];
        if (results.length > 0) {
          sections.push(`HISTORICAL MEMORIES FOUND:\n${results.map((result, index) => `${index + 1}. ${result}`).join("\n\n")}`);
        }
        if (imageMemories.length > 0) {
          sections.push(`RECENT IMAGE MEMORIES:\n${imageMemories.map((result, index) => `${index + 1}. ${result}`).join("\n\n")}`);
        }

        return sections.join("\n\n");
      }),
      runtimeTool(searchDocumentsDeclaration, async (args, context) => searchDocumentsExecutor(args, context.sessionId)),
      runtimeTool(logActivityDeclaration, async (args) => {
        const action = String(args.action || "").trim();
        const details = String(args.details || "").trim();
        const status = args.status ? String(args.status) : "success";
        await getAppContext().memory.logActivity(action, details, status);
        return "Action successfully logged to the analytics dashboard.";
      }),
      runtimeTool(queryAnalyticsDeclaration, async (args) => {
        const query = String(args.sql_query || "").trim();
        if (!query.toLowerCase().startsWith("select")) {
          return "ERROR: Only SELECT queries are permitted.";
        }

        const rows = await getAppContext().memory.queryAnalytics(query);
        return `Query Results:\n${JSON.stringify(rows, null, 2)}`;
      }),
      runtimeTool(speakResponseDeclaration, async (args, context) => {
        const text = String(args.text_to_speak || "").trim();
        if (!text) {
          return "Error: No speech text provided.";
        }

        context.directives.push({ type: "speak", text });
        return "Voice message queued for delivery to the user.";
      }),
      runtimeTool(shellToolDefinition, async (args) => runShellCommand(args)),
      runtimeTool(fileToolsDefinitions[0], async (args) => readFile(args)),
      runtimeTool(fileToolsDefinitions[1], async (args) => writeFile(args)),
      runtimeTool(fileToolsDefinitions[2], async (args) => listDirectory(args)),
      runtimeTool(fileToolsDefinitions[3], async (args) => deleteFile(args)),
      runtimeTool(webToolsDefinitions[0], async (args) => searchWeb(args)),
      runtimeTool(webToolsDefinitions[1], async (args) => readWebpage(args)),
      runtimeTool(webToolsDefinitions[2], async (args) => crawlWebsite(args)),
      runtimeTool(scheduleToolsDefinitions[0], async (args) => scheduleTask(args)),
      runtimeTool(scheduleToolsDefinitions[1], async () => listScheduledTasks()),
      runtimeTool(scheduleToolsDefinitions[2], async (args) => deleteScheduledTask(args)),
      runtimeTool(sessionsListDeclaration, async () => sessionsListExecutor()),
      runtimeTool(sessionsHistoryDeclaration, async (args) => sessionsHistoryExecutor(args)),
      runtimeTool(sessionsSendDeclaration, async (args) => sessionsSendExecutor(args)),
      runtimeTool(runSwarmDeclaration, async (args, context) => runSwarmExecutor(args, context.sessionId)),
      renderCanvasTool,
      usageSummaryTool,
      renderUsageChartTool,
    ];
  },
};
