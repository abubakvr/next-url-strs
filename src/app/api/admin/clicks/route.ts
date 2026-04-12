import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { parseBoundedLimit, runAdminGet } from "@/lib/admin";
import { toIsoTimestamp, withDb } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return runAdminGet(request, async () => {
    const { searchParams } = new URL(request.url);
    const limit = parseBoundedLimit(searchParams.get("limit"), 100, 200);

    const rows = await withDb(async (pool) => {
      const { rows: r } = await pool.query(
        `SELECT ce.created_at AS created_at, ce.ip AS ip, ce.user_agent AS user_agent,
                l.code AS code, l.long_url AS long_url
         FROM click_events ce
         JOIN links l ON l.id = ce.link_id
         ORDER BY ce.id DESC
         LIMIT $1`,
        [limit],
      );
      return r as {
        created_at: unknown;
        ip: string | null;
        user_agent: string | null;
        code: string;
        long_url: string;
      }[];
    });

    return NextResponse.json({
      items: rows.map((r) => ({
        createdAt: toIsoTimestamp(r.created_at),
        ip: r.ip,
        userAgent: r.user_agent,
        code: r.code,
        longUrl: r.long_url,
      })),
    });
  });
}
