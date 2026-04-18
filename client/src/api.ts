import type { MessagePayload, UserPayload } from "../../shared/types";

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

export async function apiGetMessages(token: string): Promise<MessagePayload[]> {
  const res = await fetch("/messages", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to load messages.");
  return data as MessagePayload[];
}