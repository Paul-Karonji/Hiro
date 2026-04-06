import type { RuntimeTool } from "../core/types";
import { getAppContext } from "../core/appContext";

export const usageSummaryDeclaration = {
  name: "get_usage_summary",
  description:
    "Retrieve Hiro's own token usage statistics: total calls, input tokens, output tokens, estimated cost, and average latency — grouped by model. " +
    "Use this whenever the user asks about token usage, API cost, model usage stats, or asks you to chart/visualize usage data. " +
    "Returns structured JSON you can use to build a chart or table.",
  parameters: {
    type: "object",
    properties: {
      limit: {
        type: "number",
        description: "Maximum number of recent individual entries to include in the raw log (default 10). Set to 0 to skip raw log.",
      },
    },
    additionalProperties: false,
  },
};

export const usageSummaryTool: RuntimeTool = {
  definition: usageSummaryDeclaration,
  async execute(args) {
    const tracker = getAppContext().usageTracker;
    const summary = tracker.getSummary();
    const limit = typeof args.limit === "number" ? args.limit : 10;
    const recent = limit > 0 ? tracker.getRecent(limit) : [];

    if (summary.length === 0) {
      return "No usage data recorded yet. Start chatting and try again after a few messages.";
    }

    const result = {
      summary: summary.map((row) => ({
        model: row.model,
        calls: row.calls,
        inputTokens: row.totalInputTokens,
        outputTokens: row.totalOutputTokens,
        totalTokens: row.totalInputTokens + row.totalOutputTokens,
        estimatedCostUsd: Number(row.totalCostUsd.toFixed(6)),
        avgLatencyMs: Math.round(row.avgLatencyMs),
      })),
      recent: recent.slice(0, limit),
      totals: {
        calls: summary.reduce((s, r) => s + r.calls, 0),
        inputTokens: summary.reduce((s, r) => s + r.totalInputTokens, 0),
        outputTokens: summary.reduce((s, r) => s + r.totalOutputTokens, 0),
        totalTokens: summary.reduce((s, r) => s + r.totalInputTokens + r.totalOutputTokens, 0),
        estimatedCostUsd: Number(summary.reduce((s, r) => s + r.totalCostUsd, 0).toFixed(6)),
      },
    };

    return JSON.stringify(result, null, 2);
  },
};
