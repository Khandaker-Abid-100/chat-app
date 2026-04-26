# Scalability Analysis — Real-Time Chat System

## The Problem

What happens when we have 10,000 concurrent users sending 100 messages
per second across 500 rooms?

At that scale:
- 10,000 WebSocket connections open simultaneously
- 100 msg/sec × 500 rooms = 50,000 message fan-outs per second
- A single server process saturates between 5,000–8,000 connections
- Multiple servers are required — and that breaks everything in-memory

This document identifies every bottleneck, explains the solution
implemented, and estimates how far the system can scale.

---

## Bottleneck 1 — In-Memory State (Single Server Problem)

### The problem

The original code stored all state in plain JavaScript Maps:

```ts
const clients = new Map<string, ServerWebSocket<{ userId: string }>>();
const roomPresence = new Map<string, Set<string>>();
```

These Maps only exist in one process. The moment you run two server
instances behind a load balancer, the state is split:

```
Server 1                    Server 2
clients = {                 clients = {
  alice: ws,                  bob: ws,
  charlie: ws                 dave: ws
}                           }

Alice sends a message to Room X on Server 1.
Server 1 calls broadcastToRoom("roomX", msg).
Server 1 only knows about alice and charlie.
Bob and dave on Server 2 never receive the message.
```

The same problem affects:
- Rate limiting — 10 attempts per server = 20 total with 2 servers
- Unread counts — each server counts independently

### Questions answered

**What happens if we need multiple server instances?**
Without shared state, each server is an island. Users on different
servers cannot communicate. The app appears to work but messages
silently disappear for some users.

**How would broadcastToRoom() work across servers?**
It cannot without a shared message bus. Each server only sees its
own local connections.

**What solutions exist?**

| Solution | How it works | Trade-off |
|---|---|---|
| Sticky sessions | Load balancer always routes a user to the same server | Single point of failure per user |
| Redis Pub/Sub | Servers publish to Redis; all servers subscribe and deliver locally | Extra infrastructure; tiny latency added |
| Redis Streams | Like Pub/Sub but with persistence and replay | More complex; better for guaranteed delivery |
| Socket.io adapter | Built-in Redis adapter for Socket.io | Only works with Socket.io |

### Solution implemented — Redis Pub/Sub

**Files:** `server/services/broadcast.ts`, `server/services/redis.ts`

Two Redis clients are required — one for publishing, one for subscribing.
A client in subscribe mode cannot publish.

```
Server 1                Redis              Server 2
clients = {             Pub/Sub            clients = {
  alice: ws,    ←───── room:X ──────→       bob: ws,
  charlie: ws                               dave: ws
}                                         }

Alice sends to Room X
→ Server 1 PUBLISH to Redis channel "room:X"
→ Redis delivers to ALL subscribers instantly
→ Server 1 delivers to alice and charlie (local connections)
→ Server 2 delivers to bob and dave (local connections)
→ Everyone gets the message regardless of which server they are on
```

Channel naming:
- `room:{roomId}` — scoped to one room
- `global` — broadcasts to everyone (e.g. room_created)

Rate limiting also uses Redis `INCR` + `EXPIRE`:
- Key: `ratelimit:login:{ip}` — shared counter across all servers
- After 10 increments: server returns 429 for 15 minutes
- One Redis key enforces the limit globally

**Trade-offs:**
- Redis must stay running — if it goes down, broadcasting stops
- Adds ~0.5ms per message for the Redis round trip
- Benefit: unlimited horizontal scaling with no code changes

---

## Bottleneck 2 — Database Query Performance

### The problem

The original unread count query:

```sql
COUNT(m.id) FILTER (
  WHERE m.id NOT IN (
    SELECT message_id FROM message_reads WHERE user_id = ${userId}
  )
)
```

**Time complexity with 1 million messages:**

| Data size | message_reads rows | Query behaviour |
|---|---|---|
| 10K messages, 100 users | 1M rows | Acceptable (~50ms) |
| 1M messages, 1K users | 1B rows | Very slow (5–30 seconds) |
| 10M messages, 10K users | 100B rows | Unusable |

`NOT IN (SELECT ...)` runs the subquery for every row in `messages`.
PostgreSQL cannot efficiently use an index here. The planner often
falls back to a sequential scan. Result: O(n²).

**What happens as message_reads grows?**
The subquery must return millions of IDs. The outer query checks each
message against that list. Both scan size and memory usage grow together.

**How to optimize at scale:**

