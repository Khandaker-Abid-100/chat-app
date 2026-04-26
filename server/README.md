# Chat App — Server

Real-time WebSocket chat backend built with **Bun**, **PostgreSQL**, and **Redis**.
No Express, no Fastify, no ORMs — raw SQL and Bun's built-in HTTP + WebSocket server.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Bun 1.2+ |
| HTTP + WebSocket | `Bun.serve` (built-in) |
| Database | PostgreSQL via `Bun.sql` (built-in) |
| Password hashing | `Bun.password` — argon2id (built-in) |
| Auth | Custom HMAC-SHA256 JWT (WebCrypto API) |
| Pub/Sub + Cache | Redis 7 via `ioredis` |
| Rate limiting | Redis-backed in-memory counter |

---

## Project Structure

```
server/
├── index.ts                  # Entry point — Bun.serve wiring only
├── auth.ts                   # JWT sign/verify, register, login
├── db.ts                     # All SQL queries (no ORM)
├── rateLimit.ts              # Redis-backed rate limiter
├── migrate.ts                # Migration runner
├── middleware/
│   ├── auth.ts               # requireAuth helper
│   └── cors.ts               # CORS headers + preflight
├── routes/
│   ├── auth.ts               # POST /auth/register, /auth/login
│   ├── rooms.ts              # Room CRUD + invite + message routes
│   └── ws.ts                 # WebSocket open/message/close handlers
├── services/
│   ├── broadcast.ts          # Redis Pub/Sub + chunked delivery
│   ├── redis.ts              # publisher + subscriber clients
│   └── unreadCounter.ts      # Redis unread count helpers
└── migrations/
    ├── 001_create_users.sql
    ├── 002_create_messages.sql
    ├── 003_create_rooms.sql
    ├── 004_add_room_to_messages.sql
    ├── 005_add_invite_system.sql
    └── 006_add_unread_tracking.sql
```

---

## Prerequisites

**Bun** — JavaScript runtime:

```bash
curl -fsSL https://bun.sh/install | bash
```

**PostgreSQL** — database:

```bash
# Windows — download installer from https://www.postgresql.org/download/windows/
# macOS
brew install postgresql@16 && brew services start postgresql@16
# Ubuntu
sudo apt install postgresql && sudo service postgresql start
```

**Redis** — via Docker (recommended on Windows):

```bash
docker run -d --name redis -p 6379:6379 redis:7
```

---

## Setup from scratch

### 1. Initialise the project

```bash
mkdir server
cd server
bun init -y
```

### 2. Install dependencies

```bash
bun add ioredis
```

### 3. Create `.env`

```
DATABASE_URL=postgres://postgres:yourpassword@localhost:5432/chatapp
JWT_SECRET=super_secret_key_minimum_32_characters_change_this
ALLOWED_ORIGINS=http://localhost:5173
REDIS_URL=redis://localhost:6379
```

Rules enforced at startup:
- `JWT_SECRET` must be set — server throws if missing
- `JWT_SECRET` must be at least 32 characters — server throws if too short

### 4. Create the database

```bash
psql -U postgres -c "CREATE DATABASE chatapp;"
```

### 5. Run migrations

```bash
bun run migrate.ts
```

Expected output:

```
  apply 001_create_users.sql
  apply 002_create_messages.sql
  apply 003_create_rooms.sql
  apply 004_add_room_to_messages.sql
  apply 005_add_invite_system.sql
  apply 006_add_unread_tracking.sql
Migrations complete.
```

### 6. Start the server

```bash
bun dev
```

Expected output:

```
Subscribed to Redis global channel
Server running on http://localhost:3001
```

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `JWT_SECRET` | Yes | Min 32 chars. Used to sign/verify tokens |
| `ALLOWED_ORIGINS` | No | Comma-separated allowed CORS origins. Default: `http://localhost:5173` |
| `REDIS_URL` | No | Redis connection URL. Default: `redis://localhost:6379` |
| `PORT` | No | HTTP port. Default: `3001` |

---

## HTTP API

All routes except `/auth/*` and `/ws` require an `Authorization: Bearer <token>` header.

### Auth

| Method | Path | Body | Description |
|---|---|---|---|
| `POST` | `/auth/register` | `{ username, password }` | Register. Returns `{ token, user }` |
| `POST` | `/auth/login` | `{ username, password }` | Login. Returns `{ token, user }` |

Rate limited to **10 requests per 15 minutes** per IP. Returns `429` when exceeded.

### Rooms

