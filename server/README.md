# Chat App — Server

Bun WebSocket server for the real-time chat app.

---

## Prerequisites

Install Bun if you don't have it:

```bash
curl -fsSL https://bun.sh/install | bash
```

---

## Project setup from scratch

### 1. Create the server folder and initialise

```bash
mkdir server
cd server
bun init -y
```

> `bun init -y` creates `package.json` and `index.ts` automatically. The `-y` skips all questions.

### 2. Update `package.json`

Replace the entire file:

```json
{
  
  "scripts": {
    "dev": "bun run --watch index.ts"
  }
}
```

### 3. Update `index.ts`

Replace the entire file:

```ts
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
```

---

## Project structure

```
server/
├── index.ts        # Entry point — entire server lives here
└── package.json    # Project metadata and dev script
```

---

## Running the server

```bash
bun run dev
```

Server starts at `http://localhost:3001`. The `--watch` flag in the dev script restarts the server automatically every time you save `index.ts`.

---

## Scripts

```bash
bun run dev              # start with auto-restart on file save
bun run index.ts     # start without auto-restart (production)
```