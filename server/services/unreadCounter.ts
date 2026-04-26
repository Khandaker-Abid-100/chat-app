import { publisher } from "./redis";

// Redis key pattern: unread:{userId}:{roomId}
function unreadKey(userId: string, roomId: string): string {
  return `unread:${userId}:${roomId}`;
}

// Called when a new message is saved.
// Increments unread count for every room member except the sender.
export async function incrementUnreadForRoom(
  roomId: string,
  senderUserId: string,
  memberUserIds: string[]
): Promise<void> {
  const pipeline = publisher.pipeline();

  for (const userId of memberUserIds) {
    if (userId === senderUserId) continue;
    pipeline.incr(unreadKey(userId, roomId));
  }

  await pipeline.exec();
}

// Called when a user opens a room.
// Resets their unread count for that room to zero.
export async function clearUnread(
  userId: string,
  roomId: string
): Promise<void> {
  await publisher.del(unreadKey(userId, roomId));
}

// Called when loading the room list.
// Returns unread counts for all rooms for a user in one Redis round trip.
export async function getUnreadCounts(
  userId: string,
  roomIds: string[]
): Promise<Record<string, number>> {
  if (roomIds.length === 0) return {};

  const pipeline = publisher.pipeline();
  for (const roomId of roomIds) {
    pipeline.get(unreadKey(userId, roomId));
  }

  const results = await pipeline.exec();
  const counts: Record<string, number> = {};

  roomIds.forEach((roomId, i) => {
    const result = results?.[i];
    const value = result ? result[1] : null;
    counts[roomId] = value ? parseInt(value as string, 10) : 0;
  });

  return counts;
}