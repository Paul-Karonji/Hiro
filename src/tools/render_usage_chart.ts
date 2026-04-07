import { broadcastToCanvas } from "../canvas/server";
import { getAppContext } from "../core/appContext";
import { config } from "../config";
import type { RuntimeTool } from "../core/types";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export const renderUsageChartDeclaration = {
  name: "render_usage_chart",
  description:
    "Fetch Hiro's token usage stats and immediately render a polished usage board on the Live Canvas. " +
    "Use this whenever the user asks to show, chart, graph, visualise, or render token usage, API cost, or model stats. " +
    "This does everything in one step, so there is no need to call get_usage_summary and render_canvas separately.",
  parameters: {
    type: "object",
    properties: {
      metric: {
        type: "string",
        description:
          "Which metric to show on the chart: 'tokens' for input plus output per model, 'calls' for API call count per model, or 'cost' for estimated USD cost per model. Defaults to 'tokens'.",
      },
    },
    additionalProperties: false,
  },
};

export const renderUsageChartTool: RuntimeTool = {
  definition: renderUsageChartDeclaration,
  async execute(args) {
    const tracker = getAppContext().usageTracker;
    const summary = tracker.getSummary();
    const metric = String(args.metric || "tokens").toLowerCase();

    if (summary.length === 0) {
      return "No usage data recorded yet - chat a bit more and try again.";
    }

    const labels = summary.map((record) =>
      record.model.replace("openrouter:", "or:").replace("google:", "ggl:"),
    );

    let values: number[];
    let chartTitle: string;
    let colorPalette: string[];

    if (metric === "calls") {
      values = summary.map((record) => record.calls);
      chartTitle = "API Calls per Model";
      colorPalette = ["#58c6b5", "#d6ad75", "#7ba6ff", "#f0897e", "#8fd5ff"];
    } else if (metric === "cost") {
      values = summary.map((record) => parseFloat(record.totalCostUsd.toFixed(6)));
      chartTitle = "Estimated Cost per Model";
      colorPalette = ["#d6ad75", "#58c6b5", "#f0897e", "#7ba6ff", "#8fd5ff"];
    } else {
      values = summary.map((record) => record.totalInputTokens + record.totalOutputTokens);
      chartTitle = "Total Tokens per Model";
      colorPalette = ["#58c6b5", "#7ba6ff", "#d6ad75", "#f0897e", "#8fd5ff"];
    }

    const maxVal = Math.max(...values, 1);
    const totals = {
      calls: summary.reduce((sum, record) => sum + record.calls, 0),
      inputTokens: summary.reduce((sum, record) => sum + record.totalInputTokens, 0),
      outputTokens: summary.reduce((sum, record) => sum + record.totalOutputTokens, 0),
      costUsd: summary.reduce((sum, record) => sum + record.totalCostUsd, 0).toFixed(6),
    };

    const barRows = labels
      .map((label, index) => {
        const pct = Math.max(6, Math.round((values[index] / maxVal) * 100));
        const color = colorPalette[index % colorPalette.length];
        const displayValue =
          metric === "cost" ? `$${values[index].toFixed(6)}` : values[index].toLocaleString();

        return `
          <div class="usage-row">
            <div class="usage-row-head">
              <span class="usage-label">${escapeHtml(label)}</span>
              <span class="usage-value" style="color:${color}">${escapeHtml(displayValue)}</span>
            </div>
            <div class="usage-track">
              <div class="usage-fill" style="width:${pct}%;background:linear-gradient(90deg, ${color}88, ${color});">
                <span>${pct}%</span>
              </div>
            </div>
          </div>
        `;
      })
      .join("");

    const html = `
      <style>
        .usage-board { display:grid; gap:22px; }
        .usage-head { display:grid; gap:10px; }
        .usage-rows { display:grid; gap:14px; }
        .usage-row { display:grid; gap:8px; }
        .usage-row-head { display:flex; justify-content:space-between; gap:14px; align-items:flex-end; }
        .usage-label { color: var(--muted-strong, #b6c7d8); font-family: var(--mono, monospace); font-size: 0.78rem; letter-spacing: 0.04em; }
        .usage-value { font-weight: 700; font-size: 0.92rem; }
        .usage-track { height: 20px; border-radius: 999px; border: 1px solid var(--line, rgba(154,181,204,.18)); background: rgba(255,255,255,0.04); overflow: hidden; }
        .usage-fill { height: 100%; border-radius: 999px; display:flex; align-items:center; justify-content:flex-end; padding: 0 10px; min-width: fit-content; }
        .usage-fill span { font-size: 0.68rem; color: #07121b; font-weight: 800; letter-spacing: 0.04em; }
      </style>
      <div class="canvas-report usage-board">
        <div class="usage-head">
          <span class="canvas-eyebrow">Usage telemetry</span>
          <h1>${escapeHtml(chartTitle)}</h1>
          <p class="canvas-note">Snapshot generated at ${escapeHtml(new Date().toLocaleString())}. Use this board to compare model load, spend, and throughput at a glance.</p>
        </div>

        <div class="canvas-grid">
          <div class="canvas-panel">
            <span class="canvas-label">Total calls</span>
            <span class="canvas-stat">${totals.calls}</span>
            <p class="canvas-note">All tracked model invocations in the current runtime summary.</p>
          </div>
          <div class="canvas-panel">
            <span class="canvas-label">Total tokens</span>
            <span class="canvas-stat">${(totals.inputTokens + totals.outputTokens).toLocaleString()}</span>
            <p class="canvas-note">Combined input and output tokens across all visible models.</p>
          </div>
          <div class="canvas-panel">
            <span class="canvas-label">Estimated cost</span>
            <span class="canvas-stat">$${totals.costUsd}</span>
            <p class="canvas-note">Estimated USD cost from the current usage tracker snapshot.</p>
          </div>
        </div>

        <div class="canvas-panel">
          <span class="canvas-label">Per-model distribution</span>
          <div class="usage-rows">
            ${barRows}
          </div>
        </div>

        <div class="canvas-badge-row">
          <span class="canvas-badge">Metric: ${escapeHtml(metric)}</span>
          <span class="canvas-badge">Models: ${summary.length}</span>
          <span class="canvas-badge">Canvas board</span>
        </div>
      </div>
    `.trim();

    broadcastToCanvas({ type: "widget", html, title: chartTitle });

    const totalTokens = totals.inputTokens + totals.outputTokens;

    return (
      `Usage chart pushed to the Live Canvas.\n\n` +
      `*${chartTitle}*\n` +
      summary
        .map((record, index) =>
          `${labels[index]}: ${
            metric === "cost"
              ? `$${record.totalCostUsd.toFixed(6)}`
              : metric === "calls"
                ? `${record.calls} calls`
                : `${(record.totalInputTokens + record.totalOutputTokens).toLocaleString()} tokens`
          }`,
        )
        .join("\n") +
      `\n\n*Totals:* ${totals.calls} calls, ${totalTokens.toLocaleString()} tokens, $${totals.costUsd}\n` +
      `Open ${config.PUBLIC_BASE_URL}/canvas to see the chart.`
    );
  },
};
