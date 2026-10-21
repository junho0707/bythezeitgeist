import { NextRequest, NextResponse } from "next/server";
import { redirectUri, setTikTokSession, tiktokConfig } from "@/lib/tiktok";

export const runtime = "nodejs";

/** TikTok sends the account owner back here with a code; swap it for a token. */
export async function GET(req: NextRequest) {
  const back = (msg?: string) => {
    const url = new URL("/tiktok", req.nextUrl.origin);
    if (msg) url.searchParams.set("error", msg);
    const res = NextResponse.redirect(url);
    res.cookies.delete("zg_tiktok_state");
    return res;
  };
  const cfg = tiktokConfig();
  if (!cfg) return back("TikTok isn't set up.");
  const p = req.nextUrl.searchParams;
  if (p.get("error")) return back(p.get("error_description") || "TikTok sign-in was cancelled.");
  const code = p.get("code");
  if (!code || p.get("state") !== req.cookies.get("zg_tiktok_state")?.value) return back("Sign-in expired. Try again.");

  const res = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_key: cfg.key,
      client_secret: cfg.secret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri(req.nextUrl.origin),
    }),
    cache: "no-store",
  });
  const t = await res.json().catch(() => ({}));
  if (!res.ok || !t.access_token) return back(t.error_description || "TikTok sign-in failed.");
  if (!String(t.scope ?? "").includes("video.publish")) return back("Posting permission wasn't granted.");

  await setTikTokSession({
    accessToken: t.access_token,
    openId: t.open_id,
    expiresAt: Date.now() + Number(t.expires_in ?? 86400) * 1000,
  });
  return back();
}
