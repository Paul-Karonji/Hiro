import { broadcastToCanvas } from "../canvas/server";
import { getAppContext } from "../core/appContext";
import { config } from "../config";
import type { RuntimeTool } from "../core/types";

export const renderUsageChartDeclaration = {
  name: "render_usage_chart",
  description:
    "Fetch Hiro's token usage stats and immediately render an interactive bar chart on the Live Canvas. " +
    "Use this whenever the user asks to 'show', 'chart', 'graph', 'visualise', or 'render' token usage, API cost, or model stats. " +
    "This does everything in one step - no need to call get_usage_summary and render_canvas separately.",
  parameters: {
    type: "object",
    properties: {
      metric: {
        type: "string",
        description:
          "Which metric to show on the chart: 'tokens' (input+output per model), 'calls' (number of API calls per model), or 'cost' (estimated USD cost per model). Defaults to 'tokens'.",
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

    const labels = summary.map((r) => r.model.replace("openrouter:", "or:").replace("google:", "ggl:"));
    let values: number[];
    let chartTitle: string;
    let colorPalette: string[];

    if (metric === "calls") {
      values = summary.map((r) => r.calls);
      chartTitle = "API Calls per Model";
      colorPalette = ["#7c6be0", "#e06b7c", "#6be0c1", "#e0c16b", "#6baee0"];
    } else if (metric === "cost") {
      values = summary.map((r) => parseFloat(r.totalCostUsd.toFixed(6)));
      chartTitle = "Estimated Cost (USD) per Model";
      colorPalette = ["#e06b7c", "#7c6be0", "#6be0c1", "#e0c16b", "#6baee0"];
    } else {
      values = summary.map((r) => r.totalInputTokens + r.totalOutputTokens);
      chartTitle = "Total Tokens per Model";
      colorPalette = ["#7c6be0", "#6be0c1", "#e06b7c", "#e0c16b", "#6baee0"];
    }

    const maxVal = Math.max(...values, 1);
    const totals = {
      calls: summary.reduce((s, r) => s + r.calls, 0),
      inputTokens: summary.reduce((s, r) => s + r.totalInputTokens, 0),
      outputTokens: summary.reduce((s, r) => s + r.totalOutputTokens, 0),
      costUsd: summary.reduce((s, r) => s + r.totalCostUsd, 0).toFixed(6),
    };

    const barRows = labels
      .map((label, i) => {
        const pct = Math.round((values[i] / maxVal) * 100);
        const color = colorPalette[i % colorPalette.length];
        const displayVal =
          metric === "cost"
            ? `$${values[i].toFixed(6)}`
            : values[i].toLocaleString();

        return `
      <div style="margin-bottom:18px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:5px;">
          <span style="font-size:13px;color:#c5c0f5;font-family:monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:72%">${label}</span>
          <span style="font-size:13px;color:${color};font-weight:700">${displayVal}</span>
        </div>
        <div style="background:#2a2a45;border-radius:6px;height:22px;overflow:hidden;">
          <div style="background:linear-gradient(90deg,${color}cc,${color});width:${pct}%;height:100%;border-radius:6px;transition:width 0.6s ease;display:flex;align-items:center;padding-left:8px;box-sizing:border-box;">
            <span style="font-size:11px;color:#fff;font-weight:600;white-space:nowrap">${pct}%</span>
          </div>
        </div>
      </div>`;
      })
      .join("");

    const html = `
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Inter', sans-serif; background: #0f0f1e; color: #e2e0ff; }
</style>
<div style="font-family:'Inter',sans-serif;background:#13132b;border-radius:14px;padding:26px;color:#e2e0ff;max-width:600px;margin:0 auto;box-shadow:0 4px 32px #0006;">
  <h2 style="font-size:18px;font-weight:700;color:#a78bfa;margin-bottom:6px;">Usage Chart: ${chartTitle}</h2>
  <p style="font-size:12px;color:#7875a8;margin-bottom:22px;">Hiro Live Canvas - ${new Date().toLocaleString()}</p>

  ${barRows}

  <div style="border-top:1px solid #2a2a45;margin-top:22px;padding-top:16px;display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px;">
    <div style="background:#1d1d38;border-radius:10px;padding:12px;text-align:center;">
      <div style="font-size:22px;font-weight:700;color:#7c6be0">${totals.calls}</div>
      <div style="font-size:11px;color:#7875a8;margin-top:3px">Total Calls</div>
    </div>
    <div style="background:#1d1d38;border-radius:10px;padding:12px;text-align:center;">
      <div style="font-size:22px;font-weight:700;color:#6be0c1">${(totals.inputTokens + totals.outputTokens).toLocaleString()}</div>
      <div style="font-size:11px;color:#7875a8;margin-top:3px">Total Tokens</div>
    </div>
    <div style="background:#1d1d38;border-radius:10px;padding:12px;text-align:center;">
      <div style="font-size:22px;font-weight:700;color:#e06b7c">$${totals.costUsd}</div>
      <div style="font-size:11px;color:#7875a8;margin-top:3px">Est. Cost</div>
    </div>
  </div>
</div>`;

    broadcastToCanvas({ type: "widget", html: html.trim(), title: chartTitle });

    const totalTokens = totals.inputTokens + totals.outputTokens;

    return (
      `Usage chart pushed to the Live Canvas.\n\n` +
      `*${chartTitle}*\n` +
      summary
        .map((r, i) =>
          `${labels[i]}: ${
            metric === "cost"
              ? `$${r.totalCostUsd.toFixed(6)}`
              : metric === "calls"
                ? `${r.calls} calls`
                : `${(r.totalInputTokens + r.totalOutputTokens).toLocaleString()} tokens`
          }`
        )
        .join("\n") +
      `\n\n*Totals:* ${totals.calls} calls, ${totalTokens.toLocaleString()} tokens, $${totals.costUsd}\n` +
      `Open ${config.PUBLIC_BASE_URL}/canvas to see the chart.`
    );
  },
};
