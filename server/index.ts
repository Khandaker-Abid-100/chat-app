import { corsHeaders, corsPreflight, getAllowedOrigin } from "./middleware/cors";
import { requireAuth } from "./middleware/auth";
import { handleRegister, handleLogin } from "./routes/auth";
import {
  handleGetRooms,
  handleCreateRoom,
  handleJoinByCode,
  handleGetMembers,
  handleInviteUser,
  handleRegenerateCode,
  handleGetInvitations,
  handleAcceptInvitation,
  handleGetMessages,
  handleSearchUsers,
} from "./routes/rooms";
import { handleOpen, handleMessage, handleClose } from "./routes/ws";
import { initRedisSubscriber } from "./services/broadcast";

// Start Redis subscription listener before accepting connections
initRedisSubscriber();

function json(data: unknown, status = 200, req?: Request): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...(req ? corsHeaders(req) : {}),
    },
  });
}

const server = Bun.serve<{ userId: string }>({
  port: 3001,

  async fetch(req, server) {
    const url = new URL(req.url);
    const method = req.method;

    if (method === "OPTIONS") return corsPreflight(req);

    // ── Public routes ──
    if (method === "POST" && url.pathname === "/auth/register") {
      return handleRegister(req);
    }
    if (method === "POST" && url.pathname === "/auth/login") {
      return handleLogin(req);
    }

    // ── WebSocket upgrade — auth sent as first WS message ──
    if (url.pathname === "/ws") {
      const upgraded = server.upgrade(req, {
        data: { userId: "" },
        headers: { "Access-Control-Allow-Origin": getAllowedOrigin(req) },
      });
      if (!upgraded) {
        return new Response("WebSocket upgrade failed", { status: 400 });
      }
      return undefined;
    }

    // ── All routes below require Authorization header ──
    const currentUser = await requireAuth(req);
    if (!currentUser) return json({ error: "Unauthorized" }, 401, req);

    // ── Room routes ──
    if (method === "GET" && url.pathname === "/rooms") {
      return handleGetRooms(req, currentUser.id);
    }
    if (method === "POST" && url.pathname === "/rooms") {
      return handleCreateRoom(req, currentUser.id);
    }

    // POST /rooms/join — join by invite code
    if (method === "POST" && url.pathname === "/rooms/join") {
      return handleJoinByCode(req, currentUser.id);
    }

    // Routes with room ID param
    const roomMembersMatch = url.pathname.match(/^\/rooms\/([^/]+)\/members$/);
    if (method === "GET" && roomMembersMatch) {
      const roomId = roomMembersMatch[1];
      if (!roomId) return json({ error: "Invalid room ID." }, 400, req);
      return handleGetMembers(req, roomId, currentUser.id);
    }

    const inviteMatch = url.pathname.match(/^\/rooms\/([^/]+)\/invite$/);
    if (method === "POST" && inviteMatch) {
      const roomId = inviteMatch[1];
      if (!roomId) return json({ error: "Invalid room ID." }, 400, req);
      return handleInviteUser(req, roomId, currentUser.id);
    }

    const regenMatch = url.pathname.match(/^\/rooms\/([^/]+)\/regenerate-code$/);
    if (method === "POST" && regenMatch) {
      const roomId = regenMatch[1];
      if (!roomId) return json({ error: "Invalid room ID." }, 400, req);
      return handleRegenerateCode(req, roomId, currentUser.id);
    }

    const messagesMatch = url.pathname.match(/^\/rooms\/([^/]+)\/messages$/);
    if (method === "GET" && messagesMatch) {
      const roomId = messagesMatch[1];
      if (!roomId) return json({ error: "Invalid room ID." }, 400, req);
      return handleGetMessages(req, roomId, currentUser.id);
    }

    // ── Invitation routes ──
    if (method === "GET" && url.pathname === "/invitations") {
      return handleGetInvitations(req, currentUser.username);
    }

    const acceptMatch = url.pathname.match(/^\/invitations\/([^/]+)\/accept$/);
    if (method === "POST" && acceptMatch) {
      const invitationId = acceptMatch[1];
      if (!invitationId) return json({ error: "Invalid invitation ID." }, 400, req);
      return handleAcceptInvitation(req, invitationId, currentUser.username);
    }

    // ── User search ──
    if (method === "GET" && url.pathname === "/users/search") {
      return handleSearchUsers(req, currentUser.id);
    }

    return json({ error: "Not found" }, 404, req);
  },

  websocket: {
    open: handleOpen,
    message: handleMessage,
    close: handleClose,
  },
});

console.log(`Server running on http://localhost:${server.port}`);