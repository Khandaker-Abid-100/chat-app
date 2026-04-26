# Chat App — Client

Real-time chat frontend built with **React**, **TypeScript**, **Vite**, and **Tailwind CSS**.
Uses the browser's native WebSocket API — no Socket.io or similar library.

---

## Tech Stack

| Layer | Technology |
|---|---|
| UI | React 18 + TypeScript |
| Build tool | Vite |
| Styling | Tailwind CSS v4 |
| Package manager | Bun |
| Real-time | Browser native WebSocket API |
| State | `useState` / `useReducer` / `useContext` |

---

## Project Structure

```
client/
├── src/
│   ├── App.tsx                   # Root — page routing, AuthProvider + WsProvider
│   ├── main.tsx                  # React entry point
│   ├── index.css                 # @import "tailwindcss"
│   ├── api.ts                    # All fetch calls to the server
│   ├── config.ts                 # WS_URL + API_URL from import.meta.env
│   ├── ChatBox.tsx               # Message input bar
│   ├── MessageList.tsx           # Chat bubbles with seen indicators
│   ├── components/
│   │   └── ErrorBoundary.tsx     # React error boundary
│   ├── context/
│   │   ├── authContext.ts        # Auth context object
│   │   ├── AuthProvider.tsx      # Auth state + localStorage persistence
│   │   ├── useAuth.ts            # useAuth hook
│   │   ├── wsContext.ts          # WebSocket context object
│   │   ├── WsProvider.tsx        # Single shared WebSocket connection
│   │   └── useWs.ts              # useWs hook
│   ├── hooks/
│   │   ├── useWebSocketConn.ts   # WebSocket lifecycle management
│   │   ├── useMessages.ts        # Message state + pagination + WS updates
│   │   └── useRooms.ts           # Room list state + WS updates
│   └── pages/
│       ├── AuthPage.tsx          # Login / register form
│       ├── RoomListPage.tsx      # Room list, create room, join by code, invitations
│       └── ChatPage.tsx          # Per-room chat with infinite scroll
├── .env                          # Local environment variables
├── .env.example                  # Example env file (commit this, not .env)
├── vite.config.ts                # Vite config with Tailwind plugin + proxy
└── package.json
```

---

## Prerequisites

**Bun** — package manager and script runner:

```bash
curl -fsSL https://bun.sh/install | bash
```

The server must be running before starting the client.
See `server/README.md` for server setup.

---

## Setup from scratch

### 1. Create the Vite + React + TypeScript project

```bash
mkdir client
cd client
bun create vite@latest . --template react-ts
```

Press **Y** if it asks to overwrite the folder.

### 2. Install dependencies

```bash
bun install
```

### 3. Install Tailwind CSS

```bash
bun add -d tailwindcss @tailwindcss/vite
```

### 4. Create `.env`

```
VITE_WS_URL=ws://localhost:3001/ws
VITE_API_URL=http://localhost:3001
```

### 5. Update `vite.config.ts`

Replace the entire file:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/auth":        { target: "http://localhost:3001" },
      "/rooms":       { target: "http://localhost:3001" },
      "/invitations": { target: "http://localhost:3001" },
      "/users":       { target: "http://localhost:3001" },
    },
  },
});
```

### 6. Update `src/index.css`

Replace the entire file with one line:

```css
@import "tailwindcss";
```

### 7. Start the client

```bash
bun run dev
```

Open `http://localhost:5173` in your browser.

---

## Environment Variables

| Variable | Description |
|---|---|
| `VITE_WS_URL` | WebSocket server URL. Default: `ws://localhost:3001/ws` |
| `VITE_API_URL` | HTTP API base URL. Default: `http://localhost:3001` |

These are read from `src/config.ts`:

```ts
export const WS_URL = import.meta.env.VITE_WS_URL as string;
export const API_URL = import.meta.env.VITE_API_URL as string;
```

Never hardcode URLs directly in components — always import from `config.ts`.

---

## Pages

### AuthPage
Shown when the user is not logged in.
- Toggle between Login and Register mode with one button
- Enter key submits the form
- Displays server error messages (username taken, wrong password)
- On success: stores `{ token, user }` in React state and `localStorage`
- Persists session — refreshing the page keeps you logged in

### RoomListPage
Shown after login.

**Rooms tab:**
- Lists only rooms the user is a member of
- Unread count badge on each room — updates in real time via WebSocket
- Create a new room — invite code generated automatically
- Join a room with a 6-character invite code
- Gear icon (⚙) on rooms you own — opens settings panel

**Settings panel (owners only):**
- Shows current invite code with Copy button
- Regenerate button — generates a new code, old one stops working
- Search users by username to invite them directly

