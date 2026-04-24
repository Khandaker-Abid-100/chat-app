// // ── Messages FROM client TO server ──
// export type ClientMessage =
//   | { type: "join_room"; roomId: string }
//   | { type: "send_message"; roomId: string; content: string }
//   | { type: "mark_read"; roomId: string; lastMessageId: string };

// // ── Messages FROM server TO client ──
// export type ServerMessage =
//   | { type: "new_message"; message: MessagePayload }
//   | { type: "seen_update"; messageId: string; seenBy: string[] }
//   | { type: "room_created"; room: RoomPayload }
//   | { type: "error"; message: string };

// // ── Shared data shapes ──
// export type MessagePayload = {
//   id: string;
//   roomId: string;
//   content: string;
//   senderId: string;
//   senderName: string;
//   createdAt: string;
//   seenBy: string[];
// };

// export type UserPayload = {
//   id: string;
//   username: string;
// };

// export type RoomPayload = {
//   id: string;
//   name: string;
//   createdAt: string;
//   unreadCount: number;
// };
// ── Messages FROM client TO server ──
export type ClientMessage =
  | { type: "auth"; token: string }
  | { type: "join_room"; roomId: string }
  | { type: "send_message"; roomId: string; content: string }
  | { type: "mark_read"; roomId: string; lastMessageId: string };

// ── Messages FROM server TO client ──
export type ServerMessage =
  | { type: "auth_ok" }
  | { type: "new_message"; message: MessagePayload }
  | { type: "seen_update"; messageId: string; seenBy: string[] }
  | { type: "room_created"; room: RoomPayload }
  | { type: "error"; message: string };

// ── Shared data shapes ──
export type MessagePayload = {
  id: string;
  roomId: string;
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

export type RoomPayload = {
  id: string;
  name: string;
  createdAt: string;
  unreadCount: number;
  inviteCode?: string;
  isOwner?: boolean;
};
export type InvitationPayload = {
  id: string;
  roomId: string;
  roomName: string;
  invitedBy: string;
  createdAt: string;
  accepted: boolean;
};
