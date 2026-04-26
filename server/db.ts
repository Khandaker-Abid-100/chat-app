import { sql } from "bun";
import type {
  MessagePayload,
  RoomPayload,
  UserPayload,
  InvitationPayload,
} from "../shared/types";

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

export async function searchUsersByUsername(
  query: string,
  excludeUserId: string
): Promise<UserPayload[]> {
  const rows = await sql`
    SELECT id, username FROM users
    WHERE username ILIKE ${"%" + query + "%"}
      AND id != ${excludeUserId}
    LIMIT 10
  `;
  return rows as UserPayload[];
}

// ── Rooms ──

export async function getAllRoomsForUser(userId: string): Promise<Omit<RoomPayload, 'unreadCount'>[]> {
  const rows = await sql`
    SELECT
      r.id,
      r.name,
      r.invite_code AS "inviteCode",
      r.created_at  AS "createdAt",
      EXISTS (
        SELECT 1 FROM room_members rm2
        WHERE rm2.room_id = r.id
          AND rm2.user_id = ${userId}
          AND rm2.joined_at = (
            SELECT MIN(joined_at) FROM room_members WHERE room_id = r.id
          )
      ) AS "isOwner"
    FROM rooms r
    INNER JOIN room_members rm ON rm.room_id = r.id AND rm.user_id = ${userId}
    GROUP BY r.id
    ORDER BY r.created_at ASC
  `;
  return rows as Omit<RoomPayload, 'unreadCount'>[];
}
export async function getRoomMemberIds(roomId: string): Promise<string[]> {
  const rows = await sql`
    SELECT user_id FROM room_members WHERE room_id = ${roomId}
  `;
  return rows.map((r: any) => r.user_id);
}
export async function createRoom(
  name: string,
  creatorId: string
): Promise<RoomPayload> {
  // Generate a unique 6-character invite code
  const inviteCode = Math.random().toString(36).slice(2, 8).toUpperCase();

  const rows = await sql`
    INSERT INTO rooms (name, invite_code)
    VALUES (${name}, ${inviteCode})
    RETURNING id, name, invite_code AS "inviteCode", created_at AS "createdAt"
  `;

  const room = rows[0] as RoomPayload & { inviteCode: string };

  // Creator automatically becomes first member
  await sql`
    INSERT INTO room_members (room_id, user_id)
    VALUES (${room.id}, ${creatorId})
  `;

  return { ...room, unreadCount: 0, isOwner: true };
}

export async function findRoomById(roomId: string): Promise<RoomPayload | null> {
  const rows = await sql`
    SELECT id, name, invite_code AS "inviteCode", created_at AS "createdAt"
    FROM rooms WHERE id = ${roomId} LIMIT 1
  `;
  if (!rows[0]) return null;
  return { ...(rows[0] as any), unreadCount: 0 } as RoomPayload;
}

export async function findRoomByInviteCode(
  code: string
): Promise<RoomPayload | null> {
  const rows = await sql`
    SELECT id, name, invite_code AS "inviteCode", created_at AS "createdAt"
    FROM rooms
    WHERE invite_code = ${code.toUpperCase()}
    LIMIT 1
  `;
  if (!rows[0]) return null;
  return { ...(rows[0] as any), unreadCount: 0 } as RoomPayload;
}

export async function regenerateInviteCode(
  roomId: string
): Promise<string> {
  const newCode = Math.random().toString(36).slice(2, 8).toUpperCase();
  await sql`
    UPDATE rooms SET invite_code = ${newCode} WHERE id = ${roomId}
  `;
  return newCode;
}

// ── Room membership ──

export async function checkRoomMembership(
  roomId: string,
  userId: string
): Promise<boolean> {
  const rows = await sql`
    SELECT 1 FROM room_members
    WHERE room_id = ${roomId} AND user_id = ${userId}
    LIMIT 1
  `;
  return rows.length > 0;
}

export async function isRoomOwner(
  roomId: string,
  userId: string
): Promise<boolean> {
  // Owner is the user with the earliest joined_at in this room
  const rows = await sql`
    SELECT user_id FROM room_members
    WHERE room_id = ${roomId}
    ORDER BY joined_at ASC
    LIMIT 1
  `;
  return rows.length > 0 && (rows[0] as any).user_id === userId;
}

