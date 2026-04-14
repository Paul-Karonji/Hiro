import { WebSocketServer, type WebSocket } from "ws";
import type { Server as HttpServer } from "http";
import { isAuthorizedOperatorRequest } from "../serverAuth";

const WIDGET_CACHE_SIZE = 10;

export interface CanvasPayload {
  type: "widget" | "append" | "clear" | "chat_reply";
  title?: string;
  html?: string;
  text?: string;
  timestamp: string;
}

const clients = new Set<WebSocket>();
const widgetCache: CanvasPayload[] = [];

export function getLastWidgetTimestamp(): string | null {
  return widgetCache.length > 0 ? widgetCache[0]!.timestamp : null;
}

/**
 * Broadcasts a canvas payload to all connected browser clients.
 * Widget-type payloads are cached for replay on reconnect.
 */
export function broadcastToCanvas(payload: Omit<CanvasPayload, "timestamp">): void {
  const full: CanvasPayload = { ...payload, timestamp: new Date().toISOString() };
  const message = JSON.stringify(full);

  if (payload.type === "widget") {
    widgetCache.unshift(full);
    if (widgetCache.length > WIDGET_CACHE_SIZE) widgetCache.pop();
  } else if (payload.type === "clear") {
    widgetCache.length = 0;
  }

  for (const client of clients) {
    if (client.readyState === 1 /* OPEN */) {
      client.send(message, (err) => {
        if (err) {
          console.warn("[Canvas] Failed to send to client:", err.message);
        }
      });
    }
  }

  console.log(`[Canvas] Broadcast to ${clients.size} client(s): ${payload.type} / ${payload.title ?? ""}`);
}

export function broadcastChatReply(text: string): void {
  broadcastToCanvas({ type: "chat_reply", text });
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

    if (widgetCache.length > 0) {
      ws.send(JSON.stringify(widgetCache[0]), (err) => {
        if (err) console.warn("[Canvas] Replay send failed:", err.message);
      });
    }

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
