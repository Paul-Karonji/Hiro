import { logActivity } from "../memory/postgres";

export const logActivityDeclaration = {
    name: "log_activity",
    description: "Autonomously log a major action you just completed on behalf of the user to the analytics dashboard. Only use this for significant external actions like scraping a site, analyzing a video, or changing a core configuration.",
    parameters: {
        type: "OBJECT",
        properties: {
            action: {
                type: "STRING",
                description: "A short 2-4 word summary of what you did (e.g. 'Analyzed YouTube Video', 'Extracted Project Scope')."
            },
            details: {
                type: "STRING",
                description: "A longer 1-2 sentence description detailing specifically what information was processed or what step was achieved."
            },
            status: {
                type: "STRING",
                description: "Either 'success', 'failed', or 'pending'."
            }
        },
        required: ["action", "details"]
    }
};

export async function logActivityExecutor(args: any) {
    const { action, details, status = 'success' } = args;
    console.log(`[Tools] Logging analytics action: "${action}"...`);
    
    await logActivity(action, details, status);
    
    return "Action successfully logged to the Neon Postgres dashboard analytics.";
}
