import cron from "node-cron";
import { processMessageWithEngine } from "./engine";
import { getAppContext } from "../core/appContext";

const activeJobs = new Map<number, any>();

function ensureSchedulerSession(taskId: number, prompt: string) {
  return getAppContext().sessions.ensureSystemSession(
    `system:scheduler:${taskId}`,
    `Scheduled Task ${taskId}`,
    { prompt },
  );
}

function scheduleAction(id: number, cronExpr: string, prompt: string) {
  if (!cron.validate(cronExpr)) {
    console.error(`[Scheduler] Invalid cron expression for task ${id}: ${cronExpr}`);
    return;
  }

  ensureSchedulerSession(id, prompt);

  const job = cron.schedule(cronExpr, async () => {
    console.log(`[Scheduler] TRIGGERED Task ${id}: ${prompt}`);

    try {
      const { text } = await processMessageWithEngine(
        `[PROACTIVE CRON TRIGGER] User requested this scheduled task to run now: ${prompt}`,
        false,
        {
          sessionId: `system:scheduler:${id}`,
          allowBackgroundTasks: false,
          enableSpeech: false,
          metadata: { source: "scheduler", taskId: id },
        },
      );

      if (getAppContext().channel && text.trim().length > 0) {
        await getAppContext().channel!.sendText(text);
      }
    } catch (error: any) {
      console.error(`[Scheduler] Failed to execute task ${id}:`, error);
      if (getAppContext().channel) {
        await getAppContext().channel!.sendText(
          `⚠️ Scheduled task failed: ${prompt}\nError: ${error?.message || String(error)}`,
        );
      }
    }
  });

  activeJobs.set(id, job);
}

export function initializeScheduler() {
  console.log("[Scheduler] Booting up and restoring tasks from database...");
  const tasks = getAppContext().memory.getScheduledTasks();
  for (const task of tasks) {
    scheduleAction(task.id, task.cron_expression, task.prompt);
  }
  console.log(`[Scheduler] Restored ${tasks.length} proactive task(s).`);
}

export function addNewScheduledTask(cronExpr: string, prompt: string): number {
  const id = getAppContext().memory.addScheduledTask(cronExpr, prompt);
  scheduleAction(Number(id), cronExpr, prompt);
  return Number(id);
}

export function cancelScheduledTask(id: number): boolean {
  const job = activeJobs.get(id);
  if (!job) {
    return false;
  }

  job.stop();
  activeJobs.delete(id);
  getAppContext().memory.deleteScheduledTask(id);
  return true;
}