| Method | Path | Body | Description |
|---|---|---|---|
| `GET` | `/rooms` | — | List rooms the user is a member of (with unread counts) |
| `POST` | `/rooms` | `{ name }` | Create a room. Creator auto-joined. Invite code generated. |
| `POST` | `/rooms/join` | `{ code }` | Join a room using a 6-character invite code |
| `GET` | `/rooms/:id/messages` | — | Fetch messages. Supports `?before=<timestamp>` for pagination |
| `GET` | `/rooms/:id/members` | — | List members of a room |
| `POST` | `/rooms/:id/invite` | `{ username }` | Owner invites a user by username |
| `POST` | `/rooms/:id/regenerate-code` | — | Owner generates a new invite code |

### Invitations

| Method | Path | Description |
|---|---|---|
| `GET` | `/invitations` | List pending invitations for the current user |
| `POST` | `/invitations/:id/accept` | Accept an invitation and join the room |

### Users

| Method | Path | Description |
|---|---|---|
| `GET` | `/users/search?q=<query>` | Search users by username (min 2 chars) |

---

## WebSocket Protocol

Connect to `ws://localhost:3001/ws` — **no token in the URL**.

The token is sent as the **first message** after connection (security: keeps tokens out of server logs and browser history).

### Message flow

```
Client connects to ws://localhost:3001/ws
Client sends:  { "type": "auth", "token": "eyJ..." }
Server sends:  { "type": "auth_ok" }
Client sends:  { "type": "join_room", "roomId": "..." }
Client sends:  { "type": "send_message", "roomId": "...", "content": "hello" }
Server sends:  { "type": "new_message", "message": { ... } }
```

If the client does not send an auth message within **10 seconds**, the server closes the connection with code `4001`.

### Client → Server messages

```ts
{ type: "auth";         token: string }
{ type: "join_room";    roomId: string }
{ type: "send_message"; roomId: string; content: string }
{ type: "mark_read";    roomId: string; lastMessageId: string }
```

### Server → Client messages

```ts
{ type: "auth_ok" }
{ type: "new_message";  message: MessagePayload }
{ type: "seen_update";  messageId: string; seenBy: string[] }
{ type: "room_created"; room: RoomPayload }
{ type: "error";        message: string }
```

All message shapes are defined in `shared/types.ts` — imported by both server and client.

---

## Security

| Feature | Implementation |
|---|---|
| Password hashing | `Bun.password.hash()` — argon2id algorithm |
| JWT signing | HMAC-SHA256 via WebCrypto API |
| JWT expiry | 8 hours — rejected after expiry |
| Token encoding | base64url — safe in URLs, no `+` or `/` characters |
| Rate limiting | Redis `INCR` + `EXPIRE` — 10 attempts per 15 minutes per IP, shared across all server instances |
| CORS | Explicit allowed origins from `ALLOWED_ORIGINS` env — no wildcard `*` |
| WS auth | Token sent as first message, not in URL query string |
| Room access | Membership check before returning any messages or member list |
| Owner-only actions | Invite users, regenerate invite code — verified before executing |

---

## Scalability Features

| Feature | Implementation |
|---|---|
| Multi-server broadcast | Redis Pub/Sub — `room:{id}` channels + `global` channel |
| Unread count performance | Redis counters (`INCR`/`DEL`) — O(1) vs O(n²) SQL `NOT IN` |
| Large room broadcast | Chunked delivery — sends to 100 connections per tick, yields event loop between chunks |
| Message pagination | Cursor-based (keyset) — `WHERE created_at < $cursor` uses index, O(log n) at any depth |
| Distributed rate limiting | Redis `INCR` shared across all server instances |

---

## Scripts

```bash
bun dev              # start with auto-restart on file save (--watch)
bun run index.ts     # start without auto-restart
bun run migrate.ts   # run pending database migrations
```

---

## Database Schema

```sql
users          — id, username, password_hash, created_at
rooms          — id, name, invite_code, created_at
room_members   — room_id, user_id, joined_at
messages       — id, room_id, sender_id, content, created_at
message_reads  — message_id, user_id, read_at
invitations    — id, room_id, invited_by, invited_username, accepted, created_at
schema_migrations — filename, applied_at
```

---

## Common Errors

**`JWT_SECRET environment variable is not set`**
Add `JWT_SECRET` to your `.env` file. Must be at least 32 characters.

**`Connection refused` on startup**
PostgreSQL or Redis is not running.
```bash
# Start Redis
docker start redis

# Check PostgreSQL is running
pg_ctl status -D "C:/Program Files/PostgreSQL/16/data"
```

**`Export named 'X' not found in module`**
A function was renamed in `db.ts`. Check that all imports match the exported function names exactly.

**`Address already in use :3001`**
Another process is using port 3001.
```bash
# Windows — find and kill the process
netstat -ano | findstr :3001
taskkill /PID <PID> /F
```