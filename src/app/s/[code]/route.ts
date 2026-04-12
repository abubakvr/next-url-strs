import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getLinkByCode, recordRedirectAndIncrement } from "@/lib/db";
import { getClientIp, withRateLimit } from "@/lib/rate-limit";
import { getSafeRedirectUrl } from "@/lib/url";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ code: string }> };

export async function GET(request: NextRequest, ctx: Ctx) {
  return withRateLimit(request, "redirect", async () => {
    const ip = getClientIp(request);
    const { code } = await ctx.params;
    const link = await getLinkByCode(code);
    if (!link) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const target = getSafeRedirectUrl(link.long_url);
    if (!target) {
      return NextResponse.json(
        { error: "Invalid redirect target" },
        { status: 410 },
      );
    }

    const ua = request.headers.get("user-agent");
    await recordRedirectAndIncrement(link.id, ip, ua);

    return NextResponse.redirect(target, 302);
  });
}
