import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';

const clients = new Map<string, Set<WebSocket>>();

export function setupRecordingSocket(server: http.Server): void {
  const wss = new WebSocketServer({ server, path: '/ws/recording' });

  wss.on('connection', (ws, req) => {
    const rawUrl = req.url ?? '';
    const url = new URL(rawUrl, 'http://localhost');
    const sessionId = url.searchParams.get('sessionId') ?? '';

    if (!clients.has(sessionId)) {
      clients.set(sessionId, new Set());
    }
    clients.get(sessionId)!.add(ws);

    ws.on('close', () => {
      clients.get(sessionId)?.delete(ws);
      if (clients.get(sessionId)?.size === 0) {
        clients.delete(sessionId);
      }
    });

    ws.on('error', (err) => {
      console.error(`WebSocket error for session ${sessionId}:`, err.message);
    });
  });
}

export function broadcastAction(sessionId: string, action: unknown): void {
  const sessionClients = clients.get(sessionId);
  if (!sessionClients) return;
  const message = JSON.stringify(action);
  sessionClients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  });
}
