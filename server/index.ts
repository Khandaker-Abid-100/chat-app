import type { ServerWebSocket } from "bun";
import { register, login, verifyToken } from "./auth";
import {
  saveMessage,
  getMessagesByRoom,
  markMessagesRead,
  findUserById,
  getAllRooms,
  createRoom,
  joinRoom,
  findRoomById,
} from "./db";
import type { ClientMessage, ServerMessage } from "../shared/types";

// ── Connected clients: userId → WebSocket ──
const clients = new Map<string, ServerWebSocket<{ userId: string }>>();

// ── Room presence: roomId → Set of userIds currently in that room ──
const roomPresence = new Map<string, Set<string>>();

// ── Broadcast to every user currently in a specific room ──
function broadcastToRoom(roomId: string, msg: ServerMessage) {
  const json = JSON.stringify(msg);
  const members = roomPresence.get(roomId);
  if (!members) return;
  for (const userId of members) {
    const ws = clients.get(userId);
    if (ws) ws.send(json);
  }
}

// ── Broadcast to every connected client ──
function broadcastAll(msg: ServerMessage) {
  const json = JSON.stringify(msg);
  for (const ws of clients.values()) {
    ws.send(json);
  }
}


// ── Parse JSON body from a Request ──
async function parseBody<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new Error("Invalid JSON body.");
  }
}

// ── Send a JSON HTTP response with CORS headers ──
function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    },
  });
}

// ── CORS preflight response ──
function corsPreFlight(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    },
  });
}

const server = Bun.serve<{ userId: string }>({
  port: 3001,

  async fetch(req, server) {
    const url = new URL(req.url);
    const method = req.method;

    // ── CORS preflight ──
    if (method === "OPTIONS") {
      return corsPreFlight();
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

    // ── WebSocket upgrade at /ws?token=... ──
      if (url.pathname === "/ws") {
      const wsToken = url.searchParams.get("token") ?? "";
      try {
        const user = await verifyToken(wsToken);
        if (!user) {
          console.error("WS upgrade rejected: invalid or missing token");
          return json({ error: "Unauthorized" }, 401);
        }
        const upgraded = server.upgrade(req, {
          data: { userId: user.id },
          headers: { "Access-Control-Allow-Origin": "*" },
        });
        if (!upgraded) {
          return new Response("WebSocket upgrade failed", { status: 400 });
        }
        return undefined;
      } catch (err) {
        console.error("WS upgrade error:", err);
        return json({ error: "Internal server error" }, 500);
      }
    }

    // ── Authorization header guard for all HTTP routes below ──
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    const currentUser = await verifyToken(token);
    if (!currentUser) {
      return json({ error: "Unauthorized" }, 401);
    }

    // ── GET /rooms — list all rooms with unread counts ──
    if (method === "GET" && url.pathname === "/rooms") {
      const rooms = await getAllRooms(currentUser.id);
      return json(rooms);
    }

    // ── POST /rooms — create a new room ──
    if (method === "POST" && url.pathname === "/rooms") {
      try {
        const { name } = await parseBody<{ name: string }>(req);
        if (!name?.trim()) throw new Error("Room name is required.");
        const room = await createRoom(name.trim());
        // Creator automatically joins their own room
        await joinRoom(room.id, currentUser.id);
        // Broadcast room creation to all connected clients
        broadcastAll({
          type: "room_created",
          room,
        });
        return json(room, 201);
      } catch (err: any) {
        return json({ error: err.message }, 400);
      }
    }

    // ── POST /rooms/:id/join ──
    const joinMatch = url.pathname.match(/^\/rooms\/([^/]+)\/join$/);
    if (method === "POST" && joinMatch) {
      const roomId = joinMatch[1];
      if (!roomId) return json({ error: "Invalid room ID." }, 400);
      const room = await findRoomById(roomId);
      if (!room) return json({ error: "Room not found." }, 404);
      await joinRoom(roomId, currentUser.id);
      return json({ ok: true });
    }

    // ── GET /rooms/:id/messages ──
    const messagesMatch = url.pathname.match(/^\/rooms\/([^/]+)\/messages$/);
    if (method === "GET" && messagesMatch) {
      const roomId = messagesMatch[1];
      if (!roomId) return json({ error: "Invalid room ID." }, 400);
      const messages = await getMessagesByRoom(roomId, 50);
      return json(messages);
    }

    return json({ error: "Not found" }, 404);
  },

  websocket: {
    // ── User connected ──
    async open(ws) {
      const { userId } = ws.data;
      clients.set(userId, ws);
      console.log(`+ connected userId=${userId}. Online: ${clients.size}`);
    },

    // ── User sent a message ──
    async message(ws, raw) {
      const { userId } = ws.data;
      let msg: ClientMessage;

      try {
        msg = JSON.parse(raw as string) as ClientMessage;
      } catch {
        ws.send(
          JSON.stringify({
            type: "error",
            message: "Invalid JSON",
          } satisfies ServerMessage)
        );
        return;
      }

      // ── join_room: user opened a room ──
      if (msg.type === "join_room") {
        const { roomId } = msg;

        // Record DB membership
        await joinRoom(roomId, userId);

        // Track live presence
        if (!roomPresence.has(roomId)) {
          roomPresence.set(roomId, new Set());
        }
        roomPresence.get(roomId)!.add(userId);

        console.log(`  userId=${userId} joined roomId=${roomId}`);
        return;
      }

      // ── send_message: user sent a chat message ──
      if (msg.type === "send_message") {
        const { roomId, content } = msg;
        if (!content?.trim()) return;

        // Persist to database
        const { id: messageId } = await saveMessage(
          roomId,
          userId,
          content.trim()
        );

        // Fetch sender info for the broadcast payload
        const user = await findUserById(userId);
        if (!user) return;

        const outgoing: ServerMessage = {
          type: "new_message",
          message: {
            id: messageId,
            roomId,
            content: content.trim(),
            senderId: userId,
            senderName: user.username,
            createdAt: new Date().toISOString(),
            seenBy: [],
          },
        };

        // Send only to users currently in this room
        broadcastToRoom(roomId, outgoing);
        return;
      }

      // ── mark_read: user has seen messages up to lastMessageId ──
      if (msg.type === "mark_read") {
        const { roomId, lastMessageId } = msg;
        if (!lastMessageId) return;

        const seenBy = await markMessagesRead(userId, roomId, lastMessageId);

        const update: ServerMessage = {
          type: "seen_update",
          messageId: lastMessageId,
          seenBy,
        };

        broadcastToRoom(roomId, update);
        return;
      }
    },

    // ── User disconnected ──
    close(ws) {
      const { userId } = ws.data;
      clients.delete(userId);

      // Remove from all room presence sets
      for (const members of roomPresence.values()) {
        members.delete(userId);
      }

      console.log(`- disconnected userId=${userId}. Online: ${clients.size}`);
    },
  },
});

console.log(`Server running on http://localhost:${server.port}`);