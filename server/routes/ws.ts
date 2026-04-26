import type { ServerWebSocket } from "bun";
import { verifyToken } from "../auth";
import {
  saveMessage,
  findUserById,
  joinRoomById,
  markMessagesRead,
  getRoomMemberIds,
} from "../db";
import {
  clients,
  broadcastToRoom,
  addToRoom,
  removeFromAllRooms,
  subscribeToRoom,
} from "../services/broadcast";
import {
  incrementUnreadForRoom,
  clearUnread,
} from "../services/unreadCounter";
import type { ClientMessage, ServerMessage } from "../../shared/types";

const pendingClients = new Map<
  ServerWebSocket<{ userId: string }>,
  ReturnType<typeof setTimeout>
>();

export function handleOpen(ws: ServerWebSocket<{ userId: string }>): void {
  const timeout = setTimeout(() => {
    console.warn("WS closed: no auth message received within 10s");
    ws.close(4001, "Authentication timeout");
  }, 10_000);
  pendingClients.set(ws, timeout);
}

export async function handleMessage(
  ws: ServerWebSocket<{ userId: string }>,
  raw: string | Buffer
): Promise<void> {
  let msg: Record<string, unknown>;

  try {
    msg = JSON.parse(raw as string) as Record<string, unknown>;
  } catch {
    ws.send(
      JSON.stringify({ type: "error", message: "Invalid JSON" } satisfies ServerMessage)
    );
    return;
  }

  // ── Auth handshake ──
  if (pendingClients.has(ws)) {
    if (msg.type !== "auth") {
      ws.close(4002, "First message must be auth");
      return;
    }

    const token = msg.token as string;
    const user = await verifyToken(token);

    if (!user) {
      ws.close(4003, "Invalid or expired token");
      return;
    }

    clearTimeout(pendingClients.get(ws));
    pendingClients.delete(ws);

    (ws.data as { userId: string }).userId = user.id;
    clients.set(user.id, ws);

    console.log(`+ authenticated userId=${user.id}. Online: ${clients.size}`);
    ws.send(JSON.stringify({ type: "auth_ok" } satisfies ServerMessage));
    return;
  }

  const { userId } = ws.data;
  const clientMsg = msg as unknown as ClientMessage;

  // ── join_room ──
  if (clientMsg.type === "join_room") {
    const { roomId } = clientMsg;
    await joinRoomById(roomId, userId);
    addToRoom(roomId, userId);
    await subscribeToRoom(roomId);

    // Clear unread count when user opens a room
    await clearUnread(userId, roomId);

    console.log(`  userId=${userId} joined roomId=${roomId}`);
    return;
  }

  // ── send_message ──
  if (clientMsg.type === "send_message") {
    const { roomId, content } = clientMsg;
    if (!content?.trim()) return;

    const { id: messageId } = await saveMessage(roomId, userId, content.trim());
    const user = await findUserById(userId);
    if (!user) return;

    // Get all room members to increment their unread counts
    const memberIds = await getRoomMemberIds(roomId);

    // Increment unread counts for all members except sender
    // Run in parallel with the broadcast — no need to await
    incrementUnreadForRoom(roomId, userId, memberIds).catch(console.error);

    await broadcastToRoom(roomId, {
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
    });
    return;
  }

  // ── mark_read ──
  if (clientMsg.type === "mark_read") {
    const { roomId, lastMessageId } = clientMsg;
    if (!lastMessageId) return;

    const seenBy = await markMessagesRead(userId, roomId, lastMessageId);

    // Also clear Redis unread count
    await clearUnread(userId, roomId);

    await broadcastToRoom(roomId, {
      type: "seen_update",
      messageId: lastMessageId,
      seenBy,
    });
    return;
  }
}

export function handleClose(ws: ServerWebSocket<{ userId: string }>): void {
  const timeout = pendingClients.get(ws);
  if (timeout) {
    clearTimeout(timeout);
    pendingClients.delete(ws);
  }

  const { userId } = ws.data;
  if (userId) {
    clients.delete(userId);
    removeFromAllRooms(userId);
    console.log(`- disconnected userId=${userId}. Online: ${clients.size}`);
  }
}