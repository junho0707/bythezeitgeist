import { NextRequest, NextResponse } from "next/server";
import { createUser, findUserByEmail, setSessionCookie } from "@/lib/auth";

export const runtime = "nodejs";

type IdToken = { aud?: string; email?: string; email_verified?: boolean; name?: string };

/** Google sends the reader back here: sign in the account with that email, or make one. */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const state = req.cookies.get("zg_oauth_state")?.value;
  const next = req.cookies.get("zg_oauth_next")?.value ?? "/";
  const fail = (why: string) => {
    console.error("[auth] google:", why);
    return NextResponse.redirect(new URL(`${next}${next.includes("?") ? "&" : "?"}signin=failed`, req.nextUrl.origin));
  };
  if (!state || params.get("state") !== state || !params.get("code")) return fail("bad state");

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: params.get("code")!,
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      redirect_uri: `${req.nextUrl.origin}/api/auth/google/callback`,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) return fail(`token HTTP ${res.status}`);
  const { id_token } = (await res.json()) as { id_token?: string };
  // Straight from Google over TLS, so the token needn't be signature-checked.
  let claims: IdToken;
  try {
    claims = JSON.parse(Buffer.from(id_token!.split(".")[1], "base64url").toString());
  } catch {
    return fail("bad id_token");
  }
  if (claims.aud !== process.env.GOOGLE_CLIENT_ID || !claims.email || !claims.email_verified) {
    return fail("unverified email");
  }

  const email = claims.email.toLowerCase();
  const row = await findUserByEmail(email);
  const user = row
    ? { id: row.id, email: row.email, displayName: row.display_name }
    : await createUser({
        email,
        passwordHash: "",
        displayName: (claims.name ?? email.split("@")[0]).slice(0, 32),
      });
  await setSessionCookie(user);
  const out = NextResponse.redirect(new URL(next, req.nextUrl.origin));
  out.cookies.delete("zg_oauth_state");
  out.cookies.delete("zg_oauth_next");
  return out;
}
