import type { ServerWebSocket } from "bun";
import type { ServerMessage } from "../../shared/types";

// userId → WebSocket
export const clients = new Map<
  string,
  ServerWebSocket<{ userId: string }>
>();

// roomId → Set of userIds currently in that room
export const roomPresence = new Map<string, Set<string>>();

export function broadcastAll(msg: ServerMessage): void {
  const payload = JSON.stringify(msg);
  for (const ws of clients.values()) {
    ws.send(payload);
  }
}

export function broadcastToRoom(roomId: string, msg: ServerMessage): void {
  const payload = JSON.stringify(msg);
  const members = roomPresence.get(roomId);
  if (!members) return;
  for (const userId of members) {
    const ws = clients.get(userId);
    if (ws) ws.send(payload);
  }
}

export function addToRoom(roomId: string, userId: string): void {
  if (!roomPresence.has(roomId)) {
    roomPresence.set(roomId, new Set());
  }
  roomPresence.get(roomId)!.add(userId);
}

export function removeFromAllRooms(userId: string): void {
  for (const members of roomPresence.values()) {
    members.delete(userId);
  }
}