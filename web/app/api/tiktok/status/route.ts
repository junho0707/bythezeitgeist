import { NextRequest, NextResponse } from "next/server";
import { getTikTokSession, tiktokApi } from "@/lib/tiktok";

export const runtime = "nodejs";

/** Where a post is: PROCESSING_UPLOAD / PROCESSING_DOWNLOAD / PUBLISH_COMPLETE / FAILED. */
export async function POST(req: NextRequest) {
  const s = await getTikTokSession();
  if (!s) return NextResponse.json({ error: "Not connected to TikTok." }, { status: 401 });
  const { publishId } = await req.json();
  try {
    const d = await tiktokApi<{ status: string; fail_reason?: string }>("/post/publish/status/fetch/", s.accessToken, {
      publish_id: publishId,
    });
    return NextResponse.json(d);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