| Approach | Description | Trade-off |
|---|---|---|
| Counter cache (Redis) | Store count as integer, INCR/DEL it | O(1) reads; resets on Redis restart |
| Materialized view | Precomputed table, refreshed periodically | Stale between refreshes |
| Denormalization | `unread_count` column in `room_members` | Extra writes per message |
| `last_read_message_id` | Pointer; count messages after it | Still a DB count query |

### Solution implemented — Redis counter cache

**File:** `server/services/unreadCounter.ts`

When a message is sent — increment unread for all members except sender:

```ts
const pipeline = publisher.pipeline();
for (const userId of memberIds) {
  if (userId === senderUserId) continue;
  pipeline.incr(`unread:${userId}:${roomId}`);
}
await pipeline.exec(); // one Redis round trip regardless of room size
```

When a user opens a room — reset to zero:

```ts
await publisher.del(`unread:${userId}:${roomId}`);
```

When loading the room list — fetch all counts in one command:

```ts
const pipeline = publisher.pipeline();
for (const roomId of roomIds) {
  pipeline.get(`unread:${userId}:${roomId}`);
}
const results = await pipeline.exec();
// All unread counts fetched in a single Redis round trip
```

The SQL room list query no longer counts unread messages at all.
It returns rooms the user belongs to. Unread counts come from Redis
in O(1) per room, constant speed regardless of message history size.

**Trade-offs:**
- Unread counts reset to zero if Redis restarts without persistence
  (fix: `docker exec -it redis redis-cli CONFIG SET appendonly yes`)
- The `message_reads` table still exists for "Seen by X" indicators
  on individual messages — only the unread badge moved to Redis

---

## Bottleneck 3 — Message Broadcasting Loop

### The problem

The original broadcast loop:

```ts
function broadcastToRoom(roomId: string, msg: ServerMessage) {
  for (const userId of members) {     // synchronous
    const ws = clients.get(userId);
    if (ws) ws.send(json);            // blocks next iteration
  }
}
```

**What happens with 5,000 members:**
- 5,000 iterations run synchronously on the main thread
- No other events process until the loop finishes
- At 100 msg/sec: 5,000 × 100 = 500,000 iterations per second
- The event loop starves — latency for all users spikes

**What if ws.send() is slow?**
Bun buffers `ws.send()` internally so it does not literally block on
a slow connection. But the loop itself — 5,000 Map lookups and function
calls — still consumes CPU synchronously on one thread.

**How do production apps handle this:**

| Approach | Description |
|---|---|
| Chunked delivery | Split into batches, yield between batches |
| Worker threads | Offload delivery to separate threads |
| Message queues | Kafka/RabbitMQ; workers consume and send |
| Room size cap | Discord caps real-time rooms at 500 members |

### Solution implemented — Chunked async delivery

**File:** `server/services/broadcast.ts`

```ts
const CHUNK_SIZE = 100;

async function deliverInChunks(
  userIds: string[],
  payload: string
): Promise<void> {
  for (let i = 0; i < userIds.length; i += CHUNK_SIZE) {
    const chunk = userIds.slice(i, i + CHUNK_SIZE);

    for (const userId of chunk) {
      const ws = clients.get(userId);
      if (ws) ws.send(payload);
    }

    // Yield between chunks so other events can process
    if (i + CHUNK_SIZE < userIds.length) {
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
  }
}
```

Decision logic:
- Room ≤ 100 members → synchronous (zero overhead, fastest path)
- Room > 100 members → chunked async (yields every 100 sends)

A 5,000-member room takes 50 chunks × ~1ms = ~50ms total delivery.
During those 50ms the event loop processes other messages between chunks.

**Trade-offs:**
- Large room messages take up to ~50ms longer to reach last members
- Small rooms (the majority) have identical latency to before

---

## Bottleneck 4 — Message History Loading

### The problem

Original code: fixed 50 messages, no scroll, no history access.

**Why offset pagination fails at scale:**

```sql
-- DO NOT USE at scale
LIMIT 50 OFFSET 5000000
```

PostgreSQL must scan and skip 5 million rows. At 10 million messages,
loading deep history takes 30+ seconds. Also: new messages arriving
between page loads shift all offsets — users see duplicates or gaps.

**How to handle a room with 10 million messages:**
1. Cursor-based pagination (implemented) — O(log n) via index
2. Message archival — messages older than 90 days move to cold storage
3. Full-text search — PostgreSQL `tsvector` or Elasticsearch

### Solution implemented — Cursor-based (keyset) pagination

