import { WebSocketServer, type WebSocket } from "ws";
import type { Server as HttpServer } from "http";
import { isAuthorizedOperatorRequest } from "../serverAuth";

export interface CanvasPayload {
  type: "widget";
  title?: string;
  html: string;
  timestamp: string;
}

const clients = new Set<WebSocket>();

/**
 * Broadcasts a canvas payload to all connected browser clients.
 */
export function broadcastToCanvas(payload: Omit<CanvasPayload, "timestamp">): void {
  const message = JSON.stringify({ ...payload, timestamp: new Date().toISOString() });

  for (const client of clients) {
    if (client.readyState === 1 /* OPEN */) {
      client.send(message, (err) => {
        if (err) {
          console.warn("[Canvas] Failed to send to client:", err.message);
        }
      });
    }
  }

  console.log(`[Canvas] Broadcast to ${clients.size} client(s): ${payload.title ?? "widget"}`);
}

function buildWelcomeWidget(): string {
  return `
    <div class="canvas-report canvas-stack">
      <div>
        <span class="canvas-eyebrow">Canvas stream</span>
        <h2>Hiro Live Canvas is online</h2>
        <p class="canvas-note">The browser channel is connected and ready for charts, review tables, research boards, and interactive widgets.</p>
      </div>
      <div class="canvas-grid">
        <div class="canvas-panel">
          <span class="canvas-label">Mode</span>
          <span class="canvas-stat">Live</span>
          <p class="canvas-note">Private operator surface connected over WebSocket.</p>
        </div>
        <div class="canvas-panel">
          <span class="canvas-label">Ready for</span>
          <div class="canvas-badge-row">
            <span class="canvas-badge">Charts</span>
            <span class="canvas-badge">Tables</span>
            <span class="canvas-badge">JavaScript</span>
          </div>
        </div>
      </div>
    </div>
  `.trim();
}

/**
 * Attaches a WebSocket server to the existing HTTP server at path /canvas/ws.
 */
export function initializeCanvasServer(httpServer: HttpServer): void {
  const wss = new WebSocketServer({ server: httpServer, path: "/canvas/ws" });

  wss.on("connection", (ws, req) => {
    if (!isAuthorizedOperatorRequest(req)) {
      ws.close(1008, "Unauthorized");
      return;
    }

    clients.add(ws);
    const ip = req.socket.remoteAddress ?? "unknown";
    console.log(`[Canvas] Client connected from ${ip}. Total: ${clients.size}`);

    ws.send(
      JSON.stringify({
        type: "widget",
        title: "Canvas Ready",
        html: buildWelcomeWidget(),
        timestamp: new Date().toISOString(),
      }),
    );

    ws.on("close", () => {
      clients.delete(ws);
      console.log(`[Canvas] Client disconnected. Total: ${clients.size}`);
    });

    ws.on("error", (err) => {
      console.warn("[Canvas] WebSocket error:", err.message);
      clients.delete(ws);
    });
  });

  console.log("[Canvas] WebSocket server mounted at /canvas/ws");
}
