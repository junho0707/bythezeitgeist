import { NextResponse } from "next/server";
import { getTikTokSession, tiktokApi } from "@/lib/tiktok";

export const runtime = "nodejs";

export type CreatorInfo = {
  creator_avatar_url: string;
  creator_username: string;
  creator_nickname: string;
  privacy_level_options: string[];
  comment_disabled: boolean;
  duet_disabled: boolean;
  stitch_disabled: boolean;
  max_video_post_duration_sec: number;
};

/** Who is connected and what they may post, fetched fresh each time the page opens. */
export async function GET() {
  const s = await getTikTokSession();
  if (!s) return NextResponse.json({ error: "Not connected to TikTok." }, { status: 401 });
  try {
    return NextResponse.json(await tiktokApi<CreatorInfo>("/post/publish/creator_info/query/", s.accessToken, {}));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
