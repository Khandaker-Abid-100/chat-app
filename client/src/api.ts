import type {
  MessagePayload,
  RoomPayload,
  UserPayload,
  InvitationPayload,
} from "../../shared/types";

export type AuthResponse = {
  token: string;
  user: UserPayload;
};

export async function apiRegister(
  username: string,
  password: string
): Promise<AuthResponse> {
  const res = await fetch("/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Registration failed.");
  return data as AuthResponse;
}

export async function apiLogin(
  username: string,
  password: string
): Promise<AuthResponse> {
  const res = await fetch("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Login failed.");
  return data as AuthResponse;
}

export async function apiGetRooms(token: string): Promise<RoomPayload[]> {
  const res = await fetch("/rooms", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to load rooms.");
  return data as RoomPayload[];
}

export async function apiCreateRoom(
  token: string,
  name: string
): Promise<RoomPayload> {
  const res = await fetch("/rooms", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ name }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to create room.");
  return data as RoomPayload;
}

// Join a room using a 6-character invite code
export async function apiJoinByCode(
  token: string,
  code: string
): Promise<RoomPayload> {
  const res = await fetch("/rooms/join", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ code }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Invalid invite code.");
  return data as RoomPayload;
}

export async function apiGetMessages(
  token: string,
  roomId: string
): Promise<MessagePayload[]> {
  const res = await fetch(`/rooms/${roomId}/messages`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to load messages.");
  return data as MessagePayload[];
}

export async function apiGetMembers(
  token: string,
  roomId: string
): Promise<UserPayload[]> {
  const res = await fetch(`/rooms/${roomId}/members`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to load members.");
  return data as UserPayload[];
}

// Owner invites a user by their username
export async function apiInviteUser(
  token: string,
  roomId: string,
  username: string
): Promise<void> {
  const res = await fetch(`/rooms/${roomId}/invite`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ username }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to send invite.");
}

// Owner regenerates the room invite code
export async function apiRegenerateCode(
  token: string,
  roomId: string
): Promise<string> {
  const res = await fetch(`/rooms/${roomId}/regenerate-code`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to regenerate code.");
  return data.inviteCode as string;
}

// Get pending invitations for the current user
export async function apiGetInvitations(
  token: string
): Promise<InvitationPayload[]> {
  const res = await fetch("/invitations", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to load invitations.");
  return data as InvitationPayload[];
}

// Accept an invitation
export async function apiAcceptInvitation(
  token: string,
  invitationId: string
): Promise<RoomPayload> {
  const res = await fetch(`/invitations/${invitationId}/accept`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to accept invitation.");
  return data as RoomPayload;
}

// Search users by username prefix (for invite suggestions)
export async function apiSearchUsers(
  token: string,
  query: string
): Promise<UserPayload[]> {
  const res = await fetch(`/users/search?q=${encodeURIComponent(query)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Search failed.");
  return data as UserPayload[];
}