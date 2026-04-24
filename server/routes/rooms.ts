import {
  getAllRoomsForUser,
  createRoom,
  findRoomByInviteCode,
  joinRoomByCode,
  joinRoomById,
  checkRoomMembership,
  isRoomOwner,
  getMessagesByRoom,
  getRoomMembers,
  createInvitation,
  getPendingInvitations,
  acceptInvitation,
  searchUsersByUsername,
  regenerateInviteCode,
} from "../db";
import { corsHeaders } from "../middleware/cors";
import { broadcastAll } from "../services/broadcast";
import type { ServerMessage } from "../../shared/types";

function json(data: unknown, status = 200, req?: Request): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...(req ? corsHeaders(req) : {}),
    },
  });
}

async function parseBody<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new Error("Invalid JSON body.");
  }
}

// ── GET /rooms — only rooms the user is a member of ──
export async function handleGetRooms(
  req: Request,
  userId: string
): Promise<Response> {
  const rooms = await getAllRoomsForUser(userId);
  return json(rooms, 200, req);
}

// ── POST /rooms — create room, creator auto-joined ──
export async function handleCreateRoom(
  req: Request,
  userId: string
): Promise<Response> {
  try {
    const { name } = await parseBody<{ name: string }>(req);
    if (!name?.trim()) throw new Error("Room name is required.");
    const room = await createRoom(name.trim(), userId);

    const msg: ServerMessage = { type: "room_created", room };
    broadcastAll(msg);

    return json(room, 201, req);
  } catch (err: any) {
    return json({ error: err.message }, 400, req);
  }
}

// ── POST /rooms/join — join via invite code ──
export async function handleJoinByCode(
  req: Request,
  userId: string
): Promise<Response> {
  try {
    const { code } = await parseBody<{ code: string }>(req);
    if (!code?.trim()) throw new Error("Invite code is required.");

    const room = await joinRoomByCode(code.trim(), userId);
    if (!room) return json({ error: "Invalid invite code." }, 404, req);

    return json(room, 200, req);
  } catch (err: any) {
    return json({ error: err.message }, 400, req);
  }
}

// ── GET /rooms/:id/members ──
export async function handleGetMembers(
  req: Request,
  roomId: string,
  userId: string
): Promise<Response> {
  const isMember = await checkRoomMembership(roomId, userId);
  if (!isMember) return json({ error: "Access denied." }, 403, req);

  const members = await getRoomMembers(roomId);
  return json(members, 200, req);
}

// ── POST /rooms/:id/invite — owner invites a user by username ──
export async function handleInviteUser(
  req: Request,
  roomId: string,
  userId: string
): Promise<Response> {
  const owner = await isRoomOwner(roomId, userId);
  if (!owner) return json({ error: "Only the room owner can invite users." }, 403, req);

  try {
    const { username } = await parseBody<{ username: string }>(req);
    if (!username?.trim()) throw new Error("Username is required.");
    await createInvitation(roomId, userId, username.trim());
    return json({ ok: true }, 200, req);
  } catch (err: any) {
    return json({ error: err.message }, 400, req);
  }
}

// ── POST /rooms/:id/regenerate-code — owner regenerates invite code ──
export async function handleRegenerateCode(
  req: Request,
  roomId: string,
  userId: string
): Promise<Response> {
  const owner = await isRoomOwner(roomId, userId);
  if (!owner) return json({ error: "Only the room owner can regenerate the code." }, 403, req);

  const newCode = await regenerateInviteCode(roomId);
  return json({ inviteCode: newCode }, 200, req);
}

// ── GET /invitations — pending invitations for the current user ──
export async function handleGetInvitations(
  req: Request,
  username: string
): Promise<Response> {
  const invitations = await getPendingInvitations(username);
  return json(invitations, 200, req);
}

// ── POST /invitations/:id/accept ──
export async function handleAcceptInvitation(
  req: Request,
  invitationId: string,
  username: string
): Promise<Response> {
  const room = await acceptInvitation(invitationId, username);
  if (!room) return json({ error: "Invitation not found or already accepted." }, 404, req);
  return json(room, 200, req);
}

// ── GET /rooms/:id/messages — members only ──
export async function handleGetMessages(
  req: Request,
  roomId: string,
  userId: string
): Promise<Response> {
  const isMember = await checkRoomMembership(roomId, userId);
  if (!isMember) {
    return json({ error: "You are not a member of this room." }, 403, req);
  }
  const messages = await getMessagesByRoom(roomId, 50);
  return json(messages, 200, req);
}

// ── GET /users/search?q=... — search users to invite ──
export async function handleSearchUsers(
  req: Request,
  userId: string
): Promise<Response> {
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return json([], 200, req);
  const users = await searchUsersByUsername(q, userId);
  return json(users, 200, req);
}