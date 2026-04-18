import { sql, type ServerWebSocket } from "bun";
import { register, login, verifyToken } from "./auth";
import {
  saveMessage,
  getRecentMessages,
  markMessagesRead,
  findUserById,
} from "./db";
import type { ClientMessage, ServerMessage } from "../shared/types";

// ── Connected clients: userId → WebSocket ──
// One user can only have one active connection at a time
const clients = new Map<string, ServerWebSocket<{ userId: string }>>();

// ── Broadcast a message to all connected clients ──
function broadcast(msg: ServerMessage) {
  const json = JSON.stringify(msg);
  for (const ws of clients.values()) {
    ws.send(json);
  }
}

// ── Helper: parse JSON body from a Request ──
async function parseBody<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new Error("Invalid JSON body.");
  }
}

// ── Helper: send a JSON response ──
function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...cors() },
  });
}

// ── Helper: CORS headers for local dev ──
function cors(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  };
}

const server = Bun.serve<{ userId: string }>({
  port: 3001,

  async fetch(req, server) {
    const url = new URL(req.url);
    const method = req.method;

    // Handle CORS preflight
    if (method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors() });
    }

    // ── POST /auth/register ──
    if (method === "POST" && url.pathname === "/auth/register") {
      try {
        const { username, password } = await parseBody<{
          username: string;
          password: string;
        }>(req);
        const result = await register(username, password);
        return json(result, 201);
      } catch (err: any) {
        return json({ error: err.message }, 400);
      }
    }

    // ── POST /auth/login ──
    if (method === "POST" && url.pathname === "/auth/login") {
      try {
        const { username, password } = await parseBody<{
          username: string;
          password: string;
        }>(req);
        const result = await login(username, password);
        return json(result);
      } catch (err: any) {
        return json({ error: err.message }, 401);
      }
    }

    // ── GET /messages — fetch recent chat history ──
    if (method === "GET" && url.pathname === "/messages") {
      const authHeader = req.headers.get("Authorization") ?? "";
      const token = authHeader.replace("Bearer ", "");
      const user = await verifyToken(token);
      if (!user) return json({ error: "Unauthorized" }, 401);

      const messages = await getRecentMessages(50);
      return json(messages);
    }

    // ── WebSocket upgrade at /ws?token=... ──
    if (url.pathname === "/ws") {
      const token = url.searchParams.get("token") ?? "";
      const user = await verifyToken(token);
      if (!user) return json({ error: "Unauthorized" }, 401);

      const upgraded = server.upgrade(req, {
        data: { userId: user.id },
        headers: {
      "Access-Control-Allow-Origin": "*",
    },
      });
      if (!upgraded) return new Response("WebSocket upgrade failed", { status: 400 });
      return undefined;
    }

    return json({ error: "Not found" }, 404);
  },

  websocket: {
    // ── A user connected ──
    async open(ws) {
      const { userId } = ws.data;
      clients.set(userId, ws);
      console.log(`+ connected userId=${userId}. Online: ${clients.size}`);
    },

    // ── A user sent a message ──
    async message(ws, raw) {
      const { userId } = ws.data;
      let msg: ClientMessage;

      try {
        msg = JSON.parse(raw as string) as ClientMessage;
      } catch {
        ws.send(JSON.stringify({ type: "error", message: "Invalid JSON" } satisfies ServerMessage));
        return;
      }

      if (msg.type === "send_message") {
        if (!msg.content?.trim()) return;

        // Save to DB
        const { id: messageId } = await saveMessage(userId, msg.content.trim());

        // Fetch the saved message with sender info to broadcast
        const user = await findUserById(userId);
        if (!user) return;

        const serverMsg: ServerMessage = {
          type: "new_message",
          message: {
            id: messageId,
            content: msg.content.trim(),
            senderId: userId,
            senderName: user.username,
            createdAt: new Date().toISOString(),
            seenBy: [],
          },
        };

        broadcast(serverMsg);
        return;
      }

      if (msg.type === "mark_read") {
        if (!msg.lastMessageId) return;

        const seenBy = await markMessagesRead(userId, msg.lastMessageId);

        // Notify all clients that someone has seen up to this message
        const update: ServerMessage = {
          type: "seen_update",
          messageId: msg.lastMessageId,
          seenBy,
        };
        broadcast(update);
        return;
      }
    },

    // ── A user disconnected ──
    close(ws) {
      const { userId } = ws.data;
      clients.delete(userId);
      console.log(`- disconnected userId=${userId}. Online: ${clients.size}`);
    },
  },
});

console.log(`Server running on http://localhost:${server.port}`);