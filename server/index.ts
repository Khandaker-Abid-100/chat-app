import type { ServerWebSocket } from "bun";
const clients = new Set<ServerWebSocket<unknown>>();

const server = Bun.serve({
  port: 3001,

  fetch(req, server) {
    const url = new URL(req.url);

    if (url.pathname === "/ws") {
      const upgraded = server.upgrade(req);
      if (!upgraded) {
        return new Response("WebSocket upgrade failed", { status: 400 });
      }
      return undefined;
    }

    return new Response("Chat server is running!");
  },

  websocket: {
    open(ws) {
      clients.add(ws);
      console.log(`+ User connected. Online: ${clients.size}`);
    },

    message(ws, rawMessage) {
      // Broadcast the message to every connected user
      for (const client of clients) {
        client.send(rawMessage);
      }
    },

    close(ws) {
      clients.delete(ws);
      console.log(`- User disconnected. Online: ${clients.size}`);
    },
  },
});

console.log(`Server listening on http://localhost:${server.port}`);