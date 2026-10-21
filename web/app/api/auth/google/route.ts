import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/** Off to Google's sign-in; the callback comes back to /api/auth/google/callback. */
export async function GET(req: NextRequest) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return NextResponse.json({ error: "Google sign-in isn't set up." }, { status: 404 });
  const state = randomBytes(16).toString("hex");
  // Back to the page the reader was on, never another site.
  const back = req.nextUrl.searchParams.get("next") ?? "/";
  const next = back.startsWith("/") && !back.startsWith("//") ? back : "/";
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${req.nextUrl.origin}/api/auth/google/callback`,
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  }).toString();
  const res = NextResponse.redirect(url);
  const cookie = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: 600 };
  res.cookies.set("zg_oauth_state", state, cookie);
  res.cookies.set("zg_oauth_next", next, cookie);
  return res;
}
