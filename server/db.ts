import { sql } from "bun";
import type { MessagePayload, UserPayload } from "../shared/types";

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
  return rows[0] ?? null;
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

export async function findUserById(
  id: string
): Promise<UserPayload | null> {
  const rows = await sql`
    SELECT id, username FROM users WHERE id = ${id} LIMIT 1
  `;
  return (rows[0] as UserPayload) ?? null;
}

// ── Messages ──

export async function saveMessage(
  senderId: string,
  content: string
): Promise<{ id: string }> {
  const rows = await sql`
    INSERT INTO messages (sender_id, content)
    VALUES (${senderId}, ${content})
    RETURNING id
  `;
  return rows[0] as { id: string };
}

export async function getRecentMessages(limit = 50): Promise<MessagePayload[]> {
  const rows = await sql`
    SELECT
      m.id,
      m.content,
      m.sender_id   AS "senderId",
      u.username    AS "senderName",
      m.created_at  AS "createdAt",
      COALESCE(
        ARRAY_AGG(u2.username) FILTER (WHERE u2.username IS NOT NULL),
        '{}'
      ) AS "seenBy"
    FROM messages m
    JOIN users u ON u.id = m.sender_id
    LEFT JOIN message_reads mr ON mr.message_id = m.id
    LEFT JOIN users u2 ON u2.id = mr.user_id
    GROUP BY m.id, u.username
    ORDER BY m.created_at ASC
    LIMIT ${limit}
  `;
  return rows as MessagePayload[];
}

// ── Message reads ──

export async function markMessagesRead(
  userId: string,
  lastMessageId: string
): Promise<string[]> {
  // Mark all messages up to and including lastMessageId as read by this user
  await sql`
    INSERT INTO message_reads (message_id, user_id)
    SELECT m.id, ${userId}
    FROM messages m
    WHERE m.created_at <= (
      SELECT created_at FROM messages WHERE id = ${lastMessageId}
    )
    ON CONFLICT DO NOTHING
  `;

  // Return the list of usernames who have seen this specific message
  const rows = await sql`
    SELECT u.username
    FROM message_reads mr
    JOIN users u ON u.id = mr.user_id
    WHERE mr.message_id = ${lastMessageId}
  `;
  return rows.map((r: any) => r.username);
}