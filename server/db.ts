import { sql } from "bun";
import type { MessagePayload, RoomPayload, UserPayload } from "../shared/types";

// ── Users ──

export async function findUserByUsername(
  username: string
): Promise<{ id: string; username: string; password_hash: string } | null> {
  const rows = await sql`
    SELECT id, username, password_hash
    FROM users
    WHERE username = ${username}
    LIMIT 1
  `;
  return (rows[0] as { id: string; username: string; password_hash: string }) ?? null;
}

export async function createUser(
  username: string,
  passwordHash: string
): Promise<UserPayload> {
  const rows = await sql`
    INSERT INTO users (username, password_hash)
    VALUES (${username}, ${passwordHash})
    RETURNING id, username
  `;
  return rows[0] as UserPayload;
}

export async function findUserById(id: string): Promise<UserPayload | null> {
  const rows = await sql`
    SELECT id, username FROM users WHERE id = ${id} LIMIT 1
  `;
  return (rows[0] as UserPayload) ?? null;
}

// ── Rooms ──

export async function getAllRooms(userId: string): Promise<RoomPayload[]> {
  // Get all rooms with unread count for this user
  const rows = await sql`
    SELECT
      r.id,
      r.name,
      r.created_at AS "createdAt",
      COUNT(m.id) FILTER (
        WHERE m.id NOT IN (
          SELECT message_id FROM message_reads WHERE user_id = ${userId}
        )
        AND m.sender_id != ${userId}
      ) AS "unreadCount"
    FROM rooms r
    LEFT JOIN messages m ON m.room_id = r.id
    GROUP BY r.id
    ORDER BY r.created_at ASC
  `;
  return rows.map((r: any) => ({
    ...r,
    unreadCount: Number(r.unreadCount),
  })) as RoomPayload[];
}

export async function createRoom(name: string): Promise<RoomPayload> {
  const rows = await sql`
    INSERT INTO rooms (name)
    VALUES (${name})
    RETURNING id, name, created_at AS "createdAt"
  `;
  return { ...(rows[0] as any), unreadCount: 0 } as RoomPayload;
}

export async function joinRoom(roomId: string, userId: string): Promise<void> {
  await sql`
    INSERT INTO room_members (room_id, user_id)
    VALUES (${roomId}, ${userId})
    ON CONFLICT DO NOTHING
  `;
}

export async function findRoomById(roomId: string): Promise<RoomPayload | null> {
  const rows = await sql`
    SELECT id, name, created_at AS "createdAt"
    FROM rooms WHERE id = ${roomId} LIMIT 1
  `;
  if (!rows[0]) return null;
  return { ...(rows[0] as any), unreadCount: 0 } as RoomPayload;
}

// ── Messages ──

export async function saveMessage(
  roomId: string,
  senderId: string,
  content: string
): Promise<{ id: string }> {
  const rows = await sql`
    INSERT INTO messages (room_id, sender_id, content)
    VALUES (${roomId}, ${senderId}, ${content})
    RETURNING id
  `;
  return rows[0] as { id: string };
}

export async function getMessagesByRoom(
  roomId: string,
  limit = 50
): Promise<MessagePayload[]> {
  const rows = await sql`
    SELECT
      m.id,
      m.room_id       AS "roomId",
      m.content,
      m.sender_id     AS "senderId",
      u.username      AS "senderName",
      m.created_at    AS "createdAt",
      COALESCE(
        ARRAY_AGG(u2.username) FILTER (WHERE u2.username IS NOT NULL),
        '{}'
      ) AS "seenBy"
    FROM messages m
    JOIN users u ON u.id = m.sender_id
    LEFT JOIN message_reads mr ON mr.message_id = m.id
    LEFT JOIN users u2 ON u2.id = mr.user_id
    WHERE m.room_id = ${roomId}
    GROUP BY m.id, u.username
    ORDER BY m.created_at ASC
    LIMIT ${limit}
  `;
  return rows as MessagePayload[];
}

// ── Mark messages as read ──

export async function markMessagesRead(
  userId: string,
  roomId: string,
  lastMessageId: string
): Promise<string[]> {
  // Mark all messages in this room up to lastMessageId as read
  await sql`
    INSERT INTO message_reads (message_id, user_id)
    SELECT m.id, ${userId}
    FROM messages m
    WHERE m.room_id = ${roomId}
      AND m.created_at <= (
        SELECT created_at FROM messages WHERE id = ${lastMessageId}
      )
    ON CONFLICT DO NOTHING
  `;

  // Return usernames who have seen this specific message
  const rows = await sql`
    SELECT u.username
    FROM message_reads mr
    JOIN users u ON u.id = mr.user_id
    WHERE mr.message_id = ${lastMessageId}
  `;
  return rows.map((r: any) => r.username);
}