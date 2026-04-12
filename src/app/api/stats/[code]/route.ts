import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getLinkByCode } from "@/lib/db";
import { withRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ code: string }> };

export async function GET(request: NextRequest, ctx: Ctx) {
  return withRateLimit(request, "stats", async () => {
    const { code } = await ctx.params;
    const row = await getLinkByCode(code);

    if (!row) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({
      code: row.code,
      clickCount: row.click_count,
      createdAt: new Date(row.created_at * 1000).toISOString(),
    });
  });
}
