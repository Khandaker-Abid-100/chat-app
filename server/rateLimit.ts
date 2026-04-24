type RequestRecord = {
  count: number;
  windowStart: number; // timestamp in ms when this window started
};

const store = new Map<string, RequestRecord>();

// Max attempts per window per IP
const MAX_REQUESTS = 10;
// Window duration in milliseconds (15 minutes)
const WINDOW_MS = 15 * 60 * 1000;

// Clean up old entries every 5 minutes so memory doesn't grow forever
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of store.entries()) {
    if (now - record.windowStart > WINDOW_MS) {
      store.delete(key);
    }
  }
}, 5 * 60 * 1000);

/**
 * Returns true if the IP is allowed through.
 * Returns false if the IP has exceeded the rate limit.
 */
export function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = store.get(ip);

  if (!record || now - record.windowStart > WINDOW_MS) {
    // First request or window has expired — start a fresh window
    store.set(ip, { count: 1, windowStart: now });
    return true;
  }

  if (record.count >= MAX_REQUESTS) {
    // Too many requests in this window
    return false;
  }

  // Increment count within the current window
  record.count += 1;
  return true;
}