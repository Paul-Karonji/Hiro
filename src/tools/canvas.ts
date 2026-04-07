import { broadcastToCanvas } from "../canvas/server";
import { config } from "../config";
import type { RuntimeTool } from "../core/types";

export const renderCanvasDeclaration = {
  name: "render_canvas",
  description:
    "Push an interactive HTML, chart, table, board, or form to the Hiro Live Canvas browser page. " +
    "Use this when the result should be reviewed, compared, operated, or explored in a browser instead of pasted into chat. " +
    "The widget is mounted inside Hiro's operator shell, so prefer semantic HTML over recreating a whole page. " +
    "Inline <script> tags are supported and execute after mount. Avoid external CDN scripts unless absolutely necessary.",
  parameters: {
    type: "object",
    properties: {
      html: {
        type: "string",
        description:
          "A self-contained HTML snippet for the canvas body. " +
          "Use semantic markup with Hiro's built-in utility classes when helpful: canvas-report, canvas-stack, canvas-grid, canvas-panel, canvas-label, canvas-stat, canvas-badge-row, canvas-badge, canvas-table-wrap, canvas-actions, canvas-note, and canvas-divider. " +
          "Do not recreate full-page chrome or reset body styles. For charts, use inline SVG, canvas, or lightweight inline CSS/JS.",
      },
      title: {
        type: "string",
        description: "A short title for the widget, such as 'Token Usage Board' or 'Vendor Comparison Matrix'.",
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

    return `Widget "${title}" pushed to the Live Canvas. Open ${config.PUBLIC_BASE_URL}/canvas to see it.`;
  },
};