**Files:** `server/db.ts`, `server/routes/rooms.ts`,
`client/src/api.ts`, `client/src/hooks/useMessages.ts`,
`client/src/pages/ChatPage.tsx`

How it works:

```
First load (no cursor):
GET /rooms/:id/messages
→ Returns last 50 messages + nextCursor = "2024-01-15T10:30:00.000Z"

User scrolls to top (IntersectionObserver fires):
GET /rooms/:id/messages?before=2024-01-15T10:30:00.000Z
→ Returns 50 messages before that timestamp + new nextCursor

Repeat until nextCursor is null (no more history)
```

SQL uses the index directly:

```sql
WHERE m.room_id = ${roomId}
  AND m.created_at < ${cursor}::timestamptz
ORDER BY m.created_at DESC
LIMIT 51  -- one extra to detect if more pages exist
```

`idx_messages_created_at` makes this O(log n).
Page 1 and page 200,000 take the same query time.

**Trade-offs:**
- Cannot jump to a specific page number
- If two messages share an identical timestamp a message could
  appear twice across pages (extremely rare — fix with composite
  cursor of `created_at + id`)

---

## Bottleneck 5 — WebSocket Connection Limits

### How many connections can one Bun server handle?

Per connection resource usage:

| Resource | Per connection | At 10,000 |
|---|---|---|
| File descriptor | 1 | 10,000 |
| Kernel socket buffer | ~8 KB | ~80 MB |
| Bun WebSocket state | ~2–4 KB | ~30 MB |
| TLS overhead (HTTPS) | ~10 KB | ~100 MB |

Total: ~20–30 KB per connection.
4 GB RAM dedicated = ~160,000 theoretical connections.

**Practical limits under message load:**

| Users | Load | Limiting factor |
|---|---|---|
| 0–3,000 | Light | Single server comfortable |
| 3,000–8,000 | Medium | CPU rises; consider second server |
| 8,000–15,000 | Heavy | 2–3 servers needed |
| 50,000+ | Extreme | Redis Cluster + DB sharding |

**OS file descriptor limit is the first wall:**
Default on Windows and Linux: 1,024 per process.
A default Bun server can only hold 1,024 WebSocket connections.

Increase on Linux:
```bash
ulimit -n 100000
# Or permanently in /etc/security/limits.conf:
# * soft nofile 100000
# * hard nofile 100000
```

**How to scale horizontally:**

| Method | Description | When to use |
|---|---|---|
| Redis Pub/Sub (done) | No sticky sessions needed | Always — already implemented |
| NGINX round-robin | Distribute connections across servers | When adding second server |
| Kubernetes HPA | Auto-scale pods on CPU/connection metrics | Cloud deployments |

---

## Architecture Diagram

```
                    ┌──────────────────────────────────────────┐
                    │          Clients (browsers)               │
                    │   alice   bob   charlie   dave   ...      │
                    └──────────┬───────────────┬───────────────┘
                               │ HTTP + WS     │ HTTP + WS
                    ┌──────────▼───────────────▼───────────────┐
                    │          NGINX Load Balancer               │
                    │                                            │
                    │  HTTP  → round robin across servers        │
                    │  WS    → any server                        │
                    │  (Redis Pub/Sub removes need for           │
                    │   sticky sessions entirely)                │
                    └──────────┬───────────────┬───────────────┘
                               │               │
              ┌────────────────▼──┐       ┌───▼────────────────┐
              │   Bun Server A    │       │   Bun Server B     │
              │   port 3001       │       │   port 3002        │
              │                   │       │                    │
              │  clients Map:     │       │  clients Map:      │
              │   alice → ws      │       │   bob → ws         │
              │   charlie → ws    │       │   dave → ws        │
              │                   │       │                    │
              │  roomPresence:    │       │  roomPresence:     │
              │   roomX: {alice,  │       │   roomX: {bob,     │
              │           charlie}│       │           dave}    │
              └────────┬──────────┘       └────────┬───────────┘
                       │ PUBLISH room:X            │ SUBSCRIBE room:X
                       │                           │
              ┌────────▼───────────────────────────▼───────────┐
              │                   Redis 7                       │
              │                                                 │
              │  Pub/Sub channels:                              │
              │   global        → room_created events          │
              │   room:{id}     → new_message, seen_update     │
              │                                                 │
              │  Rate limit keys (shared globally):            │
              │   ratelimit:login:{ip}     TTL 15min           │
              │   ratelimit:register:{ip}  TTL 15min           │
              │                                                 │
              │  Unread counters (O(1) reads):                 │
              │   unread:{userId}:{roomId} → integer count     │
              └────────────────────┬────────────────────────────┘
                                   │
              ┌────────────────────▼────────────────────────────┐
              │          PgBouncer (connection pooler)           │
              │                                                  │
              │  Multiple Bun servers share a fixed pool of     │
              │  100 PostgreSQL connections total.               │
              │  Without this: N servers × M connections each   │
              │  = PostgreSQL overloaded at 4+ servers.         │
              │  Mode: transaction pooling                       │
              └────────────────────┬────────────────────────────┘
                                   │
              ┌────────────────────▼────────────────────────────┐
              │           PostgreSQL (Primary)                   │
              │                                                  │
              │  Tables:                                         │
              │   users            auth + password hashes       │
              │   rooms            metadata + invite_code       │
              │   room_members     membership + ownership       │
              │   messages         chat history (paginated)     │
              │   message_reads    seen-by tracking             │
              │   invitations      pending room invites         │
              │   schema_migrations migration tracking          │
              │                                                  │
              │  Key indexes:                                    │
              │   idx_messages_room_id                          │
              │   idx_messages_created_at  ← cursor pagination  │
              │   idx_message_reads_user_id                     │
              │   idx_invitations_username                      │
              └──────────────────────────────────────────────────┘
```

