import { password } from "bun";
import { createUser, findUserByUsername } from "./db";
import type { UserPayload } from "../shared/types";

const JWT_SECRET = process.env.JWT_SECRET ?? "change_me_in_production";

// ── base64url: URL-safe, no +/=/  ──
function toBase64Url(str: string): string {
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function fromBase64Url(str: string): string {
  // Restore padding and standard chars before decoding
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  return atob(str);
}

async function signToken(payload: object): Promise<string> {
  const data = toBase64Url(JSON.stringify(payload));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(JWT_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(data)
  );
  const sigB64 = toBase64Url(String.fromCharCode(...new Uint8Array(sig)));
  return `${data}.${sigB64}`;
}

// async function verifyToken(
//   token: string
// ): Promise<{ id: string; username: string } | null> {
//   try {
//     const [data, sigB64] = token.split(".");
//     const key = await crypto.subtle.importKey(
//       "raw",
//       new TextEncoder().encode(JWT_SECRET),
//       { name: "HMAC", hash: "SHA-256" },
//       false,
//       ["verify"]
//     );
//     const sigBytes = Uint8Array.from(
//       fromBase64Url(sigB64),
//       (c) => c.charCodeAt(0)
//     );
//     const valid = await crypto.subtle.verify(
//       "HMAC",
//       key,
//       sigBytes,
//       new TextEncoder().encode(data)
//     );
//     if (!valid) return null;
//     return JSON.parse(fromBase64Url(data));
//   } catch {
//     return null;
//   }
// }
async function verifyToken(
  token: string
): Promise<{ id: string; username: string } | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 2) return null;

    const data = parts[0];
    const sigB64 = parts[1];

    if (!data || !sigB64) return null;

    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(JWT_SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );
    const sigBytes = Uint8Array.from(
      fromBase64Url(sigB64),
      (c) => c.charCodeAt(0)
    );
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      sigBytes,
      new TextEncoder().encode(data)
    );
    if (!valid) return null;
    return JSON.parse(fromBase64Url(data));
  } catch {
    return null;
  }
}
export async function register(
  username: string,
  plainPassword: string
): Promise<{ token: string; user: UserPayload }> {
  if (!username || username.length < 3)
    throw new Error("Username must be at least 3 characters.");
  if (!plainPassword || plainPassword.length < 6)
    throw new Error("Password must be at least 6 characters.");

  const existing = await findUserByUsername(username);
  if (existing) throw new Error("Username already taken.");

  const hash = await password.hash(plainPassword);
  const user = await createUser(username, hash);
  const token = await signToken({ id: user.id, username: user.username });
  return { token, user };
}

export async function login(
  username: string,
  plainPassword: string
): Promise<{ token: string; user: UserPayload }> {
  const row = await findUserByUsername(username);
  if (!row) throw new Error("Invalid username or password.");

  const isMatch = await password.verify(plainPassword, row.password_hash);
  if (!isMatch) throw new Error("Invalid username or password.");

  const user: UserPayload = { id: row.id, username: row.username };
  const token = await signToken({ id: user.id, username: user.username });
  return { token, user };
}

export { verifyToken };