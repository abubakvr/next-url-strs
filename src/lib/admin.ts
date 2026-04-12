import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS } from "./constants";
import { getEnv } from "./env";
import {
  checkRateLimit,
  getClientIp,
  rateLimitResponse,
  runAfterRateLimitOk,
} from "./rate-limit";

export function parseBoundedLimit(
  raw: string | null,
  defaultVal: number,
  cap: number,
): number {
  const n = Number(raw);
  const base = Number.isFinite(n) && n >= 1 ? Math.floor(n) : defaultVal;
  return Math.min(cap, Math.max(1, base));
}

export function parseNonNegativeOffset(raw: string | null): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

// Bearer or X-Admin-Token; plain string compare (demo).
export function requireAdmin(
  request: NextRequest,
): NextResponse | { ok: true } {
  const token = getEnv().ADMIN_TOKEN;
  const auth = request.headers.get("authorization");
  let bearer: string | null = null;
  if (auth?.toLowerCase().startsWith("bearer ")) {
    bearer = auth.slice(7).trim();
  }
  const headerToken = request.headers.get("x-admin-token")?.trim();
  const provided = bearer || headerToken;
  if (!provided || provided !== token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return { ok: true };
}

export async function runAdminGet(
  request: NextRequest,
  handler: (req: NextRequest) => Promise<NextResponse>,
): Promise<NextResponse> {
  const ip = getClientIp(request);
  const rl = checkRateLimit(
    `admin:${ip}`,
    RATE_LIMIT_MAX,
    RATE_LIMIT_WINDOW_MS,
  );
  if (!rl.ok) return rateLimitResponse(rl.resetSec);
  const auth = requireAdmin(request);
  if (auth instanceof NextResponse) return auth;
  return runAfterRateLimitOk(rl, () => handler(request));
}
