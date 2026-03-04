import { createHash } from "crypto";
import { NextRequest } from "next/server";

interface RateLimitEntry {
  timestamps: number[];
}

const store = new Map<string, RateLimitEntry>();

// Auto-cleanup expired entries every 60 seconds
let cleanupInterval: ReturnType<typeof setInterval> | null = null;

function ensureCleanup() {
  if (cleanupInterval) return;
  cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      // Remove entries where all timestamps are older than 10 minutes
      const recent = entry.timestamps.filter((t) => now - t < 600_000);
      if (recent.length === 0) {
        store.delete(key);
      } else {
        entry.timestamps = recent;
      }
    }
  }, 60_000);
  // Allow the process to exit even if interval is running
  if (cleanupInterval && typeof cleanupInterval === "object" && "unref" in cleanupInterval) {
    cleanupInterval.unref();
  }
}

/**
 * Sliding-window rate limiter using an in-memory Map.
 *
 * @param key         Unique key for the rate limit bucket (e.g. hashed IP + endpoint)
 * @param maxRequests Maximum number of requests allowed in the window
 * @param windowMs    Window duration in milliseconds
 * @returns           { allowed, remaining, resetMs }
 */
export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): { allowed: boolean; remaining: number; resetMs: number } {
  ensureCleanup();

  const now = Date.now();
  const windowStart = now - windowMs;

  let entry = store.get(key);
  if (!entry) {
    entry = { timestamps: [] };
    store.set(key, entry);
  }

  // Remove timestamps outside the current window
  entry.timestamps = entry.timestamps.filter((t) => t > windowStart);

  if (entry.timestamps.length >= maxRequests) {
    // Rate limit exceeded
    const oldestInWindow = entry.timestamps[0];
    const resetMs = oldestInWindow + windowMs - now;
    return {
      allowed: false,
      remaining: 0,
      resetMs: Math.max(resetMs, 0),
    };
  }

  // Allow the request
  entry.timestamps.push(now);
  return {
    allowed: true,
    remaining: maxRequests - entry.timestamps.length,
    resetMs: windowMs,
  };
}

/**
 * Extract a hashed IP key from a Next.js request for use with rate limiting.
 */
export function getIpKey(request: NextRequest, prefix: string): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  const ip = forwarded?.split(",")[0]?.trim() || realIp || "unknown";
  const hash = createHash("sha256").update(ip).digest("hex").slice(0, 16);
  return `${prefix}:${hash}`;
}
