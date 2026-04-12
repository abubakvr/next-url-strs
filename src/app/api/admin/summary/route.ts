import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { runAdminGet } from "@/lib/admin";
import { withDb } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return runAdminGet(request, async () => {
    const { linkCount, clickCount } = await withDb(async (pool) => {
      const [linksRes, clicksRes] = await Promise.all([
        pool.query<{ c: string }>(`SELECT COUNT(*)::text AS c FROM links`),
        pool.query<{ c: string }>(`SELECT COUNT(*)::text AS c FROM click_events`),
      ]);
      return {
        linkCount: Number(linksRes.rows[0]?.c ?? 0),
        clickCount: Number(clicksRes.rows[0]?.c ?? 0),
      };
    });

    return NextResponse.json({
      linkCount,
      clickCount,
    });
  });
}
