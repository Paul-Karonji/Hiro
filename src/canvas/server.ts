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

    // Send a welcome ping
    ws.send(
      JSON.stringify({
        type: "widget",
        title: "Canvas Ready",
        html: `<div style="text-align:center;padding:40px;color:#a78bfa;font-family:sans-serif;">
          <div style="font-size:48px;margin-bottom:16px;">🎨</div>
          <h2 style="margin:0 0 8px">Hiro Live Canvas</h2>
          <p style="opacity:0.6;margin:0">Connected · Waiting for widgets from Hiro…</p>
        </div>`,
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