---

## Capacity Estimates

### One server — concurrent users

| Users | Activity | Status |
|---|---|---|
| 0–3,000 | Any | Single server handles comfortably |
| 3,000–8,000 | Elevated | CPU rises; monitor closely |
| 8,000–15,000 | High | Add second server |
| 15,000–50,000 | Very high | 4–8 servers + PgBouncer |
| 50,000+ | Extreme | Redis Cluster + read replicas + sharding |

### What to monitor

| Metric | Warning | Critical | Action |
|---|---|---|---|
| WS connections per server | 8,000 | 12,000 | Add server |
| CPU usage | 60% | 80% | Add server |
| RAM usage | 70% | 85% | Add RAM or server |
| Message latency p99 | 100ms | 500ms | Add server |
| Redis memory | 60% | 80% | Increase Redis RAM |
| Redis ops/sec | 80,000 | 100,000 | Redis Cluster |
| PostgreSQL connections | 80 | 95 | Add PgBouncer |
| PostgreSQL slow queries | 50ms | 200ms | Add index or cache |

### Scaling playbook

```
Step 1 — Single server (current setup)
  Target: up to 3,000 active users
  Stack: 1 Bun + 1 Redis + 1 PostgreSQL

Step 2 — Second server
  Target: up to 6,000 active users
  Add: NGINX load balancer
  Redis Pub/Sub already handles cross-server messaging

Step 3 — Four servers + PgBouncer
  Target: up to 15,000 active users
  Add: PgBouncer between servers and PostgreSQL
  Prevents connection pool exhaustion

Step 4 — Eight servers + Redis Cluster
  Target: up to 40,000 active users
  Add: Redis Cluster (3 primary + 3 replica nodes)
  Add: PostgreSQL read replica for history queries

Step 5 — Microservices
  Target: 50,000+ active users
  Split: auth service, messaging service, presence service
  Add: Kafka for guaranteed delivery
  Add: Elasticsearch for message search
  Add: S3 for file uploads and message archival
```

---

## Implementation Status

| Feature | Status | File |
|---|---|---|
| Redis Pub/Sub broadcast | Done | `server/services/broadcast.ts` |
| Redis rate limiting | Done | `server/rateLimit.ts` |
| Redis unread counters | Done | `server/services/unreadCounter.ts` |
| Chunked async broadcast | Done | `server/services/broadcast.ts` |
| Cursor-based pagination | Done | `server/db.ts` + `useMessages.ts` |
| JWT expiration (8 hours) | Done | `server/auth.ts` |
| JWT secret validation | Done | `server/auth.ts` |
| Room membership check | Done | `server/routes/rooms.ts` |
| CORS explicit origins | Done | `server/middleware/cors.ts` |
| WS token not in URL | Done | `server/routes/ws.ts` |
| PgBouncer | Next step | Install separately when adding servers |
| Redis persistence | Next step | `CONFIG SET appendonly yes` in Redis |
| NGINX load balancer | At scale | Install when adding second server |
| PostgreSQL read replica | At scale | When DB queries become bottleneck |
| Redis Cluster | At scale | When Redis ops exceed 80,000/sec |
| Message archival | At scale | When a room exceeds 1 million messages |