// ── WebSocket messages sent FROM the client TO the server ──

export type ClientMessage =
  | { type: "send_message"; content: string }
  | { type: "mark_read"; lastMessageId: string };

// ── WebSocket messages sent FROM the server TO the client ──

export type ServerMessage =
  | { type: "new_message"; message: MessagePayload }
  | { type: "seen_update"; messageId: string; seenBy: string[] }
  | { type: "error"; message: string };

// ── Shared data shapes ──

export type MessagePayload = {
  id: string;
  content: string;
  senderId: string;
  senderName: string;
  createdAt: string;
  seenBy: string[];
};

export type UserPayload = {
  id: string;
  username: string;
};