// Stages a finished Zeitgeist video for bythezeitgeist.com/tiktok, which lists
// tiktok/index.json and posts from there.
//
//   node --env-file=../../web/.env.local stage-video.mjs <episode-dir>
//
// <episode-dir> is a content_creatoin episode (zeitgeist-content/midday_2026-09-27)
// with <name>.mp4, cover.png and post.json. Keeps the newest KEEP videos.
// Needs BLOB_READ_WRITE_TOKEN.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { del, list, put } from "@vercel/blob";

const KEEP = 12;
const FFMPEG = process.env.FFMPEG ?? path.join(os.homedir(), "content_creatoin/shorts/node_modules/ffmpeg-static/ffmpeg");

const dir = path.resolve(process.argv[2] ?? "");
const id = path.basename(dir);
const mp4 = path.join(dir, `${id}.mp4`);
if (!fs.existsSync(mp4) || !fs.existsSync(path.join(dir, "post.json"))) {
  console.error(`usage: stage-video.mjs <episode-dir>  (needs ${id}.mp4 and post.json)`);
  process.exit(1);
}

const post = JSON.parse(fs.readFileSync(path.join(dir, "post.json"), "utf8"));
const script = JSON.parse(fs.readFileSync(path.join(dir, "script.json"), "utf8"));
// ffmpeg with no output file exits non-zero but still prints the duration.
const probe = (() => {
  try {
    execFileSync(FFMPEG, ["-hide_banner", "-i", mp4], { stdio: "pipe" });
    return "";
  } catch (e) {
    return String(e.stderr);
  }
})();
const [, h, m, s] = /Duration: (\d+):(\d+):([\d.]+)/.exec(probe) ?? [];
const duration = Math.ceil(Number(h) * 3600 + Number(m) * 60 + Number(s));

// TikTok caption: the Instagram one, which already has the list, the question and tags.
const caption = (post.instagram?.caption ?? post.youtube?.title ?? "").replace(" (link in bio)", "");
const title = post.youtube?.title?.split(":")[0] ?? `${script.name}`;

const opts = { access: "public", addRandomSuffix: false, allowOverwrite: true };
const video = await put(`tiktok/${id}.mp4`, fs.readFileSync(mp4), { ...opts, contentType: "video/mp4" });
let cover = null;
if (fs.existsSync(path.join(dir, "cover.png"))) {
  const jpg = path.join(os.tmpdir(), `${id}-cover.jpg`);
  execFileSync(FFMPEG, ["-loglevel", "error", "-y", "-i", path.join(dir, "cover.png"), "-vf", "scale=540:-1", "-q:v", "4", jpg]);
  cover = (await put(`tiktok/${id}.jpg`, fs.readFileSync(jpg), { ...opts, contentType: "image/jpeg" })).url;
}

const entry = { id, title, caption, video: video.url, cover, size: fs.statSync(mp4).size, duration };
await put(`tiktok/${id}.json`, JSON.stringify(entry), { ...opts, contentType: "application/json", cacheControlMaxAge: 60 });

// The index is rebuilt from the per-video files each time (a re-read index.json
// can be a cached copy and would drop a video staged a moment ago).
const metas = (await list({ prefix: "tiktok/" })).blobs.filter((b) => b.pathname.endsWith(".json") && b.pathname !== "tiktok/index.json");
const videos = (
  await Promise.all(
    metas.map(async (b) => (b.pathname === `tiktok/${id}.json` ? entry : (await fetch(b.url, { cache: "no-store" })).json())),
  )
).sort((a, b) => (b.id.slice(-10) + order(b.id)).localeCompare(a.id.slice(-10) + order(a.id)));
const dropped = videos.slice(KEEP);
await put("tiktok/index.json", JSON.stringify({ updated_at: new Date().toISOString(), videos: videos.slice(0, KEEP) }), {
  ...opts,
  contentType: "application/json",
  cacheControlMaxAge: 60,
});
if (dropped.length) await del(dropped.flatMap((v) => [v.video, v.cover, v.video.replace(/\.mp4$/, ".json")].filter(Boolean)));
console.log(`[tiktok] staged ${id} (${(entry.size / 1e6).toFixed(1)} MB, ${duration}s); ${Math.min(videos.length, KEEP)} listed`);

// Same-day order: yesterday, morning, midday, evening, weekly, monthly.
function order(vid) {
  return String(["yesterday", "morning", "midday", "evening", "weekly", "monthly"].indexOf(vid.split("_")[0]));
}
