import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

// Two separate clients are required by Redis protocol:
// one for publishing, one for subscribing.
// A client in subscribe mode can only receive — it cannot publish.
export const publisher = new Redis(REDIS_URL);
export const subscriber = new Redis(REDIS_URL);

publisher.on("error", (err) => console.error("Redis publisher error:", err));
subscriber.on("error", (err) => console.error("Redis subscriber error:", err));

// Channel name conventions
export const roomChannel = (roomId: string) => `room:${roomId}`;
export const globalChannel = "global";