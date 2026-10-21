import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { TIKTOK_SCOPES, redirectUri, tiktokConfig } from "@/lib/tiktok";

export const runtime = "nodejs";

/** Off to TikTok's sign-in; it comes back to /api/tiktok/callback. */
export async function GET(req: NextRequest) {
  const cfg = tiktokConfig();
  if (!cfg) return NextResponse.json({ error: "TikTok isn't set up." }, { status: 404 });
  const state = randomBytes(16).toString("hex");
  const url = new URL("https://www.tiktok.com/v2/auth/authorize/");
  url.search = new URLSearchParams({
    client_key: cfg.key,
    scope: TIKTOK_SCOPES,
    response_type: "code",
    redirect_uri: redirectUri(req.nextUrl.origin),
    state,
  }).toString();
  const res = NextResponse.redirect(url);
  res.cookies.set("zg_tiktok_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });
  return res;
}
