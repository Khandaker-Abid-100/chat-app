import type { ServerWebSocket } from "bun";
import type { ServerMessage } from "../../shared/types";
import { publisher, subscriber, roomChannel, globalChannel } from "./redis";

export const clients = new Map<
  string,
  ServerWebSocket<{ userId: string }>
>();

export const roomPresence = new Map<string, Set<string>>();

const CHUNK_SIZE = 100; // send to 100 connections per tick

// Chunked delivery — yields between chunks so the event loop
// can process other events (new connections, incoming messages)
// between batches. Prevents one large broadcast from blocking
// everything else for hundreds of milliseconds.
async function deliverInChunks(
  userIds: string[],
  payload: string
): Promise<void> {
  for (let i = 0; i < userIds.length; i += CHUNK_SIZE) {
    const chunk = userIds.slice(i, i + CHUNK_SIZE);

    for (const userId of chunk) {
      const ws = clients.get(userId);
      if (ws) ws.send(payload);
    }

    // Yield to the event loop between chunks
    // so other messages and connections are not blocked
    if (i + CHUNK_SIZE < userIds.length) {
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
  }
}

function deliverToLocalRoom(roomId: string, payload: string): void {
  const members = roomPresence.get(roomId);
  if (!members || members.size === 0) return;

  const userIds = Array.from(members);

  if (userIds.length <= CHUNK_SIZE) {
    // Small room — deliver synchronously, no overhead
    for (const userId of userIds) {
      const ws = clients.get(userId);
      if (ws) ws.send(payload);
    }
  } else {
    // Large room — deliver in chunks asynchronously
    deliverInChunks(userIds, payload).catch((err) =>
      console.error("Chunk delivery error:", err)
    );
  }
}

function deliverToAllLocal(payload: string): void {
  const userIds = Array.from(clients.keys());
  if (userIds.length <= CHUNK_SIZE) {
    for (const ws of clients.values()) ws.send(payload);
  } else {
    deliverInChunks(userIds, payload).catch((err) =>
      console.error("Global chunk delivery error:", err)
    );
  }
}

export function initRedisSubscriber(): void {
  subscriber.subscribe(globalChannel, (err) => {
    if (err) console.error("Failed to subscribe to global channel:", err);
    else console.log("Subscribed to Redis global channel");
  });

  subscriber.on("message", (channel: string, payload: string) => {
    if (channel === globalChannel) {
      deliverToAllLocal(payload);
      return;
    }
    if (channel.startsWith("room:")) {
      const roomId = channel.slice(5);
      deliverToLocalRoom(roomId, payload);
    }
  });
}

export async function subscribeToRoom(roomId: string): Promise<void> {
  await subscriber.subscribe(roomChannel(roomId), (err) => {
    if (err) console.error(`Failed to subscribe to ${roomChannel(roomId)}:`, err);
  });
}

export async function unsubscribeFromRoom(roomId: string): Promise<void> {
  const members = roomPresence.get(roomId);
  if (members && members.size > 0) return;
  await subscriber.unsubscribe(roomChannel(roomId));
}

export async function broadcastAll(msg: ServerMessage): Promise<void> {
  await publisher.publish(globalChannel, JSON.stringify(msg));
}

export async function broadcastToRoom(
  roomId: string,
  msg: ServerMessage
): Promise<void> {
  await publisher.publish(roomChannel(roomId), JSON.stringify(msg));
}

export function addToRoom(roomId: string, userId: string): void {
  if (!roomPresence.has(roomId)) {
    roomPresence.set(roomId, new Set());
  }
  roomPresence.get(roomId)!.add(userId);
}

export function removeFromAllRooms(userId: string): void {
  for (const [roomId, members] of roomPresence.entries()) {
    members.delete(userId);
    if (members.size === 0) {
      unsubscribeFromRoom(roomId).catch(console.error);
    }
  }
}