**Invitations tab:**
- Lists pending invitations sent to you by room owners
- Accept button — adds you to the room immediately

### ChatPage
Per-room chat view.
- Message history loads on enter (most recent 50 messages)
- Infinite scroll — scroll to the top to load older messages automatically
- New messages appear at the bottom in real time
- Your messages appear on the right (blue), others on the left (gray)
- Sender name shown above each bubble
- "Seen by X" indicator beneath your own messages
- Connected / Connecting status in the header
- Back button returns to the room list

---

## Architecture

### Single WebSocket connection

Both `RoomListPage` and `ChatPage` share one WebSocket connection managed by `WsProvider`. The connection is opened once when the user logs in and closed when they log out.

```
App
└── WsProvider (single WebSocket connection)
    ├── RoomListPage
    │   └── useRooms(lastMessage)     — reacts to room_created, new_message
    └── ChatPage
        └── useMessages(lastMessage)  — reacts to new_message, seen_update
```

### WebSocket authentication

The token is **not** in the WebSocket URL. It is sent as the first message after connection. This keeps the token out of server logs and browser history.

```
1. ws = new WebSocket("ws://localhost:3001/ws")
2. ws.onopen → send { type: "auth", token: "eyJ..." }
3. server validates token
4. server sends { type: "auth_ok" }
5. send { type: "join_room", roomId: "..." }
6. chat works normally
```

If auth is not sent within 10 seconds the server closes the connection.

### State management

No Redux. State is managed with three layers:

| Layer | Tool | What it holds |
|---|---|---|
| Auth state | `AuthContext` + `useReducer` | Logged-in user + token |
| WebSocket state | `WsContext` | Connection, `send()`, `lastMessage` |
| UI state | `useReducer` in custom hooks | Messages list, rooms list |

### Message pagination

Cursor-based (keyset) pagination — no offset queries.

```
First load:   GET /rooms/:id/messages
              → { messages: [...], nextCursor: "2024-01-15T10:30:00Z" }

Scroll up:    GET /rooms/:id/messages?before=2024-01-15T10:30:00Z
              → { messages: [...], nextCursor: "2024-01-14T08:00:00Z" }

No more:      nextCursor: null
```

`IntersectionObserver` watches a sentinel `<div>` at the top of the message list. When it scrolls into view, `loadMore()` fires automatically.

---

## Custom Hooks

### `useWebSocketConn(token, onMessage)`
Manages the WebSocket lifecycle. Opens connection, sends auth message, calls `onMessage` on every server message. Handles cleanup on unmount. Uses a 100ms delay to avoid React StrictMode double-invoke warnings.

### `useMessages(token, roomId, wsMessage)`
Manages message state for one room. Loads history on mount, appends new messages from WebSocket, updates seen indicators, supports `loadMore()` for pagination. Uses `useReducer` internally.

### `useRooms(token, userId, wsMessage)`
Manages room list state. Loads rooms on mount, adds new rooms from `room_created` events, increments unread badges from `new_message` events. Uses `useReducer` internally.

---

## Scripts

```bash
bun run dev       # start Vite dev server at localhost:5173
bun run build     # compile and bundle for production into dist/
bun run preview   # preview the production build locally
```

---

## Vite Proxy

HTTP requests to `/auth`, `/rooms`, `/invitations`, `/users` are proxied to the Bun server on port 3001 by Vite's dev server. This avoids CORS issues during development.

WebSocket connects directly to `ws://localhost:3001/ws` — **not** through the Vite proxy. This is intentional: Vite's WebSocket proxy has a known bug on Windows (`ECONNABORTED`) when proxying to Bun.

In production, configure NGINX to proxy both HTTP and WebSocket to the backend.

---

## Common Errors

**`MessageList is not defined`**
Missing import in `ChatPage.tsx`. Add:
```ts
import MessageList from "../MessageList";
import ChatBox from "../ChatBox";
```

**`WebSocket is closed before the connection is established`**
This warning appears in React StrictMode (development only) because effects run twice. It is harmless — the second connection works correctly. Does not appear in production.

**`Module has no exported member 'apiJoinRoom'`**
The old `apiJoinRoom` was replaced by `apiJoinByCode`. Update the import to use `apiJoinByCode` from `api.ts`.

**`Fast refresh only works when a file only exports components`**
A file exports both a component and a non-component (hook, context, type). Split them into separate files — one file per export type.

**Blank screen after login**
Check the browser console for errors. Most likely the WebSocket auth failed — verify the server is running and `VITE_WS_URL` in `.env` points to the correct address.