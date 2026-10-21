import { NextRequest, NextResponse } from "next/server";
import { getTikTokSession, stagedVideos, tiktokApi } from "@/lib/tiktok";
import type { CreatorInfo } from "../creator/route";

export const runtime = "nodejs";
export const maxDuration = 300;

type PostBody = {
  id: string;
  caption: string;
  privacyLevel: string;
  allowComment: boolean;
  allowDuet: boolean;
  allowStitch: boolean;
  yourBrand: boolean;
  brandedContent: boolean;
};

const CHUNK = 10_000_000; // TikTok: 5-64 MB per chunk; the last one takes the remainder

/**
 * Direct Post of one staged video: the owner's choices from the page go to
 * TikTok as-is, and the file is sent from our storage with FILE_UPLOAD.
 */
export async function POST(req: NextRequest) {
  const s = await getTikTokSession();
  if (!s) return NextResponse.json({ error: "Not connected to TikTok." }, { status: 401 });
  const b = (await req.json()) as PostBody;

  const video = (await stagedVideos()).find((v) => v.id === b.id);
  if (!video) return NextResponse.json({ error: "That video isn't available." }, { status: 404 });

  try {
    // Re-check what this creator may do right now, not what the page saw earlier.
    const c = await tiktokApi<CreatorInfo>("/post/publish/creator_info/query/", s.accessToken, {});
    if (!c.privacy_level_options.includes(b.privacyLevel)) throw new Error("Pick who can view this video.");
    if (b.brandedContent && b.privacyLevel === "SELF_ONLY") throw new Error("Branded content can't be private.");
    if (video.duration > c.max_video_post_duration_sec) throw new Error("This video is longer than your account allows.");

    const file = await fetch(video.video, { cache: "no-store" });
    if (!file.ok) throw new Error("Couldn't read the video file.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const size = bytes.length;
    const chunkSize = size < 5_000_000 ? size : CHUNK;
    const chunks = Math.max(1, Math.floor(size / chunkSize));

    const init = await tiktokApi<{ publish_id: string; upload_url: string }>("/post/publish/video/init/", s.accessToken, {
      post_info: {
        title: b.caption.slice(0, 2200),
        privacy_level: b.privacyLevel,
        disable_comment: c.comment_disabled || !b.allowComment,
        disable_duet: c.duet_disabled || !b.allowDuet,
        disable_stitch: c.stitch_disabled || !b.allowStitch,
        brand_organic_toggle: b.yourBrand,
        brand_content_toggle: b.brandedContent,
      },
      source_info: { source: "FILE_UPLOAD", video_size: size, chunk_size: chunkSize, total_chunk_count: chunks },
    });

    for (let i = 0; i < chunks; i++) {
      const start = i * chunkSize;
      const end = i === chunks - 1 ? size : start + chunkSize;
      const put = await fetch(init.upload_url, {
        method: "PUT",
        headers: {
          "content-type": "video/mp4",
          "content-length": String(end - start),
          "content-range": `bytes ${start}-${end - 1}/${size}`,
        },
        body: bytes.subarray(start, end),
      });
      if (!put.ok) throw new Error(`Upload failed (${put.status}).`);
    }
    return NextResponse.json({ publishId: init.publish_id });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