export async function joinRoomById(
  roomId: string,
  userId: string
): Promise<void> {
  await sql`
    INSERT INTO room_members (room_id, user_id)
    VALUES (${roomId}, ${userId})
    ON CONFLICT DO NOTHING
  `;
}

export async function joinRoomByCode(
  code: string,
  userId: string
): Promise<RoomPayload | null> {
  const room = await findRoomByInviteCode(code);
  if (!room) return null;
  await joinRoomById(room.id, userId);
  return room;
}

export async function getRoomMembers(roomId: string): Promise<UserPayload[]> {
  const rows = await sql`
    SELECT u.id, u.username
    FROM room_members rm
    JOIN users u ON u.id = rm.user_id
    WHERE rm.room_id = ${roomId}
    ORDER BY rm.joined_at ASC
  `;
  return rows as UserPayload[];
}

// ── Invitations ──

export async function createInvitation(
  roomId: string,
  invitedBy: string,
  invitedUsername: string
): Promise<void> {
  // Check the user exists
  const user = await findUserByUsername(invitedUsername);
  if (!user) throw new Error(`User "${invitedUsername}" not found.`);

  // Check they are not already a member
  const alreadyMember = await checkRoomMembership(roomId, user.id);
  if (alreadyMember) throw new Error(`${invitedUsername} is already in this room.`);

  await sql`
    INSERT INTO invitations (room_id, invited_by, invited_username)
    VALUES (${roomId}, ${invitedBy}, ${invitedUsername})
    ON CONFLICT DO NOTHING
  `;
}

export async function getPendingInvitations(
  username: string
): Promise<InvitationPayload[]> {
  const rows = await sql`
    SELECT
      i.id,
      i.room_id       AS "roomId",
      r.name          AS "roomName",
      u.username      AS "invitedBy",
      i.created_at    AS "createdAt",
      i.accepted
    FROM invitations i
    JOIN rooms r ON r.id = i.room_id
    JOIN users u ON u.id = i.invited_by
    WHERE i.invited_username = ${username}
      AND i.accepted = FALSE
    ORDER BY i.created_at DESC
  `;
  return rows as InvitationPayload[];
}

export async function acceptInvitation(
  invitationId: string,
  username: string
): Promise<RoomPayload | null> {
  const rows = await sql`
    SELECT i.room_id, i.invited_username
    FROM invitations i
    WHERE i.id = ${invitationId}
      AND i.invited_username = ${username}
      AND i.accepted = FALSE
    LIMIT 1
  `;

  if (!rows[0]) return null;

  const { room_id: roomId } = rows[0] as { room_id: string };

  // Get the user id
  const user = await findUserByUsername(username);
  if (!user) return null;

  // Add to room members and mark invitation accepted in a transaction
  await sql.begin(async (tx) => {
    await tx`
      INSERT INTO room_members (room_id, user_id)
      VALUES (${roomId}, ${user.id})
      ON CONFLICT DO NOTHING
    `;
    await tx`
      UPDATE invitations SET accepted = TRUE WHERE id = ${invitationId}
    `;
  });

  return findRoomById(roomId);
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
  limit = 50,
  // Cursor is the created_at timestamp of the oldest message the client has.
  // Null means first load — return the most recent messages.
  beforeCursor?: string
): Promise<{ messages: MessagePayload[]; nextCursor: string | null }> {
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
      ${beforeCursor
        ? sql`AND m.created_at < ${beforeCursor}::timestamptz`
        : sql``
      }
    GROUP BY m.id, u.username, m.created_at
    ORDER BY m.created_at DESC
    LIMIT ${limit + 1}
  `;

  const all = rows as MessagePayload[];

// If we got limit+1 rows there are more pages
const hasMore = all.length > limit;
const messages = hasMore ? all.slice(0, limit) : all;

// Return in ascending order so the UI renders oldest → newest
messages.reverse();

// The cursor is the oldest message's timestamp (first after reverse)
// We check messages[0] explicitly to satisfy TypeScript
const oldestMessage = messages[0];
const nextCursor = hasMore && oldestMessage ? oldestMessage.createdAt : null;

return { messages, nextCursor };
}

export async function markMessagesRead(
  userId: string,
  roomId: string,
  lastMessageId: string
): Promise<string[]> {
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

  const rows = await sql`
    SELECT u.username
    FROM message_reads mr
    JOIN users u ON u.id = mr.user_id
    WHERE mr.message_id = ${lastMessageId}
  `;
  return rows.map((r: any) => r.username);
}