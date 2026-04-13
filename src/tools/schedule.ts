import { addNewScheduledTask, cancelScheduledTask } from '../agent/scheduler';
import { dbQueries } from '../memory/sqlite';
import * as cron from 'node-cron';

export const scheduleToolsDefinitions = [
    {
        name: "schedule_task",
        description: "Schedule a recurring or delayed proactive task using standard cron syntax. Hiro will wake up and perform this task automatically on schedule.",
        parameters: {
            type: "OBJECT",
            properties: {
                cronExpr: { type: "STRING", description: "Standard cron expression (e.g., '0 8 * * *' for 8AM every day, or '*/5 * * * *' for every 5 minutes)." },
                prompt: { type: "STRING", description: "What you should do when the cron triggers (e.g., 'Check the weather and send a briefing to the user', 'Tell me a joke')." },
                deliverTo: { type: "STRING", enum: ["auto", "telegram", "whatsapp"], description: "Which platform to deliver the output to when the task fires. 'auto' sends to the active channel (or both in dual mode). Use 'telegram' or 'whatsapp' to target a specific platform only." }
            },
            required: ["cronExpr", "prompt"]
        }
    },
    {
        name: "list_scheduled_tasks",
        description: "List all currently active scheduled tasks and their IDs.",
        parameters: { type: "OBJECT", properties: {} }
    },
    {
        name: "delete_scheduled_task",
        description: "Delete an active scheduled task by its ID.",
        parameters: {
            type: "OBJECT",
            properties: {
                id: { type: "INTEGER", description: "The ID of the task to delete." }
            },
            required: ["id"]
        }
    }
];

export async function scheduleTask(args: Record<string, any>): Promise<string> {
    const { cronExpr, prompt, deliverTo } = args;
    if (!cronExpr || typeof cronExpr !== "string" || !cronExpr.trim()) {
        return `Error: Missing required parameter 'cronExpr'. Please provide a valid 5-part cron expression (e.g. '0 8 * * *' for 8AM daily).`;
    }
    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
        return `Error: Missing required parameter 'prompt'. Please describe what task to perform when the cron triggers.`;
    }
    if (!cron.validate(cronExpr)) {
        return `Error: Invalid cron expression '${cronExpr}'. Please use standard 5-part cron syntax (e.g. '0 8 * * *').`;
    }

    const VALID_DELIVER_TARGETS = ["auto", "telegram", "whatsapp"];
    const resolvedDeliverTo = typeof deliverTo === "string" && VALID_DELIVER_TARGETS.includes(deliverTo.toLowerCase())
        ? deliverTo.toLowerCase()
        : "auto";

    try {
        const id = addNewScheduledTask(cronExpr, prompt, resolvedDeliverTo);
        const deliveryNote = resolvedDeliverTo === "auto" ? "" : ` Output will be delivered to ${resolvedDeliverTo} only.`;
        return `Successfully scheduled task ID ${id} with cron '${cronExpr}'.${deliveryNote} I will execute it automatically.`;
    } catch (e: any) {
        return `Error scheduling task: ${e.message}`;
    }
}

export async function listScheduledTasks(): Promise<string> {
    const tasks = dbQueries.getScheduledTasks();
    if (tasks.length === 0) return "There are no active scheduled tasks.";

    return "ACTIVE SCHEDULED TASKS:\n" + tasks.map(t => `ID ${t.id} | Cron: ${t.cron_expression} | Deliver: ${t.deliver_to ?? "auto"} | Task: ${t.prompt}`).join('\n');
}

export async function deleteScheduledTask(args: Record<string, any>): Promise<string> {
    const success = cancelScheduledTask(args.id);
    if (success) {
        return `Successfully cancelled and deleted task ID ${args.id}.`;
    } else {
        return `Error: Could not find or stop task ID ${args.id}.`;
    }
}
