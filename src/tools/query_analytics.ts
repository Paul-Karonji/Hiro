import { queryAnalytics } from "../memory/postgres";

export const queryAnalyticsDeclaration = {
    name: "query_analytics",
    description: "Execute read-only SQL SELECT queries against your own Analytics database to answer user statistical questions. Tables available: 'activity_log' (id, timestamp, action, details, status), 'cost_log' (id, timestamp, model, estimated_cost_cents, details).",
    parameters: {
        type: "OBJECT",
        properties: {
            sql_query: {
                type: "STRING",
                description: "A complete Postgres SQL SELECT query to run against the dashboard tables (e.g. 'SELECT count(*) FROM activity_log WHERE status = \\'success\\''). NEVER attempt INSERT or UPDATE."
            }
        },
        required: ["sql_query"]
    }
};

export async function queryAnalyticsExecutor(args: any) {
    const { sql_query } = args;
    console.log(`[Tools] Executing analytics query: "${sql_query}"...`);
    
    if (!sql_query.toLowerCase().trim().startsWith('select')) {
        return "ERROR: You are only permitted to execute SELECT queries on the analytics tables.";
    }

    const results = await queryAnalytics(sql_query);
    
    return `Query Results:\n${JSON.stringify(results, null, 2)}`;
}
