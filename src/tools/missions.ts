import { dbQueries } from "../memory/sqlite";
import { randomUUID } from "crypto";

export const missionsToolsDefinitions = [
    {
        name: "create_mission",
        description: "Creates a new long-term goal (mission) for the user to track over weeks or months. Max 5 active missions should be tracked at once.",
        parameters: {
            type: "OBJECT",
            properties: {
                title: { type: "STRING", description: "Short recognizable title of the mission." },
                description: { type: "STRING", description: "Detailed description of what this mission entails." },
                targetDeadline: { type: "STRING", description: "Optional ISO date string for when this must be completed." }
            },
            required: ["title", "description"]
        }
    },
    {
        name: "breakdown_mission",
        description: "Breaks down an existing mission into smaller actionable tasks.",
        parameters: {
            type: "OBJECT",
            properties: {
                missionId: { type: "STRING", description: "The ID of the mission to break down." },
                tasks: {
                    type: "ARRAY",
                    description: "List of actionable sub-tasks.",
                    items: {
                        type: "OBJECT",
                        properties: {
                            description: { type: "STRING" },
                            priority: { type: "INTEGER", description: "Priority level, higher is more urgent (e.g., 1-5)." }
                        },
                        required: ["description"]
                    }
                }
            },
            required: ["missionId", "tasks"]
        }
    },
    {
        name: "update_task_status",
        description: "Updates the status of a specific sub-task within a mission.",
        parameters: {
            type: "OBJECT",
            properties: {
                taskId: { type: "STRING", description: "The ID of the task." },
                status: { type: "STRING", description: "New status ('todo', 'in-progress', 'done')." }
            },
            required: ["taskId", "status"]
        }
    },
    {
        name: "add_mission_context",
        description: "Appends new findings, research, or notes to a mission's running context summary.",
        parameters: {
            type: "OBJECT",
            properties: {
                missionId: { type: "STRING" },
                context: { type: "STRING", description: "Markdown text holding the new information to append." }
            },
            required: ["missionId", "context"]
        }
    },
    {
        name: "list_active_missions",
        description: "Retrieves all currently active long-term missions and their tasks.",
        parameters: {
            type: "OBJECT",
            properties: {},
            required: []
        }
    }
];

export async function createMission(args: any) {
    const { title, description, targetDeadline } = args;
    const active = dbQueries.getMissions("active");
    if (active.length >= 5) {
        return "Warning: You already have 5 active missions. Please complete or pause one before starting a new one.";
    }
    const id = `mission-${randomUUID().slice(0, 8)}`;
    dbQueries.createMission({ id, title, description, targetDeadline });
    return `Mission created with ID: ${id}`;
}

export async function breakdownMission(args: any) {
    const { missionId, tasks } = args;
    const addedTaskIds = [];
    for (const t of tasks) {
        const id = `task-${randomUUID().slice(0, 8)}`;
        dbQueries.createMissionTask({ id, missionId, description: t.description, priority: t.priority || 1 });
        addedTaskIds.push(id);
    }
    return `Added ${tasks.length} tasks to mission ${missionId}. Task IDs: ${addedTaskIds.join(", ")}`;
}

export async function updateTaskStatus(args: any) {
    const { taskId, status } = args;
    dbQueries.updateMissionTaskStatus(taskId, status);
    return `Task ${taskId} status updated to ${status}.`;
}

export async function addMissionContext(args: any) {
    const { missionId, context } = args;
    dbQueries.updateMissionContext(missionId, context);
    return `Context successfully appended to mission ${missionId}.`;
}

export async function listActiveMissions() {
    const activeMissions = dbQueries.getMissions("active");
    for (const m of activeMissions as any[]) {
        m.tasks = dbQueries.getMissionTasks(m.id);
    }
    return JSON.stringify(activeMissions, null, 2);
}
