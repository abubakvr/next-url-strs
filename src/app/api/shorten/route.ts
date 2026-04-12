import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { insertLink, linkJson } from "@/lib/db";
import { MAX_JSON_BODY_BYTES } from "@/lib/constants";
import { withRateLimit } from "@/lib/rate-limit";
import { assertUrlAllowedForShortening, UrlValidationError } from "@/lib/url";

export const runtime = "nodejs";

const BodySchema = z.object({
  url: z.string(),
});

export async function POST(request: NextRequest) {
  return withRateLimit(request, "shorten", async () => {
    const cl = request.headers.get("content-length");
    if (cl && Number(cl) > MAX_JSON_BODY_BYTES) {
      return NextResponse.json({ error: "Request body too large" }, { status: 413 });
    }

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Expected { \"url\": string }" },
        { status: 400 },
      );
    }

    let normalized: string;
    try {
      normalized = assertUrlAllowedForShortening(parsed.data.url);
    } catch (e) {
      if (e instanceof UrlValidationError) {
        return NextResponse.json({ error: e.message }, { status: e.status });
      }
      throw e;
    }

    const { row, created } = await insertLink(normalized);
    return NextResponse.json({
      ...linkJson(row),
      isDuplicate: !created,
    });
  });
}
