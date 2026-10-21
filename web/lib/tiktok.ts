import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { EncryptJWT, jwtDecrypt } from "jose";

/*
 * TikTok Login Kit + Content Posting API, for posting our own videos to the
 * connected TikTok account from /tiktok. The TikTok token lives only in an
 * encrypted, httpOnly cookie; nothing is stored server-side.
 */

const COOKIE = "zg_tiktok";
export const TIKTOK_SCOPES = "user.info.basic,video.publish";
const API = "https://open.tiktokapis.com/v2";

export type TikTokSession = { accessToken: string; openId: string; expiresAt: number };

export type StagedVideo = {
  id: string; // "midday_2026-09-27"
  title: string; // "Midday Update, Sep 27"
  caption: string; // default TikTok caption, editable on the page
  video: string; // public URL of the mp4 (Vercel Blob)
  cover: string | null;
  size: number;
  duration: number; // seconds
};

export function tiktokConfig() {
  const key = process.env.TIKTOK_CLIENT_KEY;
  const secret = process.env.TIKTOK_CLIENT_SECRET;
  return key && secret ? { key, secret } : null;
}

export function redirectUri(origin: string) {
  return `${origin}/api/tiktok/callback`;
}

function key() {
  const raw = process.env.AUTH_SECRET;
  if (!raw) throw new Error("AUTH_SECRET is not set");
  return createHash("sha256").update(`tiktok:${raw}`).digest();
}

export async function setTikTokSession(s: TikTokSession) {
  const token = await new EncryptJWT({ ...s })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setExpirationTime(Math.floor(s.expiresAt / 1000))
    .encrypt(key());
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.max(60, Math.floor((s.expiresAt - Date.now()) / 1000)),
  });
}

export async function getTikTokSession(): Promise<TikTokSession | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtDecrypt(token, key());
    return { accessToken: String(payload.accessToken), openId: String(payload.openId), expiresAt: Number(payload.expiresAt) };
  } catch {
    return null;
  }
}

export async function clearTikTokSession() {
  (await cookies()).delete(COOKIE);
}

/** A Content Posting API call. TikTok wraps every reply as {data, error: {code: "ok"|...}}. */
export async function tiktokApi<T>(path: string, token: string, body: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json; charset=UTF-8" },
    body: JSON.stringify(body ?? {}),
    cache: "no-store",
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || (j.error && j.error.code !== "ok")) {
    throw new Error(j.error?.message || j.error?.code || `TikTok ${res.status}`);
  }
  return j.data as T;
}

/** Videos the pipeline staged for TikTok (zeitgeist/blob/stage-video.mjs), newest first. */
export async function stagedVideos(): Promise<StagedVideo[]> {
  const base = process.env.DATA_URL?.replace(/\/+$/, "");
  if (!base) return [];
  const res = await fetch(`${base}/tiktok/index.json?t=${Math.floor(Date.now() / 60000)}`, { cache: "no-store" });
  if (!res.ok) return [];
  const j = await res.json();
  return Array.isArray(j.videos) ? j.videos : [];
}
