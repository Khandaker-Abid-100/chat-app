import { verifyToken } from "../auth";

export async function requireAuth(
  req: Request
): Promise<{ id: string; username: string } | null> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "");
  return await verifyToken(token);
}
