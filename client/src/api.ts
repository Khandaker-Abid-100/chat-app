import type { MessagePayload, RoomPayload, UserPayload } from "../../shared/types";

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

export async function apiJoinRoom(token: string, roomId: string): Promise<void> {
  const res = await fetch(`/rooms/${roomId}/join`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error ?? "Failed to join room.");
  }
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