import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS } from "./constants";
import { getEnv } from "./env";

function firstForwarded(forwarded: string): string | undefined {
  const part = forwarded.split(",")[0]?.trim();
  return part || undefined;
}

export function getClientIp(request: NextRequest): string {
  const { TRUST_PROXY } = getEnv();
  if (TRUST_PROXY) {
    const xff = request.headers.get("x-forwarded-for");
    if (xff) {
      const ip = firstForwarded(xff);
      if (ip) return ip;
    }
    const realIp = request.headers.get("x-real-ip")?.trim();
    if (realIp) return realIp;
  }
  const vercel = request.headers.get("x-vercel-forwarded-for");
  if (vercel) {
    const ip = firstForwarded(vercel);
    if (ip) return ip;
  }
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export function checkRateLimit(
  key: string,
  max: number,
  windowMs: number,
): { ok: true; remaining: number; resetSec: number } | { ok: false; resetSec: number } {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || now >= b.resetAt) {
    b = { count: 0, resetAt: now + windowMs };
    buckets.set(key, b);
  }
  const resetSec = Math.ceil(b.resetAt / 1000);
  if (b.count >= max) {
    return { ok: false, resetSec };
  }
  b.count += 1;
  const remaining = Math.max(0, max - b.count);
  return { ok: true, remaining, resetSec };
}

export function applyRateLimitHeaders(
  res: NextResponse,
  max: number,
  remaining: number,
  resetSec: number,
): void {
  res.headers.set("RateLimit-Limit", String(max));
  res.headers.set("RateLimit-Remaining", String(remaining));
  res.headers.set("RateLimit-Reset", String(resetSec));
}

export function rateLimitResponse(
  resetSec: number,
  message = "Too many requests",
): NextResponse {
  const res = NextResponse.json({ error: message }, { status: 429 });
  const retryAfter = Math.max(1, resetSec - Math.floor(Date.now() / 1000));
  res.headers.set("Retry-After", String(retryAfter));
  return res;
}

type RateLimitOk = { remaining: number; resetSec: number };

export async function runAfterRateLimitOk(
  rl: RateLimitOk,
  handler: () => Promise<NextResponse>,
): Promise<NextResponse> {
  const res = await handler();
  applyRateLimitHeaders(res, RATE_LIMIT_MAX, rl.remaining, rl.resetSec);
  return res;
}

export async function runWithRateLimitKey(
  rateLimitKey: string,
  handler: () => Promise<NextResponse>,
): Promise<NextResponse> {
  const rl = checkRateLimit(
    rateLimitKey,
    RATE_LIMIT_MAX,
    RATE_LIMIT_WINDOW_MS,
  );
  if (!rl.ok) return rateLimitResponse(rl.resetSec);
  return runAfterRateLimitOk(rl, handler);
}

export async function withRateLimit(
  request: NextRequest,
  keyPrefix: string,
  handler: () => Promise<NextResponse>,
): Promise<NextResponse> {
  const ip = getClientIp(request);
  return runWithRateLimitKey(`${keyPrefix}:${ip}`, handler);
}
