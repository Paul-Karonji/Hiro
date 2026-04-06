import { broadcastToCanvas } from "../canvas/server";
import { config } from "../config";
import type { RuntimeTool } from "../core/types";

export const renderCanvasDeclaration = {
  name: "render_canvas",
  description:
    "Push an interactive HTML/JS widget, chart, table, or form to the Hiro Live Canvas browser page. " +
    "Use this to create data visualisations, formatted tables, progress dashboards, interactive forms, " +
    "or any rich content that would be better experienced in a browser than in Telegram text. " +
    "The HTML is injected directly into the canvas content area — keep it self-contained with inline styles. " +
    "You may use inline <script> tags for interactivity. Avoid external CDN scripts unless absolutely necessary.",
  parameters: {
    type: "object",
    properties: {
      html: {
        type: "string",
        description:
          "The complete, self-contained HTML/JS snippet to render. " +
          "Use inline styles. Dark theme preferred (background colours like #1a1a2e, text like #e2e0ff). " +
          "For charts, use inline SVG or canvas elements. For tables, use semantic <table> tags.",
      },
      title: {
        type: "string",
        description: "A short human-readable title for the widget (e.g. 'Token Usage Chart', 'Task List'). Shown in the canvas toolbar.",
      },
    },
    required: ["html"],
  },
};

export const renderCanvasTool: RuntimeTool = {
  definition: renderCanvasDeclaration,
  async execute(args) {
    const html = String(args.html || "").trim();
    const title = args.title ? String(args.title).trim() : "Widget";

    if (!html) {
      return "Error: No HTML content provided to render_canvas.";
    }

    broadcastToCanvas({ type: "widget", html, title });

    return `✅ Widget "${title}" pushed to the Live Canvas. Open ${config.PUBLIC_BASE_URL}/canvas to see it.`;
  },
};
