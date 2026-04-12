import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  parseBoundedLimit,
  parseNonNegativeOffset,
  runAdminGet,
} from "@/lib/admin";
import { toIsoTimestamp, withDb } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return runAdminGet(request, async () => {
    const { searchParams } = new URL(request.url);
    const limit = parseBoundedLimit(searchParams.get("limit"), 100, 500);
    const offset = parseNonNegativeOffset(searchParams.get("offset"));

    const rows = await withDb(async (pool) => {
      const { rows: r } = await pool.query(
        `SELECT code, long_url, click_count, created_at
         FROM links
         ORDER BY id DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset],
      );
      return r as {
        code: string;
        long_url: string;
        click_count: number;
        created_at: unknown;
      }[];
    });

    return NextResponse.json({
      items: rows.map((r) => ({
        code: r.code,
        longUrl: r.long_url,
        clickCount: r.click_count,
        createdAt: toIsoTimestamp(r.created_at),
      })),
      limit,
      offset,
    });
  });
}
