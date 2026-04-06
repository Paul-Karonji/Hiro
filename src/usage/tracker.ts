import { dbQueries } from "../memory/sqlite";
import { estimateCost } from "./costTable";

export interface UsageEntry {
  model: string;
  sessionId: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  latencyMs: number;
  timestamp: string;
}

export interface UsageSummaryRow {
  model: string;
  calls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  avgLatencyMs: number;
}

export class UsageTracker {
  record(params: {
    model: string;
    sessionId: string;
    inputTokens: number;
    outputTokens: number;
    latencyMs: number;
  }): void {
    const estimatedCostUsd = estimateCost(params.model, params.inputTokens, params.outputTokens);

    try {
      dbQueries.addUsageEntry({
        model: params.model,
        sessionId: params.sessionId,
        inputTokens: params.inputTokens,
        outputTokens: params.outputTokens,
        estimatedCostUsd,
        latencyMs: params.latencyMs,
      });
    } catch (err) {
      console.warn("[UsageTracker] Failed to record usage entry:", err);
    }
  }

  getSummary(): UsageSummaryRow[] {
    return dbQueries.getUsageSummary();
  }

  getRecent(limit = 20): UsageEntry[] {
    return dbQueries.getRecentUsage(limit);
  }

  formatReport(): string {
    const rows = this.getSummary();

    if (rows.length === 0) {
      return "📊 *Usage Report*\nNo usage data recorded yet.";
    }

    const lines: string[] = ["📊 *Usage Report* _(estimated costs)_\n"];

    let grandTotalCost = 0;
    let grandTotalCalls = 0;

    for (const row of rows) {
      grandTotalCost += row.totalCostUsd;
      grandTotalCalls += row.calls;

      const costStr =
        row.totalCostUsd > 0 ? `$${row.totalCostUsd.toFixed(5)}` : "free";

      lines.push(
        `🔹 \`${row.model}\`\n` +
          `   Calls: ${row.calls} · In: ${row.totalInputTokens.toLocaleString()} · Out: ${row.totalOutputTokens.toLocaleString()} tokens\n` +
          `   Cost: ${costStr} · Avg latency: ${Math.round(row.avgLatencyMs)}ms`,
      );
    }

    lines.push("");
    lines.push(
      `*Total:* ${grandTotalCalls} calls · Est. cost: ${grandTotalCost > 0 ? "$" + grandTotalCost.toFixed(5) : "free"}`,
    );

    return lines.join("\n");
  }
}

export const usageTracker = new UsageTracker();
