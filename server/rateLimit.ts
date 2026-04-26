import { publisher } from "./services/redis";


const MAX_REQUESTS = 10;
const WINDOW_SECONDS = 15 * 60; // 15 minutes

export async function checkRateLimit(key: string): Promise<boolean> {
  const redisKey = `ratelimit:${key}`;

  const count = await publisher.incr(redisKey);

  if (count === 1) {

    await publisher.expire(redisKey, WINDOW_SECONDS);
  }

  return count <= MAX_REQUESTS;
}