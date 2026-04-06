import { getTimeDeclaration, getTimeExecutor } from "./get_time";
import { rememberFactDeclaration, rememberFactExecutor } from "./remember_fact";
import { searchHistoryDeclaration, searchHistoryExecutor } from "./search_history";
import { searchMemoryDeclaration, searchMemoryExecutor } from "./search_memory";
import { logActivityDeclaration, logActivityExecutor } from "./log_activity";
import { queryAnalyticsDeclaration, queryAnalyticsExecutor } from "./query_analytics";
import { speakResponseDeclaration } from "./speak";
import { shellToolDefinition, runShellCommand } from "./shell";
import { fileToolsDefinitions, readFile, writeFile, listDirectory, deleteFile } from "./files";
import { webToolsDefinitions, searchWeb, readWebpage } from "./web_search";
import { executeMcpTool, mcpDynamicTools } from "./mcp_bridge";
import { scheduleToolsDefinitions, scheduleTask, listScheduledTasks, deleteScheduledTask } from "./schedule";
import { missionsToolsDefinitions, createMission, breakdownMission, updateTaskStatus, addMissionContext, listActiveMissions } from "./missions";

export const tools: any[] = [
  getTimeDeclaration,
  rememberFactDeclaration,
  searchHistoryDeclaration,
  searchMemoryDeclaration,
  logActivityDeclaration,
  queryAnalyticsDeclaration,
  speakResponseDeclaration,  // Voice output tool
  shellToolDefinition,       // OS commands
  ...fileToolsDefinitions,   // Basic I/O
  ...webToolsDefinitions,    // Web Scraper
  ...scheduleToolsDefinitions, // Proactive scheduling
  ...missionsToolsDefinitions, // Long-term Goal tracking
];

// Returns static tools + any dynamic MCP tools loaded on boot
export function getAllTools() {
  return [...tools, ...mcpDynamicTools];
}

export async function executeTool(name: string, args: any): Promise<any> {
  if (name === "get_current_time") {
    return await getTimeExecutor();
  }
  if (name === "remember_fact") {
    return await rememberFactExecutor(args);
  }
  if (name === "search_history") {
    return await searchHistoryExecutor(args);
  }
  if (name === "search_memory") {
    return await searchMemoryExecutor(args);
  }
  if (name === "log_activity") {
    return await logActivityExecutor(args);
  }
  if (name === "query_analytics") {
    return await queryAnalyticsExecutor(args);
  }
  
  if (name === "run_shell_command") return await runShellCommand(args);
  if (name === "read_file") return await readFile(args);
  if (name === "write_file") return await writeFile(args);
  if (name === "list_directory") return await listDirectory(args);
  if (name === "delete_file") return await deleteFile(args);
  
  if (name === "search_web") return await searchWeb(args);
  if (name === "read_webpage") return await readWebpage(args);
  
  if (name === "schedule_task") return await scheduleTask(args);
  if (name === "list_scheduled_tasks") return await listScheduledTasks();
  if (name === "delete_scheduled_task") return await deleteScheduledTask(args);

  if (name === "create_mission") return await createMission(args);
  if (name === "breakdown_mission") return await breakdownMission(args);
  if (name === "update_task_status") return await updateTaskStatus(args);
  if (name === "add_mission_context") return await addMissionContext(args);
  if (name === "list_active_missions") return await listActiveMissions();

  // If this is a dynamic MCP tool, proxy it to the remote server
  if (name.startsWith("mcp_")) {
    return await executeMcpTool(name, args);
  }

  // NOTE: speak_response is intentionally NOT handled here.
  // It is intercepted in gemini.ts before reaching this function.
  
  throw new Error(`Unknown tool: ${name}`);
}
