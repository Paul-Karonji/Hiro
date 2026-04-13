import cron from "node-cron";
import { processMessageWithEngine } from "./engine";
import { getAppContext } from "../core/appContext";

const activeJobs = new Map<number, any>();

async function routeDelivery(text: string, deliverTo: string = "auto"): Promise<void> {
  const ctx = getAppContext();
  const target = deliverTo.trim().toLowerCase();

  if (target === "auto" || target === "") {
    if (ctx.channel) {
      await ctx.channel.sendText(text);
    }
    return;
  }

  const namedChannel = ctx.channels[target];
  if (namedChannel) {
    await namedChannel.sendText(text);
  } else {
    console.warn(`[Scheduler] Delivery target "${deliverTo}" not found in channels registry. Falling back to default channel.`);
    if (ctx.channel) {
      await ctx.channel.sendText(text);
    }
  }
}

function ensureSchedulerSession(taskId: number, prompt: string) {
  return getAppContext().sessions.ensureSystemSession(
    `system:scheduler:${taskId}`,
    `Scheduled Task ${taskId}`,
    { prompt },
  );
}

function scheduleAction(id: number, cronExpr: string, prompt: string, deliverTo: string = "auto") {
  if (!cron.validate(cronExpr)) {
    console.error(`[Scheduler] Invalid cron expression for task ${id}: ${cronExpr}`);
    return;
  }

  ensureSchedulerSession(id, prompt);

  const job = cron.schedule(cronExpr, async () => {
    console.log(`[Scheduler] TRIGGERED Task ${id} (→${deliverTo}): ${prompt}`);

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

      if (text.trim().length > 0) {
        await routeDelivery(text, deliverTo);
      }
    } catch (error: any) {
      console.error(`[Scheduler] Failed to execute task ${id}:`, error);
      await routeDelivery(
        `⚠️ Scheduled task failed: ${prompt}\nError: ${error?.message || String(error)}`,
        deliverTo,
      ).catch(() => {});
    }
  });

  activeJobs.set(id, job);
}

export function initializeScheduler() {
  console.log("[Scheduler] Booting up and restoring tasks from database...");
  const tasks = getAppContext().memory.getScheduledTasks();
  for (const task of tasks) {
    scheduleAction(task.id, task.cron_expression, task.prompt, task.deliver_to ?? "auto");
  }
  console.log(`[Scheduler] Restored ${tasks.length} proactive task(s).`);
}

export function addNewScheduledTask(cronExpr: string, prompt: string, deliverTo: string = "auto"): number {
  const id = getAppContext().memory.addScheduledTask(cronExpr, prompt, deliverTo);
  scheduleAction(Number(id), cronExpr, prompt, deliverTo);
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
